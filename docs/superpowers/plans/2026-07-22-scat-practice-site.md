# SCAT Practice Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A PIN-gated GitHub Pages site where Krish, Arya, and Kira take adaptive 16-question SCAT sittings; completions email their parent via a Google Apps Script webhook, and a GitHub Action generates verified new questions when a child's bank runs low.

**Architecture:** Static one-page app (adapted from the existing `scat-practice.html` engine) + per-level JSON question banks + pure-JS calibration module (unit-tested with `node --test`) + Python verification tools (structural audit, independent arithmetic checks) + Apps Script webhook (email, Sheet log, `repository_dispatch`) + Actions workflow that authors and verifies new items with the Claude API.

**Tech Stack:** Vanilla JS (ES modules), Python 3.12 managed by **uv** (sympy, anthropic, pytest), Node 18+ built-in test runner, Google Apps Script, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-07-22-scat-practice-site-design.md` — authoritative for behavior. Content rules: `SCAT-exam-authoring-spec.md` sections 3–5 and 8.

## Global Constraints

- Python only via **uv** (`uv add`, `uv run`) — never pip or conda (user's global rule).
- Kids: Krish (he/him, rising 8th, advanced, start tiers v2/q2), Arya (she/her, rising 6th, advanced, start v1/q1), Kira (she/her, rising 4th, intermediate, start v2/q2).
- A sitting is always 8 verbal + 8 quantitative, 4 choices per question.
- Quant answer choices are fixed verbatim: "Quantity A is greater" / "Quantity B is greater" / "The two quantities are equal" / "Cannot be determined from the information given".
- Calibration ladder: strand score ≥7 → tier +1 (max 3, celebrated); ≤4 → tier −1 (min 1, silent); else hold. Verbal and quant move independently.
- Explanations ≤4 sentences; real Unicode math (`²`, `√`, `½`, `π`, `×`, `÷`, `−`); every `ans:"D"` quant item has a `ctx` and must genuinely flip.
- Down-shifts are never announced in kid-facing copy; no raw percentages as headline framing.
- Parent email: meninder.purewal@gmail.com. Repo: public, named `scat-practice`.
- Secrets live only in GitHub Actions secrets (ANTHROPIC_API_KEY) and Apps Script Script Properties (SCAT_TOKEN, SHEET_ID, GH_PAT, GH_REPO). The webhook token in `site/config.js` is deliberately low-stakes (anti-spam, not secrecy).
- Commit after every task; commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File Structure

```
site/index.html            app shell + styles (adapted from scat-practice.html)
site/config.js             kids, PIN hash, webhook URL, token
site/calibration.js        pure calibration/assembly logic (ES module, no DOM)
site/app.js                UI + engine + storage + POST queue (ES module)
site/data/advanced.json    tagged bank (Krish & Arya)
site/data/intermediate.json tagged bank (Kira)
tests/calibration.test.mjs node --test suite
tests/test_audit_bank.py   pytest suite
tests/test_checks_runner.py pytest suite
tools/audit_bank.py        structural auditor (JSON banks)
tools/checks_runner.py     independent answer verification (sympy)
tools/strip_bank.py        emits question text WITHOUT answers (for clean-context checking)
tools/generate/generate.py         Action: author candidate items via Claude API
tools/generate/independent_check.py Action: second-pass verification + merge
tools/generate/resolve_request.py  Action: normalize dispatch/manual/cron into a needs list
docs/tiers.md              tier definitions per level (used in prompts and by authors)
apps-script/Code.gs        webhook source (pasted into script.google.com)
apps-script/SETUP.md       one-time setup walkthrough for Meninder
.github/workflows/generate.yml
```

Bank item schema (extends the authoring spec's format):

```json
{"id":"v-1a2b3c4d","t":"v","d":2,"skill":"antonym","a":"expand","b":"contract","c":"ascend","ch":["descend","climb","rise","soar"],"ans":0,"why":"..."}
{"id":"q-5e6f7a8b","t":"q","d":1,"skill":"percent","A":"30% of 90","B":"25","ans":"A","why":"..."}
```

`id` = `<t>-` + first 8 hex of SHA-256 of the normalized stem (verbal: `a|b|c`; quant: `A|B|ctx`), lowercased, whitespace collapsed. `d` ∈ {1,2,3}. `skill` for verbal is the relationship name from the authoring spec table (kebab-case: `synonym`, `antonym`, `part-whole`, `tool-user`, `tool-action`, `maker-product`, `worker-workplace`, `category-member`, `intensity`, `cause-effect`, `object-material`, `instrument-measures`, `young-adult`, `animal-home`); for quant a concept slug (e.g. `percent`, `exponents`, `fractions`, `area-perimeter`, `averages`, `equations`, `factors-primes`, `order-of-ops`, `difference-of-squares`, `radicals`, `absolute-value`, `factorials`, `slope`, `circles`, `statistics`, `place-value`, `unit-conversion`).

Bank file shape: `{"level":"advanced","items":[ ... ]}`.

---

### Task 1: Project scaffold, uv env, GitHub repo + Pages

**Files:**
- Create: `pyproject.toml` (via uv), `.gitignore`, `README.md`, `site/data/.gitkeep`, `build/` (gitignored)

**Interfaces:**
- Produces: repo `scat-practice` on GitHub (public, Pages enabled from main branch root); local env where `uv run python`, `uv run pytest`, and `node --test` work.

- [ ] **Step 1: Scaffold dirs and uv project**

```bash
cd "/Users/meninderpurewal/My Drive/Mikey/Code/SCAT"
mkdir -p site/data tests tools/generate docs apps-script .github/workflows build
uv init --name scat-tools --no-package --python 3.12
uv add sympy anthropic
uv add --dev pytest
node --version   # need >=18 for node --test; if missing, tell Meninder to install Node
```

- [ ] **Step 2: Write `.gitignore`**

```
.venv/
__pycache__/
build/
.DS_Store
```

- [ ] **Step 3: Write `README.md`**

```markdown
# SCAT Practice

Adaptive short-form SCAT practice for Krish, Arya, and Kira.
- App: `site/` (GitHub Pages). Banks: `site/data/*.json`.
- Verify a bank: `uv run python tools/audit_bank.py site/data/advanced.json`
- Tests: `uv run pytest && node --test tests/`
- New questions are generated by `.github/workflows/generate.yml` and verified before commit.
- Webhook setup: `apps-script/SETUP.md`. Design: `docs/superpowers/specs/`.
```

- [ ] **Step 4: Create GitHub repo and enable Pages** (needs Meninder's gh auth — pause and ask if `gh auth status` fails)

```bash
gh auth status || echo "ASK MENINDER: run 'gh auth login' via ! prefix"
git add -A && git commit -m "Scaffold project (uv env, dirs, README)"
gh repo create scat-practice --public --source . --push
gh api -X POST "repos/{owner}/scat-practice/pages" -f build_type=legacy -f "source[branch]=main" -f "source[path]=/" || true
gh api "repos/{owner}/scat-practice/pages" --jq .html_url   # record the URL for Task 11
```

Expected: Pages URL like `https://<owner>.github.io/scat-practice/` (site will live at `.../site/`).

- [ ] **Step 5: Commit** (if anything uncommitted)

---

### Task 2: Calibration module (TDD)

**Files:**
- Create: `site/calibration.js`
- Test: `tests/calibration.test.mjs`

**Interfaces:**
- Produces (exact signatures, consumed by `site/app.js` in Task 8 and tests):
  - `updateLevel(level:int, score:int) -> int` (1..3)
  - `dueReviews(queue:[{id,dueAt}], sittingNo:int) -> [id]`
  - `updateReviewQueue(queue, results:[{id,correct}], sittingNo) -> {queue, beaten:[id]}`
  - `assembleStrand(pool:[item], state:{level,seen:{id:int},reviewQueue,sittingNo}, rng=Math.random) -> [item]` (length 8 when pool allows)
  - `quantSpreadOk(items) -> bool`; `assembleQuant(pool, state, rng) -> [item]`
  - `lowTiers(bank:[item], state:{levels:{v,q},seen}) -> [{strand,tier,unseen}]`
  - constants `STRAND_N=8`, `PROBES=2`, `LOW_THRESHOLD=10`

- [ ] **Step 1: Write the failing tests** — `tests/calibration.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {updateLevel, dueReviews, updateReviewQueue, assembleStrand, assembleQuant,
        quantSpreadOk, lowTiers, STRAND_N, LOW_THRESHOLD} from "../site/calibration.js";

// deterministic rng
const seeded = (seed=42) => () => (seed = (seed * 1103515245 + 12345) % 2**31) / 2**31;

const mkV = (n, d) => Array.from({length:n}, (_,i)=>({id:`v-${d}-${i}`, t:"v", d}));
const mkQ = (n, d, ans="A") => Array.from({length:n}, (_,i)=>({id:`q-${d}-${i}-${ans}`, t:"q", d, ans}));
const freshState = (level=2) => ({level, seen:{}, reviewQueue:[], sittingNo:1});

test("ladder: >=7 moves up, capped at 3", () => {
  assert.equal(updateLevel(2,7), 3);
  assert.equal(updateLevel(3,8), 3);
});
test("ladder: <=4 moves down silently, floored at 1", () => {
  assert.equal(updateLevel(2,4), 1);
  assert.equal(updateLevel(1,0), 1);
});
test("ladder: 5-6 holds", () => {
  assert.equal(updateLevel(2,5), 2);
  assert.equal(updateLevel(2,6), 2);
});
test("review queue: wrong answers due 2 sittings later; correct clears and reports beaten", () => {
  let {queue} = updateReviewQueue([], [{id:"a",correct:false},{id:"b",correct:true}], 3);
  assert.deepEqual(queue, [{id:"a", dueAt:5}]);
  assert.deepEqual(dueReviews(queue, 4), []);
  assert.deepEqual(dueReviews(queue, 5), ["a"]);
  const r2 = updateReviewQueue(queue, [{id:"a",correct:true}], 5);
  assert.deepEqual(r2.queue, []);
  assert.deepEqual(r2.beaten, ["a"]);
});
test("review queue: repeat miss re-schedules instead of duplicating", () => {
  let q = updateReviewQueue([{id:"a",dueAt:5}], [{id:"a",correct:false}], 5).queue;
  assert.deepEqual(q, [{id:"a", dueAt:7}]);
});
test("assembly: 8 items, mostly current tier, 2 probes one tier up, no repeats", () => {
  const pool = [...mkV(20,1), ...mkV(20,2), ...mkV(20,3)];
  const out = assembleStrand(pool, freshState(2), seeded());
  assert.equal(out.length, STRAND_N);
  assert.equal(new Set(out.map(i=>i.id)).size, STRAND_N);
  assert.equal(out.filter(i=>i.d===3).length, 2);   // probes
  assert.equal(out.filter(i=>i.d===2).length, 6);
});
test("assembly: due review items are included (max 2)", () => {
  const pool = [...mkV(20,2), ...mkV(20,3)];
  const st = {...freshState(2), sittingNo:5,
    seen:{"v-2-0":1,"v-2-1":1,"v-2-2":1},
    reviewQueue:[{id:"v-2-0",dueAt:5},{id:"v-2-1",dueAt:5},{id:"v-2-2",dueAt:5}]};
  const out = assembleStrand(pool, st, seeded());
  const revIn = out.filter(i=>["v-2-0","v-2-1","v-2-2"].includes(i.id));
  assert.equal(revIn.length, 2);
});
test("assembly: tier-3 kids probe within tier 3 and still get 8", () => {
  const pool = [...mkV(20,2), ...mkV(20,3)];
  const out = assembleStrand(pool, freshState(3), seeded());
  assert.equal(out.length, 8);
  assert.equal(out.filter(i=>i.d===3).length, 8);
});
test("assembly: exhausted tier falls back to other tiers then least-recently-seen", () => {
  const pool = [...mkV(4,2), ...mkV(3,3), ...mkV(3,1)];
  const st = freshState(2);
  const out = assembleStrand(pool, st, seeded());
  assert.equal(out.length, 8);                       // 10 unseen available, takes 8
  const seenAll = Object.fromEntries(pool.map((p,i)=>[p.id, i+1]));
  const out2 = assembleStrand(pool, {...freshState(2), seen:seenAll, sittingNo:11}, seeded());
  assert.equal(out2.length, 8);                      // reuses least-recently-seen
});
test("quant spread: <=2 D and >=2 distinct A/B/C keys", () => {
  assert.equal(quantSpreadOk(mkQ(8,2,"A")), false);
  assert.equal(quantSpreadOk([...mkQ(3,2,"A"),...mkQ(3,2,"B"),...mkQ(1,2,"C"),...mkQ(1,2,"D")]), true);
  assert.equal(quantSpreadOk([...mkQ(5,2,"A"),...mkQ(3,2,"D")]), false);
});
test("assembleQuant satisfies spread when the pool allows it", () => {
  const pool = [...mkQ(10,2,"A"), ...mkQ(10,2,"B"), ...mkQ(6,2,"C"), ...mkQ(4,2,"D"),
                ...mkQ(5,3,"A"), ...mkQ(5,3,"B")];
  const out = assembleQuant(pool, freshState(2), seeded());
  assert.equal(out.length, 8);
  assert.ok(quantSpreadOk(out));
});
test("lowTiers flags a strand whose current-tier unseen pool dips below threshold", () => {
  const bank = [...mkV(LOW_THRESHOLD-1, 2), ...mkQ(LOW_THRESHOLD+5, 2, "A")];
  const low = lowTiers(bank, {levels:{v:2,q:2}, seen:{}});
  assert.deepEqual(low, [{strand:"v", tier:2, unseen:LOW_THRESHOLD-1}]);
});
```

- [ ] **Step 2: Run to verify failure** — `node --test tests/` → all fail with module not found.
- [ ] **Step 3: Implement `site/calibration.js`:**

```js
// Pure calibration + sitting-assembly logic. No DOM, no storage — shared by app and tests.
export const STRAND_N = 8;
export const PROBES = 2;
export const LOW_THRESHOLD = 10;

export function updateLevel(level, score){
  if(score >= 7) return Math.min(3, level + 1);
  if(score <= 4) return Math.max(1, level - 1);
  return level;
}

export function dueReviews(queue, sittingNo){
  return queue.filter(r => r.dueAt <= sittingNo).map(r => r.id);
}

export function updateReviewQueue(queue, results, sittingNo){
  const next = [...queue], beaten = [];
  for(const r of results){
    const i = next.findIndex(e => e.id === r.id);
    if(r.correct){
      if(i >= 0){ next.splice(i, 1); beaten.push(r.id); }
    }else{
      const entry = {id: r.id, dueAt: sittingNo + 2};
      if(i >= 0) next[i] = entry; else next.push(entry);
    }
  }
  return {queue: next, beaten};
}

function shuffle(arr, rng){
  const c = [...arr];
  for(let i = c.length - 1; i > 0; i--){
    const j = Math.floor(rng() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}

export function assembleStrand(pool, state, rng = Math.random){
  const {level, seen, reviewQueue, sittingNo} = state;
  const byId = new Map(pool.map(it => [it.id, it]));
  const picked = [], used = new Set();
  const take = it => { picked.push(it); used.add(it.id); };
  const unseenAt = d => shuffle(pool.filter(it => it.d === d && !(it.id in seen) && !used.has(it.id)), rng);

  for(const id of dueReviews(reviewQueue, sittingNo).slice(0, 2)){
    const it = byId.get(id);
    if(it) take(it);
  }
  const probeTier = Math.min(3, level + 1);
  for(const it of unseenAt(probeTier).slice(0, PROBES)) take(it);
  for(const it of unseenAt(level)){ if(picked.length >= STRAND_N) break; take(it); }
  if(picked.length < STRAND_N){
    const others = [probeTier, level - 1, level + 1, level - 2, level + 2]
      .filter((d, i, a) => d >= 1 && d <= 3 && d !== level && a.indexOf(d) === i);
    for(const d of others){
      for(const it of unseenAt(d)){ if(picked.length >= STRAND_N) break; take(it); }
      if(picked.length >= STRAND_N) break;
    }
  }
  if(picked.length < STRAND_N){
    const lru = pool.filter(it => !used.has(it.id)).sort((x, y) => (seen[x.id] || 0) - (seen[y.id] || 0));
    for(const it of lru){ if(picked.length >= STRAND_N) break; take(it); }
  }
  return shuffle(picked, rng).slice(0, STRAND_N);
}

export function quantSpreadOk(items){
  const keys = items.map(it => it.ans);
  const nD = keys.filter(k => k === "D").length;
  const abc = new Set(keys.filter(k => k !== "D"));
  return nD <= 2 && abc.size >= 2;
}

export function assembleQuant(pool, state, rng = Math.random){
  let last = [];
  for(let i = 0; i < 30; i++){
    last = assembleStrand(pool, state, rng);
    if(quantSpreadOk(last)) return last;
  }
  return last;
}

export function lowTiers(bank, state){
  const low = [];
  for(const strand of ["v", "q"]){
    const tier = state.levels[strand === "v" ? "v" : "q"];
    const unseen = bank.filter(it => it.t === strand && it.d === tier && !(it.id in state.seen)).length;
    if(unseen < LOW_THRESHOLD) low.push({strand, tier, unseen});
  }
  return low;
}
```

- [ ] **Step 4: Run to verify pass** — `node --test tests/` → all pass.
- [ ] **Step 5: Commit** — `git add site/calibration.js tests/calibration.test.mjs && git commit -m "feat: calibration ladder, review queue, adaptive sitting assembly"`

---

### Task 3: Structural bank auditor (TDD)

**Files:**
- Create: `tools/audit_bank.py`
- Test: `tests/test_audit_bank.py`

**Interfaces:**
- Produces CLI: `uv run python tools/audit_bank.py <bank.json> [--report]` — exit 0 iff clean; `--report` prints per-tier/strand counts and key spread. Also importable: `audit(bank: dict) -> list[str]` (list of violation strings) and `item_id(item: dict) -> str` (canonical id, reused by generators).

- [ ] **Step 1: Write failing tests** — `tests/test_audit_bank.py`:

```python
import copy, json, subprocess, sys
from tools.audit_bank import audit, item_id

GOOD_V = {"id":"", "t":"v", "d":2, "skill":"antonym", "a":"expand", "b":"contract",
          "c":"ascend", "ch":["descend","climb","rise","soar"], "ans":0,
          "why":"Antonym pair: to expand is to grow and to contract is to shrink. To ascend is to go up, so its opposite is descend. 'Climb' is a near-synonym trap."}
GOOD_Q = {"id":"", "t":"q", "d":1, "skill":"percent", "A":"30% of 90", "B":"25", "ans":"A",
          "why":"30% of 90 = 27, which is larger than 25. Quantity A is greater."}
GOOD_D = {"id":"", "t":"q", "d":2, "skill":"equations", "A":"x²", "B":"x",
          "ctx":"x is a real number", "ans":"D",
          "why":"If x = 2 then x² > x, but if x = ½ then x² < x. The comparison flips, so it cannot be determined."}

def bank(items):
    items = copy.deepcopy(items)
    for it in items:
        it["id"] = item_id(it)
    return {"level": "intermediate", "items": items}

def test_clean_bank_passes():
    assert audit(bank([GOOD_V, GOOD_Q, GOOD_D])) == []

def test_ids_are_stable_and_prefixed():
    assert item_id(GOOD_V).startswith("v-") and len(item_id(GOOD_V)) == 10
    assert item_id(GOOD_Q) == item_id({**GOOD_Q, "why": "different"})  # id ignores non-stem fields

def test_duplicate_stems_flagged():
    errs = audit(bank([GOOD_V, GOOD_V]))
    assert any("duplicate" in e for e in errs)

def test_d_without_ctx_flagged():
    bad = {**GOOD_D}; bad.pop("ctx")
    assert any("ctx" in e for e in audit(bank([bad])))

def test_bad_choice_lists_flagged():
    assert any("choices" in e for e in audit(bank([{**GOOD_V, "ch": ["a","a","b","c"]}])))
    assert any("choices" in e for e in audit(bank([{**GOOD_V, "ch": ["a","b","c"]}])))

def test_long_explanation_flagged():
    bad = {**GOOD_Q, "why": "One. Two. Three. Four. Five."}
    assert any("sentences" in e for e in audit(bank([bad])))

def test_factorial_bang_not_a_sentence_end():
    ok = {**GOOD_Q, "why": "Compute 7!/5! = 42. That is greater than 40. Quantity A is greater."}
    assert audit(bank([ok])) == []

def test_key_monoculture_flagged():
    items = [{**GOOD_Q, "A": f"{n} + 1", "B": str(n), "d": 1} for n in range(10)]
    errs = audit(bank(items))
    assert any("spread" in e for e in errs)

def test_bad_fields_flagged():
    assert any("ans" in e for e in audit(bank([{**GOOD_Q, "ans": "E"}])))
    assert any("tier" in e for e in audit(bank([{**GOOD_V, "d": 4}])))

def test_cli_exit_codes(tmp_path):
    p = tmp_path / "b.json"
    p.write_text(json.dumps(bank([GOOD_V, GOOD_Q, GOOD_D])))
    r = subprocess.run([sys.executable, "tools/audit_bank.py", str(p)], capture_output=True)
    assert r.returncode == 0
    p.write_text(json.dumps(bank([GOOD_V, GOOD_V])))
    r = subprocess.run([sys.executable, "tools/audit_bank.py", str(p)], capture_output=True)
    assert r.returncode == 1
```

- [ ] **Step 2: Run to verify failure** — `uv run pytest tests/test_audit_bank.py -q` → import error.
- [ ] **Step 3: Implement `tools/audit_bank.py`:**

```python
"""Structural auditor for site/data/*.json banks. Does NOT check arithmetic —
that is checks_runner.py / independent_check.py."""
import argparse, hashlib, json, re, sys
from collections import Counter

V_SKILLS = {"synonym","antonym","part-whole","tool-user","tool-action","maker-product",
            "worker-workplace","category-member","intensity","cause-effect","object-material",
            "instrument-measures","young-adult","animal-home"}
SENT_END = re.compile(r"[.?](?:\s|$)")   # '!' never ends a sentence (factorials)

def _norm(s):
    return re.sub(r"\s+", " ", s.strip().lower())

def item_id(it):
    stem = "|".join([it["a"], it["b"], it["c"]]) if it["t"] == "v" \
        else "|".join([it["A"], it["B"], it.get("ctx", "")])
    return f'{it["t"]}-{hashlib.sha256(_norm(stem).encode()).hexdigest()[:8]}'

def audit(bank):
    errs, stems, ids = [], Counter(), Counter()
    items = bank.get("items", [])
    if bank.get("level") not in ("advanced", "intermediate"):
        errs.append("bank: level must be advanced|intermediate")
    for n, it in enumerate(items):
        tag = f'item {n} ({it.get("id","?")})'
        t = it.get("t")
        if t not in ("v", "q"):
            errs.append(f"{tag}: t must be v|q"); continue
        if it.get("d") not in (1, 2, 3):
            errs.append(f"{tag}: tier d must be 1..3")
        if not it.get("skill") or (t == "v" and it["skill"] not in V_SKILLS):
            errs.append(f"{tag}: bad skill tag {it.get('skill')!r}")
        why = it.get("why", "")
        if not why:
            errs.append(f"{tag}: missing why")
        elif len(SENT_END.findall(why)) > 4:
            errs.append(f"{tag}: why exceeds 4 sentences")
        if t == "v":
            if not all(it.get(k) for k in ("a", "b", "c")):
                errs.append(f"{tag}: missing analogy words")
            ch = it.get("ch", [])
            if len(ch) != 4 or len({_norm(c) for c in ch}) != 4:
                errs.append(f"{tag}: choices must be 4 distinct entries")
            if it.get("ans") not in (0, 1, 2, 3):
                errs.append(f"{tag}: ans must be index 0..3")
        else:
            if not it.get("A") or not it.get("B"):
                errs.append(f"{tag}: missing quantities")
            if it.get("ans") not in ("A", "B", "C", "D"):
                errs.append(f"{tag}: ans must be letter A..D")
            if it.get("ans") == "D" and not it.get("ctx"):
                errs.append(f"{tag}: ans D requires a ctx condition")
        if "a" in it or "A" in it:
            ids[it.get("id")] += 1
            stems[item_id(it)] += 1
            if it.get("id") != item_id(it):
                errs.append(f"{tag}: id mismatch (expected {item_id(it)})")
    errs += [f"duplicate stem: {s} ×{c}" for s, c in stems.items() if c > 1]
    errs += [f"duplicate id: {s} ×{c}" for s, c in ids.items() if c > 1]
    # key spread per tier among quant items
    for d in (1, 2, 3):
        keys = [it["ans"] for it in items if it.get("t") == "q" and it.get("d") == d]
        if len(keys) >= 8:
            cnt = Counter(keys)
            if any(cnt[k] > len(keys) * 0.5 for k in "ABC") or not (0.05 <= cnt["D"] / len(keys) <= 0.25):
                errs.append(f"tier {d}: quant key spread off ({dict(cnt)})")
    return errs

def report(bank):
    for d in (1, 2, 3):
        v = sum(1 for i in bank["items"] if i["t"] == "v" and i["d"] == d)
        q = sum(1 for i in bank["items"] if i["t"] == "q" and i["d"] == d)
        keys = Counter(i["ans"] for i in bank["items"] if i["t"] == "q" and i["d"] == d)
        print(f"tier {d}: {v} verbal, {q} quant, keys {dict(keys)}")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("bank"); ap.add_argument("--report", action="store_true")
    args = ap.parse_args()
    bank = json.load(open(args.bank))
    if args.report:
        report(bank)
    errs = audit(bank)
    for e in errs:
        print("AUDIT:", e, file=sys.stderr)
    sys.exit(1 if errs else 0)
```

- [ ] **Step 4: Run to verify pass** — `uv run pytest tests/test_audit_bank.py -q` → all pass. (Add `tests/__init__.py`? Not needed — run pytest from repo root; add `[tool.pytest.ini_options] pythonpath = ["."]` to `pyproject.toml`.)
- [ ] **Step 5: Commit.**

---

### Task 4: Independent answer verification tools (TDD)

**Files:**
- Create: `tools/checks_runner.py`, `tools/strip_bank.py`
- Test: `tests/test_checks_runner.py`

**Interfaces:**
- `strip_bank.py <bank.json> > stripped.json` — items WITHOUT `ans`/`why`/`skill`/`d` (verbal: id,a,b,c,ch; quant: id,A,B,ctx). This is what a clean-context checker (subagent or API pass) sees.
- `checks_runner.py <bank.json> <checks.json>` — exit 0 iff every item's claimed answer is confirmed. Importable: `run_checks(bank_items: list, checks: dict) -> list[str]`.
- Checks file format (authored from the stripped file only):

```json
{"q-5e6f7a8b": {"kind":"const", "A":"Rational(30,100)*90", "B":"25"},
 "q-9c0d1e2f": {"kind":"sweep", "var":"x", "values":["2","Rational(1,2)","1","-3"], "A":"x**2", "B":"x"},
 "v-1a2b3c4d": {"kind":"verbal", "pick":0}}
```

- [ ] **Step 1: Write failing tests** — `tests/test_checks_runner.py`:

```python
from tools.checks_runner import run_checks

QA = {"id":"q1","t":"q","d":1,"A":"30% of 90","B":"25","ans":"A","why":"."}
QC = {"id":"q2","t":"q","d":1,"A":"7² − 3²","B":"(7−3)(7+3)","ans":"C","why":"."}
QD = {"id":"q3","t":"q","d":2,"A":"x²","B":"x","ctx":"x is a real number","ans":"D","why":"."}
V  = {"id":"v1","t":"v","d":1,"ans":2,"why":".","a":"a","b":"b","c":"c","ch":["w","x","y","z"]}

def test_const_confirms_and_refutes():
    assert run_checks([QA], {"q1":{"kind":"const","A":"Rational(30,100)*90","B":"25"}}) == []
    errs = run_checks([{**QA,"ans":"B"}], {"q1":{"kind":"const","A":"Rational(30,100)*90","B":"25"}})
    assert any("claimed B" in e and "computed A" in e for e in errs)

def test_equality_and_symbols():
    assert run_checks([QC], {"q2":{"kind":"const","A":"7**2 - 3**2","B":"(7-3)*(7+3)"}}) == []

def test_sweep_confirms_genuine_flip():
    ck = {"q3":{"kind":"sweep","var":"x","values":["2","Rational(1,2)","1"],"A":"x**2","B":"x"}}
    assert run_checks([QD], ck) == []

def test_sweep_refutes_fake_D():
    fake = {**QD, "A":"x + 1", "B":"x"}          # always A — not a real D
    ck = {"q3":{"kind":"sweep","var":"x","values":["2","Rational(1,2)","-3"],"A":"x + 1","B":"x"}}
    assert any("never flips" in e for e in run_checks([fake], ck))

def test_sweep_checks_definite_answers_across_domain():
    item = {**QD, "ans":"A"}                     # claims A but flips
    ck = {"q3":{"kind":"sweep","var":"x","values":["2","Rational(1,2)"],"A":"x**2","B":"x"}}
    assert any("does not hold" in e for e in run_checks([item], ck))

def test_verbal_pick_must_match():
    assert run_checks([V], {"v1":{"kind":"verbal","pick":2}}) == []
    assert any("verbal" in e for e in run_checks([V], {"v1":{"kind":"verbal","pick":1}}))

def test_missing_check_is_an_error():
    assert any("no check" in e for e in run_checks([QA], {}))
```

- [ ] **Step 2: Run to verify failure** — `uv run pytest tests/test_checks_runner.py -q`.
- [ ] **Step 3: Implement `tools/checks_runner.py`:**

```python
"""Confirms every bank item's claimed answer against independently authored checks.
Checks are written from the *stripped* bank (no answers visible) so agreement is evidence."""
import json, sys
import sympy
from sympy import Rational, sqrt, pi, factorial, Abs, Symbol

NS = {"Rational": Rational, "sqrt": sqrt, "pi": pi, "factorial": factorial, "Abs": Abs}

def _eval(expr, var=None, val=None):
    ns = dict(NS)
    if var is not None:
        ns[var] = val
    return sympy.sympify(expr, locals=ns)

def _truth(a, b):
    d = sympy.simplify(a - b)
    if d == 0: return "C"
    return "A" if d > 0 else "B"

def run_checks(items, checks):
    errs = []
    for it in items:
        cid, claimed = it["id"], it["ans"]
        ck = checks.get(cid)
        if ck is None:
            errs.append(f"{cid}: no check provided"); continue
        try:
            if ck["kind"] == "verbal":
                if ck["pick"] != claimed:
                    errs.append(f"{cid}: verbal checker picked {ck['pick']}, claimed {claimed}")
            elif ck["kind"] == "const":
                got = _truth(_eval(ck["A"]), _eval(ck["B"]))
                if got != claimed:
                    errs.append(f"{cid}: claimed {claimed}, computed {got}")
            elif ck["kind"] == "sweep":
                var = ck["var"]
                outcomes = set()
                for v in ck["values"]:
                    val = _eval(v)
                    x = Symbol(var)
                    a = sympy.sympify(ck["A"], locals={**NS, var: x}).subs(x, val)
                    b = sympy.sympify(ck["B"], locals={**NS, var: x}).subs(x, val)
                    outcomes.add(_truth(a, b))
                if claimed == "D":
                    if len(outcomes) < 2:
                        errs.append(f"{cid}: claimed D but comparison never flips ({outcomes})")
                elif outcomes != {claimed}:
                    errs.append(f"{cid}: claimed {claimed} does not hold across domain ({outcomes})")
            else:
                errs.append(f"{cid}: unknown check kind {ck['kind']!r}")
        except Exception as e:
            errs.append(f"{cid}: check failed to evaluate ({e})")
    return errs

if __name__ == "__main__":
    bank = json.load(open(sys.argv[1]))["items"]
    checks = json.load(open(sys.argv[2]))
    errs = run_checks(bank, checks)
    for e in errs:
        print("CHECK:", e, file=sys.stderr)
    print(f"{len(bank) - len(errs)}/{len(bank)} items confirmed")
    sys.exit(1 if errs else 0)
```

- [ ] **Step 4: Implement `tools/strip_bank.py`:**

```python
"""Emit a bank with all answer information removed, for clean-context verification."""
import json, sys

def strip(items):
    out = []
    for it in items:
        if it["t"] == "v":
            out.append({k: it[k] for k in ("id", "t", "a", "b", "c", "ch")})
        else:
            keep = {k: it[k] for k in ("id", "t", "A", "B")}
            if it.get("ctx"): keep["ctx"] = it["ctx"]
            out.append(keep)
    return out

if __name__ == "__main__":
    print(json.dumps(strip(json.load(open(sys.argv[1]))["items"]), ensure_ascii=False, indent=1))
```

- [ ] **Step 5: Run tests** — `uv run pytest -q` → all pass. **Commit.**

---

### Task 5: Tier definitions + Intermediate bank (Kira)

**Files:**
- Create: `docs/tiers.md`, `site/data/intermediate.json`, `build/intermediate.checks.json` (not committed)

**Interfaces:**
- Produces: `site/data/intermediate.json` with **120 items**: per tier (1,2,3) → 20 verbal + 20 quant. Passes `audit_bank.py` and `checks_runner.py`.

- [ ] **Step 1: Write `docs/tiers.md`:**

```markdown
# Challenge tiers

Tiers grade difficulty *within* a SCAT level. All content rules in
`SCAT-exam-authoring-spec.md` §3–5 apply unchanged; tiers only move the pitch.

## Intermediate (scored against 8th graders; taken by rising 4th–5th graders)
- **Tier 1 — grade 6 pitch.** Vocabulary a strong 5th grader can reason out
  (e.g. fragile, ripen, harbor). Quant: fraction/decimal comparison, perimeter,
  simple percent of a number, one-step equations.
- **Tier 2 — grade 7 pitch.** Vocabulary: e.g. reluctant, adjacent, diminish.
  Quant: percent vs fraction equivalence, exponents (squares/cubes), area vs
  perimeter traps, averages, order of operations.
- **Tier 3 — grade 8 pitch.** Vocabulary: e.g. candid, frugal, adversary.
  Quant: multi-idea comparisons (e.g. 25% of 80 vs 80% of 25), factors and
  primes, negative numbers, structural shortcuts over computation.

## Advanced (scored against 9th–12th graders; taken by rising 6th–8th graders)
- **Tier 1 — grade 9 pitch.** Vocabulary: e.g. abundant, hostile, novice.
  Quant: exponents, simple radicals, percent change, averages, absolute value.
- **Tier 2 — grades 10–11 pitch.** Vocabulary: e.g. pragmatic, austere, candor.
  Quant: difference of squares, factorial ratios, slope, circle area vs
  circumference, medians vs means, sign behavior under even/odd powers.
- **Tier 3 — grade 12 pitch.** Vocabulary: e.g. ephemeral, magnanimous, obfuscate.
  Quant: layered structural comparisons, exponent-rule chains, radicals vs
  rationals, worst-case "cannot be determined" constructions.

Per strand-tier key spread (quant): roughly 35% A, 35% B, 15% C, 15% D, and
every D must genuinely flip under its ctx.
```

- [ ] **Step 2: Author the bank.** Write `site/data/intermediate.json`: `{"level":"intermediate","items":[...]}` — 20 verbal + 20 quant per tier (120 total), following `SCAT-exam-authoring-spec.md` §3–5 and `docs/tiers.md`. Verbal: spread relationship types (no type >4 per strand-tier), one near-miss distractor each. Quant: key spread per tiers.md. Compute each `id` with `tools.audit_bank.item_id` (small throwaway script in `build/`). *(Subagent-driven execution: this authoring is one subagent's whole task; it must NOT also write the checks file.)*
- [ ] **Step 3: Structural audit** — `uv run python tools/audit_bank.py site/data/intermediate.json --report` → exit 0, counts 20/20 per tier.
- [ ] **Step 4: Independent checks by a clean context.** Run `uv run python tools/strip_bank.py site/data/intermediate.json > build/intermediate.stripped.json`. Dispatch a **fresh subagent that has NOT seen the bank** with only the stripped file, `docs/tiers.md`, and the checks-format description from Task 4; it writes `build/intermediate.checks.json` answering every item from scratch (verbal `pick`, quant sympy expressions; D-suspects as `sweep` with values spanning <1, >1, negative where the ctx allows).
- [ ] **Step 5: Run the runner** — `uv run python tools/checks_runner.py site/data/intermediate.json build/intermediate.checks.json` → `120/120 items confirmed`, exit 0. Any failure: fix the *item* (or the check if the check misread the question), re-run until clean. An item that can't be fixed is replaced.
- [ ] **Step 6: Commit** bank + tiers.md (not `build/`).

---

### Task 6: Advanced bank (Krish & Arya)

**Files:**
- Create: `site/data/advanced.json`, `build/advanced.checks.json` (not committed)

Same steps as Task 5 with `docs/tiers.md` Advanced tiers: author 120 items (20 v + 20 q per tier), audit, strip, clean-context checks, runner to `120/120 confirmed`, commit.

- [ ] Author `site/data/advanced.json` (may adapt the best items from the sample files' EXAMS arrays — recompute ids, retag with `d`/`skill`; never copy an item into the wrong tier).
- [ ] `uv run python tools/audit_bank.py site/data/advanced.json --report` → exit 0.
- [ ] Strip + clean-context checks + `uv run python tools/checks_runner.py ...` → `120/120 items confirmed`.
- [ ] Commit.

---

### Task 7: Site shell — index.html, config.js, PIN gate, profile picker

**Files:**
- Create: `site/index.html` (start from a copy of `scat-practice.html`), `site/config.js`

**Interfaces:**
- Produces DOM ids consumed by `site/app.js` (Task 8): sections `#gate #pick #home #test #results`; gate: `#pinInput #pinBtn #pinErr`; pick: `#kidGrid`; home: `#homeEyebrow #homeTitle #homeSub #levelRow #startBtn #switchBtn #histBox #masteryBox`; test/results ids unchanged from the sample (`#secTag #counter #timer #progFill #qhost #prevBtn #nextBtn #resEyebrow #resTitle #vScore #qScore #vPct #qPct #resMeta #celebrate #homeBtn #printBtn #reviewHost`).
- Produces `CONFIG` export (shape below).

- [ ] **Step 1:** `cp scat-practice.html site/index.html`, then edit `site/index.html`:
  - `<title>SCAT Practice — Purewal Family</title>`
  - Delete the whole inline `<script>…</script>` block (the sample's lines 239–660) and put before `</body>`: `<script type="module" src="./app.js"></script>`
  - Delete the `#retryBtn` button from results nav (adaptive sittings are never identical; retry is misleading).
  - Replace the entire `<section id="start">…</section>` block with:

```html
  <!-- ============ PIN GATE ============ -->
  <section id="gate">
    <div class="eyebrow">Purewal family</div>
    <h1>SCAT Practice</h1>
    <p class="sub">Short sittings. Big stretches.</p>
    <div class="pinbox">
      <input id="pinInput" type="password" inputmode="numeric" autocomplete="off" placeholder="Family PIN" aria-label="Family PIN">
      <button class="btn" id="pinBtn">Unlock</button>
    </div>
    <p class="pinerr" id="pinErr"></p>
  </section>

  <!-- ============ PROFILE PICKER ============ -->
  <section id="pick" class="hidden">
    <div class="eyebrow">Purewal family</div>
    <h1>Who's practicing?</h1>
    <div class="grid" id="kidGrid"></div>
    <p class="footnote">Questions are original, modeled on the SCAT format. Not affiliated with or endorsed by Johns Hopkins CTY.</p>
  </section>

  <!-- ============ HOME (per kid) ============ -->
  <section id="home" class="hidden">
    <div class="eyebrow" id="homeEyebrow"></div>
    <h1 id="homeTitle"></h1>
    <p class="sub" id="homeSub"></p>
    <div class="chips" id="levelRow"></div>
    <button class="btn start" id="startBtn">Start today's sitting</button>
    <div class="meta-row">
      <span><b>8</b> analogies + <b>8</b> comparisons</span>
      <span>about <b>8–12 minutes</b></span>
      <span>No penalty for guessing</span>
    </div>
    <div class="hist">
      <hr class="rule">
      <h3>Past sittings</h3>
      <div id="histBox"></div>
    </div>
    <div class="hist">
      <hr class="rule">
      <h3>Skills</h3>
      <div id="masteryBox"></div>
    </div>
    <button class="clear" id="switchBtn">Switch player</button>
  </section>
```

  - In the results section, insert `<div class="celebrate hidden" id="celebrate"></div>` immediately after `<h1 id="resTitle">Done</h1>`.
  - Append inside the `<style>` block:

```css
  .pinbox{display:flex;gap:10px;max-width:340px;margin-top:16px}
  .pinbox input{flex:1;border:1px solid var(--line);border-radius:12px;padding:12px 14px;font-size:18px;font-family:var(--mono);letter-spacing:.3em;background:var(--card)}
  .pinerr{color:var(--wrong);font-size:13px;min-height:18px}
  .chips{display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 16px}
  .chip{border:1px solid var(--line);background:var(--card);border-radius:999px;padding:6px 14px;font-size:13px}
  .chip b{color:var(--accent)}
  .btn.start{font-size:16px;padding:14px 26px}
  .celebrate{background:var(--card-2);border:1px solid var(--gold);border-radius:12px;padding:12px 16px;margin:10px 0;font-size:14.5px}
  .mrow{display:flex;justify-content:space-between;font-size:13.5px;padding:6px 2px;border-bottom:1px solid var(--line)}
  .mrow .mbar{color:var(--ink-soft);font-variant-numeric:tabular-nums}
```

- [ ] **Step 2: Write `site/config.js`:**

```js
export const CONFIG = {
  webhookUrl: "",            // Apps Script /exec URL — pasted in Task 9
  token: "",                 // must equal Script Property SCAT_TOKEN — set in Task 9
  pinSalt: "scat-purewal-2026",
  pinHash: "",               // sha256(pinSalt + PIN) hex — set in Task 11 with Meninder's PIN
  kids: [
    {id: "krish", name: "Krish", level: "advanced",     start: {v: 2, q: 2}},
    {id: "arya",  name: "Arya",  level: "advanced",     start: {v: 1, q: 1}},
    {id: "kira",  name: "Kira",  level: "intermediate", start: {v: 2, q: 2}},
  ],
};
```

For local testing now, set a temporary PIN of `1234`: `printf 'scat-purewal-20261234' | shasum -a 256` → paste hex into `pinHash`.

- [ ] **Step 3: Commit** (app.js doesn't exist yet; page won't function — fine mid-build).

---

### Task 8: App logic — sittings, results, calibration, storage, POST queue

**Files:**
- Create: `site/app.js`
- Modify: none

**Interfaces:**
- Consumes: `CONFIG` (Task 7), all calibration exports (Task 2), DOM ids (Task 7), bank JSON (Tasks 5–6).
- Produces: POST payload consumed by Apps Script (Task 9):

```json
{"token":"...","kid":"Krish","kidId":"krish","level":"advanced","ts":1753200000000,
 "v":6,"q":7,"sec":540,"levels":{"v":2,"q":3},"leveledUp":["Quantitative"],"beaten":1,
 "personalBest":true,
 "misses":[{"type":"Verbal","text":"expand : contract :: ascend : ?","your":"climb","correct":"descend","why":"..."}],
 "lowTiers":[{"strand":"q","tier":3,"unseen":8}]}
```

- [ ] **Step 1: Write `site/app.js` (complete file):**

```js
import {CONFIG} from "./config.js";
import {assembleStrand, assembleQuant, updateLevel, updateReviewQueue, lowTiers} from "./calibration.js";

const $ = s => document.querySelector(s);
const QUANT_CHOICES = [
  "Quantity A is greater", "Quantity B is greater",
  "The two quantities are equal", "Cannot be determined from the information given"];
const QI = {A: 0, B: 1, C: 2, D: 3};
const cap = s => s[0].toUpperCase() + s.slice(1);

let KID = null, BANK = null, S = null;
let SET = null, idx = 0, answers = [], t0 = 0, timerId = null, qTime = [], qStart = 0;

// ---------- per-kid persistent state ----------
const storeKey = id => `scat_${id}_v1`;
function loadState(kid){
  try{
    const raw = localStorage.getItem(storeKey(kid.id));
    if(raw) return JSON.parse(raw);
  }catch(e){}
  return {history: [], sittingNo: 0, levels: {...kid.start}, seen: {},
          reviewQueue: {v: [], q: []}, beaten: 0, skills: {}, pending: []};
}
function saveState(){ localStorage.setItem(storeKey(KID.id), JSON.stringify(S)); }

// ---------- PIN gate ----------
async function sha256hex(s){
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function tryPin(){
  const pin = $("#pinInput").value.trim();
  if(await sha256hex(CONFIG.pinSalt + pin) === CONFIG.pinHash){
    localStorage.setItem("scat_unlocked", CONFIG.pinHash);
    renderPick(); show("pick");
  }else{
    $("#pinErr").textContent = "That's not it — try again.";
    $("#pinInput").value = "";
  }
}

function show(id){
  ["gate", "pick", "home", "test", "results"].forEach(s =>
    $("#" + s).classList.toggle("hidden", s !== id));
  window.scrollTo(0, 0);
}

// ---------- profile picker ----------
const weekCount = st => st.history.filter(h => Date.now() - h.ts < 7 * 864e5).length;
function renderPick(){
  const host = $("#kidGrid"); host.innerHTML = "";
  CONFIG.kids.forEach(k => {
    const st = loadState(k);
    const sub = st.history.length
      ? `${st.history.length} sittings · ${weekCount(st)} this week`
      : "Ready for the first one";
    const b = document.createElement("button");
    b.className = "exam";
    b.innerHTML = `<span class="no">${k.name}</span><span class="lbl">${cap(k.level)} level</span><span class="done">${sub}</span>`;
    b.onclick = () => selectKid(k);
    host.appendChild(b);
  });
}

async function selectKid(k){
  KID = k; S = loadState(k);
  if(!BANK || BANK.level !== k.level){
    const res = await fetch(`data/${k.level}.json`, {cache: "no-cache"});
    BANK = await res.json();
  }
  flushPending();
  renderHome(); show("home");
}

// ---------- home ----------
function renderHome(){
  $("#homeEyebrow").textContent = `${cap(KID.level)} level · SCAT practice`;
  $("#homeTitle").textContent = `Hi, ${KID.name}`;
  const wk = weekCount(S);
  $("#homeSub").textContent = wk >= 4
    ? `${wk} sittings this week — target hit. Anything more is bonus.`
    : `${wk} of 4 sittings this week. Short and steady wins.`;
  $("#levelRow").innerHTML =
    `<span class="chip">Verbal challenge <b>level ${S.levels.v}</b>/3</span>` +
    `<span class="chip">Quant challenge <b>level ${S.levels.q}</b>/3</span>` +
    (S.beaten ? `<span class="chip">🏆 <b>${S.beaten}</b> comeback${S.beaten === 1 ? "" : "s"}</span>` : "");
  renderHistory(); renderMastery();
}
function renderHistory(){
  const box = $("#histBox");
  if(!S.history.length){
    box.innerHTML = `<div class="empty">No sittings yet. Finish one and it'll show up here so you can watch the trend.</div>`;
    return;
  }
  const rows = S.history.slice().reverse().slice(0, 12).map(h => {
    const d = new Date(h.ts);
    const mm = Math.floor(h.sec / 60), ss = String(h.sec % 60).padStart(2, "0");
    return `<tr><td>${d.getMonth() + 1}/${d.getDate()}</td><td class="score">${h.v}/8</td><td class="score">${h.q}/8</td><td class="score">${h.v + h.q}/16</td><td>${mm}:${ss}</td></tr>`;
  }).join("");
  box.innerHTML = `<table><thead><tr><th>Date</th><th>Verbal</th><th>Quant</th><th>Total</th><th>Time</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function renderMastery(){
  const box = $("#masteryBox");
  const entries = Object.entries(S.skills).filter(([, s]) => s.r + s.w >= 3)
    .map(([k, s]) => [k, s.r / (s.r + s.w), s.r + s.w])
    .sort((a, b) => b[1] - a[1]);
  if(!entries.length){
    box.innerHTML = `<div class="empty">After a few sittings you'll see which skills are strongest here.</div>`;
    return;
  }
  box.innerHTML = entries.slice(0, 8).map(([k, p, n]) =>
    `<div class="mrow"><span>${k.replace(/-/g, " ")}</span><span class="mbar">${"●".repeat(Math.round(p * 5)).padEnd(5, "○")} ${n} seen</span></div>`).join("");
}

// ---------- sitting ----------
function shuffleChoices(q){
  const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
  return {...q, ch: order.map(i => q.ch[i]), ans: order.indexOf(q.ans)};
}
function startSitting(){
  const sittingNo = S.sittingNo + 1;
  const vs = assembleStrand(BANK.items.filter(i => i.t === "v"),
    {level: S.levels.v, seen: S.seen, reviewQueue: S.reviewQueue.v, sittingNo}).map(shuffleChoices);
  const qs = assembleQuant(BANK.items.filter(i => i.t === "q"),
    {level: S.levels.q, seen: S.seen, reviewQueue: S.reviewQueue.q, sittingNo});
  SET = {questions: [...vs, ...qs], sittingNo};
  idx = 0; answers = new Array(SET.questions.length).fill(null);
  qTime = new Array(SET.questions.length).fill(0); qStart = 0;
  t0 = Date.now();
  if(timerId) clearInterval(timerId);
  timerId = setInterval(updateTimer, 1000); updateTimer();
  show("test"); renderQuestion();
}
function updateTimer(){
  const s = Math.floor((Date.now() - t0) / 1000);
  $("#timer").textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}
function commitTime(){ if(qStart){ qTime[idx] = (qTime[idx] || 0) + (Date.now() - qStart) / 1000; qStart = 0; } }

function renderQuestion(){
  const q = SET.questions[idx];
  const isV = q.t === "v";
  $("#secTag").textContent = isV ? "Verbal · Analogy" : "Quantitative · Comparison";
  $("#secTag").className = "sectiontag" + (isV ? "" : " q");
  $("#counter").textContent = `Question ${idx + 1} of ${SET.questions.length}`;
  $("#progFill").style.width = (100 * idx / SET.questions.length) + "%";
  const host = $("#qhost");
  host.innerHTML = isV
    ? `<div class="qcard fade">
        <div class="analogy"><span class="w">${q.a}</span><span class="sep">:</span><span class="w">${q.b}</span>
        <span class="sep">::</span><span class="w">${q.c}</span><span class="sep">:</span><span class="blank">?</span></div>
        <div class="qhint">Which word completes the analogy in the same way?</div>
        <div class="choices">${q.ch.map((c, i) => choiceHTML(i, c)).join("")}</div></div>`
    : `<div class="qcard fade">
        ${q.ctx ? `<div class="qcontext">${q.ctx}</div>` : ""}
        <div class="compare"><div class="col"><div class="lab">Quantity A</div><div class="val">${q.A}</div></div>
        <div class="vs">vs</div><div class="col"><div class="lab">Quantity B</div><div class="val">${q.B}</div></div></div>
        <div class="choices">${QUANT_CHOICES.map((c, i) => choiceHTML(i, c)).join("")}</div></div>`;
  host.querySelectorAll(".choice").forEach(el => {
    el.onclick = () => { answers[idx] = parseInt(el.dataset.i); markSelected(); };
  });
  markSelected();
  $("#prevBtn").disabled = idx === 0;
  const last = idx === SET.questions.length - 1;
  $("#nextBtn").textContent = last ? "Finish & score" : "Next";
  $("#nextBtn").className = "btn" + (last ? " finish" : "");
  qStart = Date.now();
}
function choiceHTML(i, label){
  return `<button class="choice" data-i="${i}"><span class="key">${i + 1}</span><span>${label}</span></button>`;
}
function markSelected(){
  document.querySelectorAll("#qhost .choice").forEach(el =>
    el.classList.toggle("sel", parseInt(el.dataset.i) === answers[idx]));
}
function goPrev(){ if(idx > 0){ commitTime(); idx--; renderQuestion(); } }
function goNext(){ commitTime(); if(idx < SET.questions.length - 1){ idx++; renderQuestion(); } else finish(); }

// ---------- finish ----------
function correctIndex(q){ return q.t === "v" ? q.ans : QI[q.ans]; }
function finish(){
  if(timerId) clearInterval(timerId);
  const sec = Math.floor((Date.now() - t0) / 1000);
  let v = 0, qn = 0;
  const results = {v: [], q: []}, misses = [];
  SET.questions.forEach((q, i) => {
    const ok = answers[i] === correctIndex(q);
    results[q.t].push({id: q.id, correct: ok});
    const sk = S.skills[q.skill] || {r: 0, w: 0};
    ok ? sk.r++ : sk.w++;
    S.skills[q.skill] = sk;
    if(ok){ q.t === "v" ? v++ : qn++; }
    else misses.push({
      type: q.t === "v" ? "Verbal" : "Quantitative",
      text: q.t === "v" ? `${q.a} : ${q.b} :: ${q.c} : ?` : `${q.ctx ? "(" + q.ctx + ") " : ""}${q.A}  vs  ${q.B}`,
      your: answers[i] === null ? "left blank" : (q.t === "v" ? q.ch[answers[i]] : QUANT_CHOICES[answers[i]]),
      correct: q.t === "v" ? q.ch[q.ans] : QUANT_CHOICES[QI[q.ans]],
      why: q.why});
  });

  const rv = updateReviewQueue(S.reviewQueue.v, results.v, SET.sittingNo);
  const rq = updateReviewQueue(S.reviewQueue.q, results.q, SET.sittingNo);
  S.reviewQueue = {v: rv.queue, q: rq.queue};
  const beatenNow = rv.beaten.length + rq.beaten.length;
  S.beaten += beatenNow;

  const leveledUp = [];
  const newV = updateLevel(S.levels.v, v), newQ = updateLevel(S.levels.q, qn);
  if(newV > S.levels.v) leveledUp.push("Verbal");
  if(newQ > S.levels.q) leveledUp.push("Quantitative");
  const atTop = (v >= 7 && S.levels.v === 3) || (qn >= 7 && S.levels.q === 3);
  S.levels = {v: newV, q: newQ};

  SET.questions.forEach(q => { S.seen[q.id] = SET.sittingNo; });
  S.sittingNo = SET.sittingNo;
  const personalBest = S.history.length > 0 && v + qn > Math.max(...S.history.map(h => h.v + h.q));
  S.history.push({ts: Date.now(), v, q: qn, sec, levels: {...S.levels}});
  saveState();

  renderResults({v, qn, sec, leveledUp, beatenNow, personalBest, atTop});
  postResult({token: CONFIG.token, kid: KID.name, kidId: KID.id, level: KID.level,
    ts: Date.now(), v, q: qn, sec, levels: S.levels, leveledUp, beaten: beatenNow,
    personalBest, misses, lowTiers: lowTiers(BANK.items, {levels: S.levels, seen: S.seen})});
}

function grade(total){
  if(total >= 15) return "Excellent";
  if(total >= 12) return "Strong";
  if(total >= 9)  return "Solid — above the bar";
  return "Good reps. This test is meant to be hard.";
}
function renderResults(r){
  const d = new Date();
  $("#resEyebrow").textContent = `${KID.name} · Sitting ${SET.sittingNo} · ` +
    d.toLocaleDateString(undefined, {month: "short", day: "numeric"});
  $("#resTitle").textContent = grade(r.v + r.qn);
  const parts = [];
  if(r.leveledUp.length) parts.push(`🔥 ${r.leveledUp.join(" and ")} moved up to challenge level ${r.leveledUp.includes("Verbal") ? S.levels.v : S.levels.q}!`);
  if(r.atTop) parts.push(`⭐ Holding the top of the ${cap(KID.level)} range.`);
  if(r.beatenNow) parts.push(`🏆 You just beat ${r.beatenNow} question${r.beatenNow === 1 ? "" : "s"} that beat you before — ${S.beaten} total.`);
  if(r.personalBest) parts.push(`📈 New personal best.`);
  $("#celebrate").innerHTML = parts.join("<br>");
  $("#celebrate").classList.toggle("hidden", !parts.length);
  $("#vScore").innerHTML = `${r.v}<small>/8</small>`;
  $("#qScore").innerHTML = `${r.qn}<small>/8</small>`;
  $("#vPct").textContent = r.v >= 7 ? "pushing the boundary" : r.v >= 5 ? "right in the stretch zone" : "building";
  $("#qPct").textContent = r.qn >= 7 ? "pushing the boundary" : r.qn >= 5 ? "right in the stretch zone" : "building";
  const mm = Math.floor(r.sec / 60), ss = String(r.sec % 60).padStart(2, "0");
  $("#resMeta").innerHTML = `<b>${r.v + r.qn}/16</b> · total ${mm}:${ss} (~${Math.round(r.sec / 16)}s/question; test pace ≈25s)`;
  renderReview();
  show("results");
}
function renderReview(){
  const host = $("#reviewHost"); host.innerHTML = "";
  SET.questions.forEach((q, i) => {
    const isV = q.t === "v";
    const correct = correctIndex(q);
    const noAns = answers[i] === null;
    const ok = !noAns && answers[i] === correct;
    const state = noAns ? "missed" : ok ? "ok" : "no";
    const yourTxt = noAns ? "—" : (isV ? q.ch[answers[i]] : QUANT_CHOICES[answers[i]]);
    const corTxt = isV ? q.ch[correct] : QUANT_CHOICES[correct];
    const head = isV
      ? `<span class="cap">${q.a}</span> <span class="sep">:</span> <span class="cap">${q.b}</span> <span class="sep">::</span> <span class="cap">${q.c}</span> <span class="sep">:</span> <b>${corTxt.toUpperCase()}</b>`
      : `${q.ctx ? `<span class="qctx">(${q.ctx})</span> &nbsp;` : ""}<span class="mono">${q.A}</span> &nbsp;vs&nbsp; <span class="mono">${q.B}</span>`;
    const el = document.createElement("div");
    el.className = "ritem " + state;
    el.innerHTML = `
      <div class="qline"><span class="num">${i + 1}.</span> ${head}<span class="tag ${state}">${noAns ? "missed" : ok ? "correct" : "wrong"}</span><span class="tchip">${Math.round(qTime[i] || 0)}s</span></div>
      ${ok ? "" : `<div class="ans">${noAns ? '<span class="cgrey">Left blank</span>' : 'Your answer: <span class="you">' + yourTxt + "</span>"}</div>`}
      <div class="ans">Correct: <span class="cor">${corTxt}</span></div>
      <div class="why">${q.why}</div>`;
    host.appendChild(el);
  });
}

// ---------- webhook with offline retry ----------
async function postResult(payload){
  S.pending.push(payload); saveState();
  await flushPending();
}
async function flushPending(){
  if(!CONFIG.webhookUrl.startsWith("http") || !S.pending.length) return;
  const remaining = [];
  for(const p of S.pending){
    try{
      const r = await fetch(CONFIG.webhookUrl, {method: "POST",
        headers: {"Content-Type": "text/plain;charset=utf-8"}, body: JSON.stringify(p)});
      if(!r.ok) remaining.push(p);
    }catch(e){ remaining.push(p); }
  }
  S.pending = remaining; saveState();
}

// ---------- wiring ----------
$("#pinBtn").onclick = tryPin;
$("#pinInput").addEventListener("keydown", e => { if(e.key === "Enter") tryPin(); });
$("#startBtn").onclick = startSitting;
$("#switchBtn").onclick = () => { renderPick(); show("pick"); };
$("#prevBtn").onclick = goPrev;
$("#nextBtn").onclick = goNext;
$("#homeBtn").onclick = () => { renderHome(); show("home"); };
$("#printBtn").onclick = () => window.print();
document.addEventListener("keydown", e => {
  if($("#test").classList.contains("hidden")) return;
  if(["1", "2", "3", "4"].includes(e.key)){ answers[idx] = parseInt(e.key) - 1; markSelected(); }
  else if(e.key === "ArrowLeft") goPrev();
  else if(e.key === "ArrowRight" || e.key === "Enter") goNext();
});

(function boot(){
  if(localStorage.getItem("scat_unlocked") === CONFIG.pinHash && CONFIG.pinHash){
    renderPick(); show("pick");
  }else show("gate");
})();
```

- [ ] **Step 2: Manual test** — `python3 -m http.server 8080 -d site` then open `http://localhost:8080`: wrong PIN rejected; `1234` unlocks; each kid's home renders; a full sitting runs (16 questions, timer, keyboard nav); results show stretch-zone framing and review; a second sitting shows no repeated questions; force a 7+/8 strand (answer with the review pane's help on a second browser profile if needed — or temporarily check `localStorage` state) and confirm the level-up banner; localStorage survives reload; `pending` holds the payload (webhookUrl is empty).
- [ ] **Step 3: Run all tests** (`node --test tests/` and `uv run pytest -q`) then **commit**.

---

### Task 9: Apps Script webhook (email + Sheet + dispatch)

**Files:**
- Create: `apps-script/Code.gs`, `apps-script/SETUP.md`
- Modify: `site/config.js` (webhookUrl, token)

**Interfaces:**
- Consumes: POST payload (Task 8 shape).
- Produces: email to meninder.purewal@gmail.com; row in Sheet `SCAT Log`; `repository_dispatch` event `bank_low` with `client_payload: {level, needs:[{strand,tier,count}]}` consumed by Task 10.

- [ ] **Step 1: Write `apps-script/Code.gs`:**

```js
// SCAT practice webhook. Script Properties required:
//   SCAT_TOKEN  — must match site/config.js token
//   SHEET_ID    — Google Sheet for the attempt log
//   GH_PAT      — fine-grained PAT, Contents R/W on the scat-practice repo (for regeneration)
//   GH_REPO     — e.g. "meninder/scat-practice"
const PARENT_EMAIL = "meninder.purewal@gmail.com";
const TOPUP_TO = 26;   // regeneration tops each low strand-tier up to this many items

function prop(k){ return PropertiesService.getScriptProperties().getProperty(k); }

function doPost(e){
  let data;
  try{ data = JSON.parse(e.postData.contents); }
  catch(err){ return out({ok: false, error: "bad json"}); }
  if(!data || data.token !== prop("SCAT_TOKEN")) return out({ok: false, error: "bad token"});

  logToSheet(data);
  sendEmail(data);
  let dispatched = false;
  if((data.lowTiers || []).length && prop("GH_PAT")) dispatched = triggerGeneration(data);
  return out({ok: true, dispatched: dispatched});
}

function out(obj){
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function logToSheet(d){
  const sh = SpreadsheetApp.openById(prop("SHEET_ID")).getSheets()[0];
  if(sh.getLastRow() === 0)
    sh.appendRow(["When","Kid","Level","Verbal","Quant","Total","Seconds","V tier","Q tier","Comebacks","Low tiers"]);
  sh.appendRow([new Date(d.ts), d.kid, d.level, d.v, d.q, d.v + d.q, d.sec,
    d.levels.v, d.levels.q, d.beaten || 0, JSON.stringify(d.lowTiers || [])]);
}

function sendEmail(d){
  const mins = Math.floor(d.sec / 60), secs = ("0" + (d.sec % 60)).slice(-2);
  const frame = d.v + d.q >= 12 ? "a strong sitting" : d.v + d.q >= 9 ? "solid — above the bar for this stretch test" : "a tough one; the test is pitched above grade level on purpose";
  let body = d.kid + " finished sitting on " + new Date(d.ts).toLocaleString() + " — " + frame + ".\n\n" +
    "Verbal " + d.v + "/8 · Quant " + d.q + "/8 · Total " + (d.v + d.q) + "/16 · " + mins + ":" + secs + "\n" +
    "Challenge tiers now: Verbal " + d.levels.v + "/3, Quant " + d.levels.q + "/3" +
    (d.leveledUp && d.leveledUp.length ? "  (moved up: " + d.leveledUp.join(", ") + " 🔥)" : "") + "\n" +
    (d.beaten ? d.kid + " beat " + d.beaten + " question(s) that beat them before.\n" : "") +
    (d.personalBest ? "New personal best.\n" : "");
  if((d.misses || []).length){
    body += "\nTo review together:\n";
    d.misses.forEach(function(m, i){
      body += "\n" + (i + 1) + ". [" + m.type + "] " + m.text + "\n   answered: " + m.your +
              " · correct: " + m.correct + "\n   " + m.why.replace(/<[^>]+>/g, "") + "\n";
    });
  }
  if((d.lowTiers || []).length) body += "\n(Question bank running low for " + d.kid + " — new questions are being generated automatically.)\n";
  MailApp.sendEmail(PARENT_EMAIL, "SCAT: " + d.kid + " " + (d.v + d.q) + "/16" +
    (d.leveledUp && d.leveledUp.length ? " · leveled up 🔥" : ""), body);
}

function triggerGeneration(d){
  const needs = (d.lowTiers || []).map(function(t){
    return {strand: t.strand, tier: t.tier, count: Math.max(8, TOPUP_TO - t.unseen)};
  });
  const resp = UrlFetchApp.fetch("https://api.github.com/repos/" + prop("GH_REPO") + "/dispatches", {
    method: "post",
    contentType: "application/json",
    headers: {Authorization: "Bearer " + prop("GH_PAT"), Accept: "application/vnd.github+json"},
    payload: JSON.stringify({event_type: "bank_low", client_payload: {level: d.level, needs: needs}}),
    muteHttpExceptions: true
  });
  return resp.getResponseCode() === 204;
}
```

- [ ] **Step 2: Write `apps-script/SETUP.md`** — numbered walkthrough: (1) create a Google Sheet named "SCAT Log", copy its ID from the URL; (2) script.google.com → New project → paste `Code.gs`; (3) Project Settings → Script Properties: `SCAT_TOKEN` (any long random string), `SHEET_ID`, and later `GH_PAT` + `GH_REPO` (Task 10 explains the PAT: github.com → Settings → Developer settings → Fine-grained tokens → only `scat-practice` repo → Contents: Read and write); (4) Deploy → New deployment → Web app, execute as **Me**, access **Anyone** → authorize → copy the `/exec` URL; (5) send the URL and token back. Include the smoke test:

```bash
curl -sL -X POST '<EXEC_URL>' -H 'Content-Type: text/plain' -d '{"token":"<TOKEN>","kid":"Test","level":"advanced","ts":1753200000000,"v":6,"q":7,"sec":540,"levels":{"v":2,"q":2},"leveledUp":[],"beaten":0,"misses":[],"lowTiers":[]}'
```

Expected: `{"ok":true,...}`, an email arrives, a Sheet row appears.

- [ ] **Step 3: PAUSE — ask Meninder** to run SETUP.md steps 1–4 (5 minutes) and paste back the `/exec` URL and token. Then set both in `site/config.js`, run the curl smoke test, and confirm the email/Sheet row.
- [ ] **Step 4: Commit.**

---

### Task 10: Generation pipeline (Action)

**Files:**
- Create: `tools/generate/generate.py`, `tools/generate/independent_check.py`, `tools/generate/resolve_request.py`, `.github/workflows/generate.yml`

**Interfaces:**
- Consumes: `bank_low` dispatch `{level, needs:[{strand,tier,count}]}` (Task 9); `audit_bank.item_id`, `checks_runner.run_checks`, `strip_bank.strip`.
- Produces: verified items appended to `site/data/<level>.json`, committed by the Action.

- [ ] **Step 1: Write `tools/generate/resolve_request.py`** (normalizes the three trigger shapes to env output):

```python
"""Emit LEVELS_JSON for the workflow: {"advanced":[{strand,tier,count},...], ...}"""
import json, os, sys

def monthly_needs():
    return {lvl: [{"strand": s, "tier": t, "count": 4} for s in ("v", "q") for t in (1, 2, 3)]
            for lvl in ("advanced", "intermediate")}

event = os.environ.get("GITHUB_EVENT_NAME", "")
payload = json.loads(os.environ.get("CLIENT_PAYLOAD") or "null")
if event == "repository_dispatch" and payload:
    out = {payload["level"]: payload["needs"]}
elif event == "workflow_dispatch":
    out = {os.environ["IN_LEVEL"]: json.loads(os.environ["IN_NEEDS"])}
else:
    out = monthly_needs()
with open(os.environ["GITHUB_OUTPUT"], "a") as f:
    f.write(f"levels={json.dumps(out)}\n")
print(json.dumps(out))
```

- [ ] **Step 2: Write `tools/generate/generate.py`:**

```python
"""Author candidate items with Claude, following the repo's authoring spec.
Writes build/candidates.<level>.json — nothing ships until independent_check.py passes it."""
import argparse, json, pathlib, sys
import anthropic
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
from tools.audit_bank import item_id

ROOT = pathlib.Path(__file__).resolve().parents[2]
MODEL = "claude-fable-5"

def build_prompt(level, needs, bank):
    spec = (ROOT / "SCAT-exam-authoring-spec.md").read_text()
    tiers = (ROOT / "docs" / "tiers.md").read_text()
    existing = [f'{i["a"]} : {i["b"]} :: {i["c"]}' if i["t"] == "v" else f'{i["A"]} vs {i["B"]}'
                for i in bank["items"]]
    ask = ", ".join(f'{n["count"]} {"verbal" if n["strand"] == "v" else "quantitative"} at tier {n["tier"]}'
                    for n in needs)
    return f"""You are authoring SCAT practice questions for the {level} level.

Follow this authoring spec exactly (sections 3–5 and 8 are the content rules;
ignore its packaging sections — output format is defined below):

{spec}

Tier definitions:

{tiers}

Produce exactly: {ask}.

Output ONLY a JSON array. Each element:
- verbal: {{"t":"v","d":<tier>,"skill":"<relationship-slug>","a":"..","b":"..","c":"..","ch":["..","..","..",".."],"ans":0,"why":".."}}
  (ans is always 0 — the app shuffles; skill from: synonym, antonym, part-whole, tool-user, tool-action, maker-product, worker-workplace, category-member, intensity, cause-effect, object-material, instrument-measures, young-adult, animal-home)
- quant: {{"t":"q","d":<tier>,"skill":"<concept-slug>","A":"..","B":"..","ctx":"..(optional; REQUIRED if ans is D)","ans":"A|B|C|D","why":".."}}

Use real Unicode math (², ⁵, √, ½, π, ×, ÷, −). Do not duplicate any of these existing questions:
{json.dumps(existing, ensure_ascii=False)}"""

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--level", required=True)
    ap.add_argument("--needs", required=True, help='[{"strand":"v","tier":2,"count":8},...]')
    args = ap.parse_args()
    needs = json.loads(args.needs)
    bank = json.loads((ROOT / "site" / "data" / f"{args.level}.json").read_text())
    client = anthropic.Anthropic()
    msg = client.messages.create(model=MODEL, max_tokens=32000,
        messages=[{"role": "user", "content": build_prompt(args.level, needs, bank)}])
    text = msg.content[0].text
    text = text[text.index("["): text.rindex("]") + 1]
    cands = json.loads(text)
    existing_ids = {i["id"] for i in bank["items"]}
    kept = []
    for it in cands:
        it["id"] = item_id(it)
        if it["id"] not in existing_ids and it["id"] not in {k["id"] for k in kept}:
            kept.append(it)
    (ROOT / "build").mkdir(exist_ok=True)
    out = ROOT / "build" / f"candidates.{args.level}.json"
    out.write_text(json.dumps(kept, ensure_ascii=False, indent=1))
    print(f"{len(kept)} candidates -> {out}")

if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Write `tools/generate/independent_check.py`:**

```python
"""Second, independent pass: a fresh Claude call sees ONLY the stripped question text
and answers from scratch; sympy confirms quant claims. Survivors merge into the bank."""
import argparse, json, pathlib, sys
import anthropic
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
from tools.checks_runner import run_checks
from tools.strip_bank import strip

ROOT = pathlib.Path(__file__).resolve().parents[2]
MODEL = "claude-fable-5"

PROMPT = """Solve these SCAT questions from scratch. You are a verifier: you have NOT
seen the intended answers, and items you get "wrong" are discarded, so answer with care.

For each item output a JSON object entry keyed by its id:
- verbal item -> {"kind":"verbal","pick":<index 0-3 of the choice that best completes the analogy>}
- quant item with fixed values -> {"kind":"const","A":"<sympy expr>","B":"<sympy expr>"}
- quant item whose ctx leaves a free variable -> {"kind":"sweep","var":"x","values":["<sympy>",...],"A":"<expr in x>","B":"<expr in x>"}
  (choose values that probe the whole allowed domain: below 1, above 1, negative if permitted, boundary values)

sympy namespace: Rational, sqrt, pi, factorial, Abs. Quant answer choices are always
A greater / B greater / equal / cannot be determined.

Output ONLY one JSON object mapping every id to its entry.

Items:
{items}"""

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--level", required=True)
    args = ap.parse_args()
    cand_path = ROOT / "build" / f"candidates.{args.level}.json"
    cands = json.loads(cand_path.read_text())
    if not cands:
        print("no candidates"); return
    stripped = strip(cands)
    client = anthropic.Anthropic()
    msg = client.messages.create(model=MODEL, max_tokens=32000,
        messages=[{"role": "user", "content": PROMPT.replace("{items}", json.dumps(stripped, ensure_ascii=False))}])
    text = msg.content[0].text
    checks = json.loads(text[text.index("{"): text.rindex("}") + 1])
    errs = run_checks(cands, checks)
    bad_ids = {e.split(":")[0] for e in errs}
    survivors = [c for c in cands if c["id"] not in bad_ids]
    for e in errs:
        print("DROPPED:", e, file=sys.stderr)
    bank_path = ROOT / "site" / "data" / f"{args.level}.json"
    bank = json.loads(bank_path.read_text())
    bank["items"] += survivors
    bank_path.write_text(json.dumps(bank, ensure_ascii=False, indent=1))
    print(f"merged {len(survivors)}/{len(cands)} verified items into {bank_path}")

if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Write `.github/workflows/generate.yml`:**

```yaml
name: Generate questions
on:
  repository_dispatch:
    types: [bank_low]
  workflow_dispatch:
    inputs:
      level:
        description: "advanced or intermediate"
        required: true
      needs:
        description: 'e.g. [{"strand":"q","tier":3,"count":8}]'
        required: true
  schedule:
    - cron: "0 9 1 * *"
permissions:
  contents: write
concurrency:
  group: generate-bank
  cancel-in-progress: false
jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
      - run: uv sync
      - name: Resolve request
        id: req
        env:
          CLIENT_PAYLOAD: ${{ toJSON(github.event.client_payload) }}
          IN_LEVEL: ${{ inputs.level }}
          IN_NEEDS: ${{ inputs.needs }}
        run: uv run python tools/generate/resolve_request.py
      - name: Generate, verify, merge
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          LEVELS: ${{ steps.req.outputs.levels }}
        run: |
          echo "$LEVELS" | uv run python - <<'EOF'
          import json, subprocess, sys
          for level, needs in json.load(sys.stdin).items():
              subprocess.run(["uv","run","python","tools/generate/generate.py",
                              "--level",level,"--needs",json.dumps(needs)], check=True)
              subprocess.run(["uv","run","python","tools/generate/independent_check.py",
                              "--level",level], check=True)
              subprocess.run(["uv","run","python","tools/audit_bank.py",
                              f"site/data/{level}.json"], check=True)
          EOF
      - name: Commit
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add site/data/
          git diff --cached --quiet || git commit -m "chore: add generated & verified questions"
          git push
```

Note: the audit step runs on the *merged* bank; a key-spread violation fails the workflow before push, which is intended — spread problems mean the generator needs different counts, and the failure email (GitHub notifies on workflow failure) is the signal.

- [ ] **Step 5: Local pipeline test** (needs the API key — ask Meninder for it now; also add it as the repo secret):

```bash
export ANTHROPIC_API_KEY=...   # from Meninder
uv run python tools/generate/generate.py --level intermediate --needs '[{"strand":"q","tier":1,"count":3},{"strand":"v","tier":1,"count":3}]'
uv run python tools/generate/independent_check.py --level intermediate
uv run python tools/audit_bank.py site/data/intermediate.json
git diff site/data/intermediate.json   # eyeball the new items, then git checkout -- to discard the test merge OR keep if clean
gh secret set ANTHROPIC_API_KEY
```

- [ ] **Step 6: End-to-end Action test** — commit + push, then:

```bash
gh workflow run generate.yml -f level=intermediate -f 'needs=[{"strand":"v","tier":2,"count":4}]'
gh run watch
```

Expected: green run, new commit on main touching only `site/data/intermediate.json`.

- [ ] **Step 7: Commit anything remaining.**

---

### Task 11: Launch — real PIN, live end-to-end, README

**Files:**
- Modify: `site/config.js` (real pinHash), `README.md` (live URL, per-kid notes)

- [ ] **Step 1:** Ask Meninder for the family PIN (or generate a 4-digit one and tell him). `printf 'scat-purewal-2026<PIN>' | shasum -a 256` → `pinHash` in `site/config.js`. Commit + push.
- [ ] **Step 2:** Verify Pages is serving: open `https://<owner>.github.io/scat-practice/site/` — PIN gate works, banks load (fetch paths are relative, so the `/site/` subpath works), take a full sitting, confirm the email arrives and the Sheet row appears with real data.
- [ ] **Step 3:** Trigger the low-bank path once for real: in DevTools on the live site, temporarily mark most of one strand-tier seen (`localStorage` edit), finish a sitting, confirm the email notes regeneration and `gh run list` shows a `bank_low` run that commits new items.
- [ ] **Step 4:** Reset any test state (clear that browser's localStorage, delete test rows from the Sheet). Update README with the live URL and a "give this link to the kids" note. Final commit + push.
- [ ] **Step 5:** Report to Meninder: live URL, PIN, what emails look like, and how the bank refills itself.

---

## Self-Review Notes

- Spec coverage: PIN gate (T7), profiles/levels (T7/T8), adaptive ladder + silent down-shift + probes (T2/T8), review-queue comebacks (T2/T8), streaks/mastery/encouragement framing (T8), banks with tiers/skills (T5/T6), email + Sheet + token (T9), dispatch + generation + independent verification + structural audit (T10), monthly cron safety net (T10), launch checks (T11). Retry-POST offline queue (T8 `flushPending`, called on kid select). One-device-per-child assumption honored (localStorage only).
- The sample files' `window.storage` shim is intentionally not carried over (spec: localStorage).
- Type consistency: `results.v/q` entries `{id,correct}` match `updateReviewQueue`; `lowTiers` return `{strand,tier,unseen}` matches Apps Script `triggerGeneration` mapping to `{strand,tier,count}`; workflow passes `client_payload.needs` straight to `generate.py --needs`.
- Deliberate deviation from sample: `retryBtn` removed (adaptive sittings), percentages replaced with stretch-zone copy per spec.
