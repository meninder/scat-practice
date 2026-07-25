# SCAT Practice

Adaptive, short-form [SCAT](https://cty.jhu.edu/talent/tests/scat) practice for three kids — Krish, Arya, and Kira. A PIN-gated static site where each kid takes ~10-minute adaptive sittings; completions email the parent and log to a Google Sheet; a GitHub Action writes and independently verifies new questions when a bank runs low.

**Live:** https://meninder.github.io/scat-practice/site/ (family PIN required)

> New here? Read this file for the map, then **[docs/HANDOFF.md](docs/HANDOFF.md)** for current status, gotchas, and the operational runbook.

---

## What it does

- **Adaptive difficulty.** Each kid has a challenge tier (1–3) per strand (verbal / quant), moving independently. Score ≥7/8 in a strand → tier up (celebrated); ≤4/8 → tier down (silent, never announced); 5–6 holds. The test is deliberately above grade level, so scores are framed as "stretch zone," never as a percentage.
- **Sittings.** 8 verbal analogies + 8 quantitative comparisons, assembled per-kid: mostly current tier, 2 "probe" questions one tier up, plus any due review items. No repeats until the unseen pool is exhausted.
- **Review loop.** Missed questions come back a few sittings later; beating a former miss is celebrated ("you beat N questions that beat you before").
- **Encouragement.** Streaks (sittings/week), personal bests, per-skill mastery view.
- **Parent email + log.** Every completed sitting POSTs to a Google Apps Script webhook → emails the parent (score, tiers, missed questions with explanations) and appends a row to a "SCAT Log" Google Sheet.
- **Self-refilling banks.** When a kid's current-tier pool runs low, the webhook triggers a GitHub Action that authors new questions with Claude, **independently re-verifies every answer**, structurally audits them, and commits only what passes.

## Levels (SCAT registration rule: grade at time of testing)

| Kid | Rising grade | Level | Bank | Start tier (v/q) |
|---|---|---|---|---|
| Krish | 8th | Advanced | `site/data/advanced.json` | 2 / 2 |
| Arya | 6th | Advanced | `site/data/advanced.json` | 1 / 1 |
| Kira | 4th | Intermediate | `site/data/intermediate.json` | 2 / 2 |

Krish and Arya share the Advanced bank but have fully separate progress.

---

## Repository map

```
site/                     The web app (GitHub Pages serves from /site)
  index.html              Shell + all CSS (adapted from the original scat-practice.html)
  app.js                  UI, sitting flow, scoring, storage, webhook POST queue (ES module)
  calibration.js          PURE logic: the ladder + sitting assembly. No DOM. Unit-tested.
  config.js               Kids, PIN hash, webhook URL. NO secrets (see gotchas).
  data/
    advanced.json         120+ tagged items (Krish & Arya)
    intermediate.json     120+ tagged items (Kira)

tools/                    Python (managed by uv), used locally AND by the Action
  audit_bank.py           Structural auditor (counts, dupes, key spread, D-needs-ctx, ...)
  checks_runner.py        Re-derives every quant answer with sympy; proves D items flip
  strip_bank.py           Emits a bank with answers removed (for blind verification)
  generate/
    resolve_request.py    Normalizes the 3 Action triggers into a work list
    generate.py           Claude authors candidate questions
    independent_check.py  A SECOND Claude call (sees no answers) re-solves; sympy compares; survivors merge

tests/                    node --test (calibration) + pytest (python tools)
apps-script/
  Code.gs                 The webhook (email + Sheet + regen trigger). Pasted into script.google.com.
  SETUP.md                One-time setup walkthrough for the parent
.github/workflows/
  generate.yml            The self-refill pipeline
docs/
  HANDOFF.md              ⭐ Status, gotchas, runbook — read this to pick the work back up
  tiers.md                What each difficulty tier means (used by authors + generation prompt)
  superpowers/specs/      The approved design
  superpowers/plans/      The full task-by-task implementation plan

SCAT-exam-authoring-spec.md   The content bible: how to write good questions (rules for
                              analogies, quant comparisons, explanations, and known traps)
scat-practice*.html           The ORIGINAL three single-file apps this project grew from.
                              Kept for reference; the live app is site/, not these.
```

## Everyday tasks

All Python runs through **uv** (never pip/conda):

```bash
# Run the app locally (note: some browser extensions block 127.0.0.1 — use the live site if so)
python3 -m http.server 8000 -d site      # then open http://localhost:8000

# Full test suite
uv run pytest -q && node --test tests/calibration.test.mjs

# Verify a question bank is structurally sound
uv run python tools/audit_bank.py site/data/advanced.json --report

# Independently re-check a bank's answers (see docs/HANDOFF.md for the blind-verify flow)
uv run python tools/strip_bank.py site/data/advanced.json > /tmp/stripped.json
# ...author checks from /tmp/stripped.json, then:
uv run python tools/checks_runner.py site/data/advanced.json /tmp/checks.json

# Manually trigger question generation (needs ANTHROPIC_API_KEY secret set in the repo)
gh workflow run generate.yml -f level=intermediate -f 'needs=[{"strand":"v","tier":2,"count":4}]'
```

## The one rule for content

Anything that touches question content — writing questions by hand or via the generator — must follow **[SCAT-exam-authoring-spec.md](SCAT-exam-authoring-spec.md)** and land tiered per **[docs/tiers.md](docs/tiers.md)**. Nothing ships without passing `audit_bank.py` **and** independent answer verification. A wrong answer key actively teaches the wrong thing, and no kid will catch it — this is the project's cardinal rule.
