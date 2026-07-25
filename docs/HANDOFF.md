# Handoff — status, gotchas, runbook

Last updated: 2026-07-24. This is the "pick it back up later" doc. Read [README.md](../README.md) first for the map.

---

## Status: shipped and working

The site is **live, deployed, and in use**: https://meninder.github.io/scat-practice/site/

Confirmed working end-to-end (not just in theory):

- ✅ Full app flow, tested live in-browser: PIN gate → profile pick → adaptive 16-question sitting → scoring → level-up celebration → silent down-shift → review queue → results/review screen.
- ✅ Both question banks (240 questions total) **blind-verified** — a separate solver that never saw the answer keys re-derived all 240 and agreed.
- ✅ Parent email + Google Sheet logging, confirmed with a real sitting on the live site.
- ✅ Self-refill pipeline, confirmed with a real Action run that authored 6 questions, independently verified them, and committed the survivors.
- ✅ Both webhook-robustness fixes from the final review are in and deployed.

### Not done / deliberately deferred

| Item | Why it's not done | Where |
|---|---|---|
| **Full auto-regen chain not fired end-to-end** | The *workflow* is proven (manual dispatch run committed real questions). The *trigger path* — a low bank → Apps Script `repository_dispatch` → workflow — was never fired as one chain because it costs API credits. Needs `GH_PAT` + `GH_REPO` set in Apps Script Script Properties. | `apps-script/Code.gs` `triggerGeneration`, `apps-script/SETUP.md` step 3 |
| **Monthly cron regenerates unconditionally** | ~48 questions/month even if banks are full. Integrity-safe, pure cost. Left as-is by choice. | `tools/generate/resolve_request.py` `monthly_needs()` |
| **Low-bank threshold is tight** | `LOW_THRESHOLD=10` ≈ 1.5 sittings of headroom; the spec intended ~3. Harmless because assembly's LRU fallback means a bank never actually runs dry. Consider raising to ~18. | `site/calibration.js` |
| **One-device-per-child** | Progress lives in `localStorage`. A kid switching devices resets local history (the Google Sheet keeps the permanent record). Fine for now; would need a sync backend to fix. | by design |
| **Print stylesheet has a dead selector** | The old `@media print` rule still references `#start`, which no longer exists. Harmless (unmatched selector). | `site/index.html` |

None of the above blocks the kids using the site today.

---

## Gotchas (the things that will bite you)

1. **The live app is `site/`, not the root `scat-practice*.html` files.** Those three single-file apps are the *originals* this project grew from. They're kept for reference and are untouched. Don't confuse them for the current app.

2. **GitHub Pages serves from `/site`.** The live URL is `.../scat-practice/site/`, not `.../scat-practice/`. All `fetch` paths in `app.js` are relative (`data/…`), so this works — but if you move files, keep them under `site/`.

3. **`config.js` holds no secret — on purpose.** A static site can't hide a secret. The webhook token is **derived from the family PIN** at unlock (`sha256(pinSalt + PIN + ":webhook")`) and kept only in `localStorage`. The PIN itself is stored only as a salted hash (`pinHash`). If a secret scanner ever flags this repo, check what it found — it should be nothing that matters. **If you change the PIN, you must also update `SCAT_TOKEN` in Apps Script** to the new derived value (see runbook).

4. **The webhook always returns HTTP 200.** `Code.gs` signals failure via a JSON body `{ok:false}`, not an HTTP error code. `app.js` `flushPending` checks the body, not just the status — don't "simplify" it back to `if(!r.ok)` or failed posts (bad token, rate-limited) get silently dropped.

5. **Apps Script needs a *new version* deploy to take code changes.** Editing `Code.gs` in the editor isn't enough. Deploy → Manage deployments → pencil → Version: New version → Deploy. The `/exec` URL stays the same.

6. **Python is uv-only.** `uv run …`, `uv add …`. No pip, no conda.

7. **The generation API calls must stream.** The Anthropic SDK requires streaming for long requests at the `max_tokens` used here. `generate.py`/`independent_check.py` use `client.messages.stream(...)`. Don't switch them back to `messages.create()` or the Action fails with a streaming-required error.

8. **Item IDs are content hashes.** `id = "<t>-" + sha256(normalized stem)[:8]` (`audit_bank.py::item_id`). This is how dedupe and seen/review tracking work. Changing a question's stem changes its ID (and resets its seen/review state); changing only its explanation does not.

9. **`localStorage` state has no migration layer.** `loadState` returns the parsed object as-is. If you add a new field to the state shape, either bump the store-key version (`scat_<id>_v1` → `_v2`, which resets kids' history) or add default-merging to `loadState`, or a returning user's `finish()` can hit an undefined field.

10. **The bank is the source of difficulty, not the code.** "Too hard / too easy" is almost always a content problem (tier tagging or item quality), fixed by editing `site/data/*.json` per the authoring spec — not by touching `calibration.js`.

---

## Runbook

### Change the family PIN
1. Compute the new hash: `printf 'scat-purewal-2026<NEWPIN>' | shasum -a 256` → put in `pinHash` in `site/config.js`.
2. Compute the new webhook token: `printf 'scat-purewal-2026<NEWPIN>:webhook' | shasum -a 256`.
3. In Apps Script → Project Settings → Script Properties, set `SCAT_TOKEN` to that token value.
4. Commit + push `config.js`. Kids re-enter the new PIN once per device.

### Add / fix questions by hand
1. Edit `site/data/<level>.json` following `SCAT-exam-authoring-spec.md` and `docs/tiers.md`. Leave `id` as `""`.
2. Fill IDs: `uv run python -c "import json; from tools.audit_bank import item_id; b=json.load(open('site/data/<level>.json')); [i.update(id=item_id(i)) for i in b['items']]; json.dump(b, open('site/data/<level>.json','w'), ensure_ascii=False, indent=1)"`
3. `uv run python tools/audit_bank.py site/data/<level>.json --report` → must exit 0.
4. **Independently verify answers** (the important part):
   - `uv run python tools/strip_bank.py site/data/<level>.json > /tmp/stripped.json`
   - Have a solver that has NOT seen the answers produce a checks file from `/tmp/stripped.json` (format is documented in `tools/checks_runner.py` and the spec's verification section): `{id: {"kind":"const"|"sweep"|"verbal", ...}}`.
   - `uv run python tools/checks_runner.py site/data/<level>.json /tmp/checks.json` → must report all items confirmed. Fix any disagreement (usually the item, sometimes an ambiguous distractor).
5. Commit + push.

### Trigger question generation manually
```bash
gh workflow run generate.yml -f level=intermediate -f 'needs=[{"strand":"v","tier":2,"count":4},{"strand":"q","tier":2,"count":4}]'
gh run watch $(gh run list --workflow=generate.yml -L1 --json databaseId --jq '.[0].databaseId')
```
Requires the `ANTHROPIC_API_KEY` repo secret. The Action authors → blind-verifies → audits → commits only survivors, then Pages redeploys.

### Re-run the automated tests
```bash
uv run pytest -q && node --test tests/calibration.test.mjs
```

### Where the external pieces live
- **Apps Script project** (the webhook): script.google.com, under the parent's Google account. Source of truth is `apps-script/Code.gs`; the deployed copy must be re-pasted + re-versioned when that file changes.
- **SCAT Log sheet:** a Google Sheet in the parent's Drive; its ID is in the Apps Script `SHEET_ID` property.
- **Secrets:** `ANTHROPIC_API_KEY` → GitHub repo secret. `SCAT_TOKEN`, `SHEET_ID`, `GH_PAT`, `GH_REPO` → Apps Script Script Properties. None are in the repo.

---

## How this was built

Design → plan → task-by-task execution with a code review after every task and a whole-branch review at the end. The full paper trail:
- **Design/spec:** `docs/superpowers/specs/2026-07-22-scat-practice-site-design.md`
- **Implementation plan:** `docs/superpowers/plans/2026-07-22-scat-practice-site.md` (has the complete intended code for every component)
- **Progress ledger:** `.superpowers/sdd/progress.md` (per-task completion notes + every deferred minor finding and its triage)
