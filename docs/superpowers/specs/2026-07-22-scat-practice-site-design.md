# SCAT Practice Site — Design

Date: 2026-07-22. Approved by Meninder in conversation; this document records the approved design.

## Goal

A free, password-gated website where three children practice short-form SCAT-style exams. Sittings stay short (8 verbal + 8 quantitative, 8–12 minutes) so the kids don't lose interest. The site emails their parent when a sitting is completed, adapts difficulty to each child, and automatically generates new verified questions when the bank runs low.

## Children and levels

Level follows SCAT registration rules (grade at time of testing), per the existing authoring spec.

| Child | Rising grade | SCAT level | Starting challenge tier |
|---|---|---|---|
| Krish (he/him) | 8th | Advanced | 2 of 3 (mid) |
| Arya (she/her) | 6th | Advanced | 1 of 3 (bottom) |
| Kira (she/her) | 4th | Intermediate | 2 of 3 (mid) |

Krish and Arya share the Advanced question bank but have fully separate progress, calibration, and history.

## Architecture

Three pieces, all free:

1. **Static site** on GitHub Pages (public repo). One-page app built on the existing 662-line engine from `scat-practice.html` (timer, choice shuffling, review screen, print stylesheet are kept).
2. **Google Apps Script webhook** under Meninder's Google account. Receives completion POSTs; sends the email; logs to a Google Sheet; triggers regeneration when a bank runs low.
3. **GitHub Action** that authors new question sets with the Claude API, verifies them offline, and commits them. GitHub Pages redeploys automatically.

## The site

### Entry flow
1. **PIN gate** — a short family PIN, checked client-side (stored as a salted SHA-256 hash in the app config). Entered once per device, remembered in localStorage. This keeps strangers out of the app and the webhook out of spam range; it is not cryptographic secrecy — the public repo remains readable, which is acceptable for practice questions.
2. **Profile picker** — Krish / Arya / Kira, each showing streak and current challenge levels.

### Sittings (replaces fixed "Set 1–6")
- Every bank item carries a difficulty tier `d` (1–3 within its level) and a skill tag (analogy relationship, or quant concept).
- A sitting is assembled per child: 8 verbal + 8 quantitative, mostly at the child's current tier per strand, plus 2–3 probe questions one tier up, minus questions already seen (except scheduled review items, below).
- Quant assembly respects the authoring spec's key-spread rule (spread across A/B/C, roughly one D) at assembly time.

### Calibration ladder (per child, per strand — verbal and quant move independently)
- Strand score ≥7/8 → that strand's challenge level moves up (celebrated in-app: "Verbal moved up to challenge level 3!").
- ≤4/8 → moves down, silently — the next sitting is simply more comfortable. Down-shifts are never announced.
- 5–6/8 → holds. This is the intended stretch zone.
- Levels are bounded 1–3. At tier 3, sustained ≥7/8 is celebrated as mastery ("performing at the top of the Advanced range") rather than shifting further.

### Missed-question review
- Items answered wrong enter a per-child review queue and reappear 2–4 sittings later (choices reshuffled, different position).
- A former miss answered correctly is called out: "You've now beaten N questions that beat you before." Cleared items leave the queue; a second miss re-queues it.

### Encouragement layer
- Streaks counted in sittings per week (target cadence ~4/week), personal bests, and a mastery view by skill tag so improvement is visible.
- Score framing follows the authoring spec's philosophy: the test is above grade level, 10/16 is presented as strong; no raw percentages as the headline.

### Persistence
- All per-child state (history, calibration levels, seen/review queues, streaks) lives in localStorage under per-child keys (`window.storage` shim from the samples is dropped). One device per child is the expected pattern; the Google Sheet is the cross-device permanent record.

### Completion POST
On finishing a sitting, the site POSTs JSON to the Apps Script URL: shared secret token, child, date, strand scores, time, per-question results (question text, given answer, correct answer, explanation for misses), current calibration levels, and remaining-unseen counts per tier. Failure to POST (offline) is non-blocking: results still shown and stored locally, POST retried on next visit.

## Question bank

- `data/advanced.json` and `data/intermediate.json`, loaded by the app at startup — the generation pipeline appends without touching app code.
- Item schema extends the existing spec format: verbal `{a,b,c,ch,ans,why,d,skill,id}`, quant `{A,B,ctx?,ans,why,d,skill,id}`. `id` is a stable hash used by seen/review tracking.
- Initial bank authored by Claude (in this project, offline) and verified with the full protocol before launch: target ≥120 items per level spread across tiers, enough for several weeks at 4 sittings/week/child.
- All content rules of `SCAT-exam-authoring-spec.md` apply (relationship types, one near-miss distractor, fixed quant choices, D items must genuinely flip, explanation register and limits). The spec gains a section describing tiers and tags; the fixed "6 sets per file" structure is superseded by the tagged-pool model for this site (the three sample HTML files remain untouched).

## Apps Script webhook

- `doPost`: rejects requests without the shared token; appends a row per attempt to a Google Sheet; emails meninder.purewal@gmail.com a summary (child, scores framed per philosophy, time, missed questions with explanations, calibration levels and trend).
- If the POST reports fewer than ~3 sittings' worth of unseen questions at the child's current tiers, it fires a GitHub `repository_dispatch` (PAT stored server-side in Script Properties, never in the client) naming the level and tiers that are low.
- Setup is a one-time ~5-minute paste at script.google.com; this project delivers the exact code and step-by-step instructions.

## Generation Action

- Triggers: `repository_dispatch` (bank low), `workflow_dispatch` (manual), monthly cron (safety net — tops up any tier below threshold).
- Steps:
  1. Claude authors new items for the named level/tiers from the authoring spec (ANTHROPIC_API_KEY repo secret).
  2. **Independent verification pass**: a second Claude call, seeing only question text (not the claimed answers), emits machine-checkable expressions; Python evaluates them with exact arithmetic (`fractions.Fraction`) and compares to the claimed keys. D items are domain-swept to prove the comparison actually flips. Disagreement kills the item.
  3. Structural audit (adapted `audit_scat.py` for the JSON schema): counts, malformed choices, key spread, `ctx` on D items, explanation length, duplicates against the entire existing bank.
  4. Only fully verified items are appended and committed; failures are dropped and logged in the Action summary. Pages redeploys automatically.

## Security summary

- Family PIN (hashed) gates the app UI.
- Shared secret token gates the webhook (prevents email spam / sheet pollution).
- GitHub PAT lives only in Apps Script Properties; Anthropic key lives only in GitHub Actions secrets. Nothing sensitive in the public repo.
- Kids' data exposure: first names only in the public repo; scores go only to localStorage, the private Sheet, and email.

## Verification before launch

- Full authoring-spec protocol on the initial bank (arithmetic recompute, D-item sweeps, structural audit).
- Unit-style checks for the calibration ladder and assembly rules (run in Node during build/CI).
- End-to-end dry run: take a sitting locally, confirm email arrives, Sheet row appended, and a forced low-bank condition triggers the Action.

## Needed from Meninder during build

1. Family PIN choice.
2. `gh` CLI authenticated to the GitHub account (repo will be created as `scat-practice`, public).
3. Anthropic API key → GitHub Actions secret.
4. ~5 minutes to paste the Apps Script code and authorize it, and to create a GitHub PAT for the dispatch trigger.
