# SCAT Practice Set — Authoring Spec

Instructions for producing new practice sets for the existing apps. Written to be handed to a person or an AI with no prior context.

**Deliverable:** a drop-in replacement for the `EXAMS` array inside one of the three HTML files. Everything else in the app (timing, scoring, review, print) already works and must not be touched.

---

## 1. Pick the level first

The level is set by the child's **grade at the time of testing**, not their age or ability. Getting this wrong makes the practice useless.

| Child's grade | Level to write | Pitch difficulty at | Scored against | File |
|---|---|---|---|---|
| 2–3 | Elementary | grades 4–5 | 5th graders | `scat-practice-elementary.html` |
| 4–5 | Intermediate | grades 6–8 | 8th graders | `scat-practice-intermediate.html` |
| 6+ | Advanced | grades 9–12 | 9th–12th graders | `scat-practice.html` |

The test is deliberately above grade level. Questions should feel like a stretch; a child scoring 10/16 is not failing.

## 2. Fixed structure — do not vary

- **6 sets** per file, each **8 verbal + 8 quantitative** = 96 questions per file.
- 8–12 minutes per set. Short by design: the cadence is four sittings a week, not one long slog.
- Every question has exactly **4 answer choices**.
- No question may repeat across sets within a file.

---

## 3. Verbal analogies

Format is `A : B :: C : ?`. The child picks the word completing the second pair.

**Every analogy must rest on one clean, nameable relationship.** Use these:

| Relationship | Example |
|---|---|
| Synonym | tranquil : peaceful |
| Antonym | expand : contract |
| Part to whole | petal : flower |
| Tool to user | scalpel : surgeon |
| Tool to action | needle : sew |
| Maker to product | poet : poem |
| Worker to workplace | chef : kitchen |
| Category to member | reptile : lizard |
| Degree of intensity | warm : scorching |
| Cause to effect | friction : heat |
| Object to material | sweater : wool |
| Instrument to what it measures | compass : direction |
| Young to adult | cub : bear |
| Animal to its home | bee : hive |

**Rules:**

1. The relationship in the second pair must be **identical in kind and direction** to the first. `petal : flower :: scale : fish` works; `petal : flower :: scale : fin` does not (part-to-part, not part-to-whole).
2. **Exactly one distractor should be a near-miss** — the trap. Typically a synonym of the correct answer where the relationship demands an opposite or an intensity, or a word from the right topic in the wrong role. Example: for `coward : brave :: miser : ?`, the answer is *generous* and the trap is *greedy* (describes a miser, but is not the trait he lacks).
3. The other two distractors should be topically related but clearly wrong. Never use throwaway words — a child should have to think.
4. No duplicate words within a choice list.
5. Vocabulary must sit at the **target** level, not the child's current grade (see the table above).

**Do not** write analogies turning on obscure trivia, regional idiom, or brand names. The reasoning should be available to a bright child who has never seen the words before, if they can work out the relationship.

## 4. Quantitative comparisons

Two quantities side by side. The four answer choices are **fixed and identical on every question** — never rewrite them:

```
A  Quantity A is greater
B  Quantity B is greater
C  The two quantities are equal
D  Cannot be determined from the information given
```

**Rules:**

1. **Reward reasoning over computation.** The best items collapse if you spot the structure: `49 × 51` vs `50 × 50` (difference of squares), `25% of 80` vs `80% of 25` (commutativity), `(¾)²` vs `¾` (squaring a proper fraction shrinks it). Avoid grinding arithmetic.
2. **Roughly one "cannot be determined" per set** (6 per file). This is the answer children miss most and the one they must not learn to ignore.
3. A **"cannot be determined" item must genuinely flip.** It needs a free variable and a `ctx` condition, and the outcome must actually change across the allowed domain — usually by testing a value below 1, a value above 1, and a negative where permitted. If a variable is constrained such that one answer always holds, the answer is **not** D. This is the single most common authoring error.
4. Spread the key across A, B, and C. Never let one letter dominate or vanish.
5. Content must match the level:
   - **Elementary:** multiplication and division facts, fraction comparison, halves/quarters/thirds of a number, unit conversion (days, hours, minutes), perimeter, place value.
   - **Intermediate:** fractions vs. decimals vs. percents, order of operations, exponents, area and perimeter, factors and primes, averages, simple one-step equations.
   - **Advanced:** exponent rules, difference of squares, absolute value, radicals, factorials, slope, circle area and circumference, medians and modes, sign behavior under even and odd powers.

---

## 5. Explanations

One per question, shown on the results screen and on the printout. This is where the actual teaching happens — the parent reviews from these.

**Hard limit: 4 sentences. Aim for 3.**

**Verbal explanations must:**
1. Define any word a child at that level may not know, inline.
2. **Name the relationship explicitly** ("Part to whole", "Degree of intensity").
3. Say why the trap distractor fails.

**Quantitative explanations must:**
1. Name the concept or rule being used ("difference of squares", "dividing by a fraction below 1 makes a number larger").
2. Show the key step, not every step.
3. State which quantity wins.

**Register:** write to the child, not to the parent. Elementary explanations use plain words and concrete framing ("cutting something into 2 equal pieces gives bigger pieces than cutting it into 3"). `<em>` tags are allowed for emphasising a defined term.

---

## 6. Exact data format

Insert into the `EXAMS` array. Six objects, each with a `v` array of 8 and a `q` array of 8.

**Verbal:**
```js
{a:"drought", b:"water", c:"famine",
 ch:["food","hunger","crops","flood"], ans:0,
 why:"Both pairs name a damaging shortage of an essential resource: a drought is a prolonged lack of water, and a famine is a severe lack of food. The relationship is scarcity → the thing that is scarce. 'Flood' is the opposite of drought, and 'hunger' is the effect of famine, not the missing resource."}
```
`ans` is the **index** into `ch`. Author it as `0` by convention — the app shuffles choices at runtime, so the correct answer never sits in a fixed slot on screen.

**Quantitative:**
```js
{A:"2⁵", B:"5²", ans:"A",
 why:"Compute each power: 2⁵ = 32, while 5² = 25. ..."}

{A:"x²", B:"x", ctx:"x is a real number", ans:"D",
 why:"With x unrestricted the comparison flips: if x = 2 then x² > x; if x = ½ then x² < x; if x = 1 they are equal. ..."}
```
`ans` is the **letter** `"A"`, `"B"`, `"C"`, or `"D"`. `ctx` is optional and renders as an italic condition above the two columns; it is **required** whenever `ans` is `"D"`.

Use real Unicode for math (`⁵`, `²`, `√`, `½`, `⅔`, `π`, `×`, `÷`, `−`). It renders correctly and prints correctly.

---

## 7. Verification protocol — mandatory

Nothing ships unverified. A wrong answer key actively teaches the wrong thing, and neither child will catch it.

### Step 1 — Recompute every arithmetic answer independently

Build a table of the two quantities **as code**, evaluate, and compare against the claimed letter. Do not eyeball it. Use exact arithmetic (`fractions.Fraction`) so decimal rounding never decides a comparison.

```python
from fractions import Fraction as F

def truth(a, b):
    return "C" if a == b else ("A" if a > b else "B")

# (set_index, question_index): (quantity_A, quantity_B)
VALS = {
    (0,0): (2**5, 5**2),
    (0,1): (F(1,2)/F(1,4), F(1,4)/F(1,2)),
    (0,2): (49*51, 50*50),
    # ... one entry for every non-D item
}
for key, (a, b) in VALS.items():
    computed = truth(a, b)
    claimed  = BANK[key[0]][key[1]].ans      # from your bank
    assert computed == claimed, f"{key}: computed {computed}, claimed {claimed}"
```

### Step 2 — Prove every "cannot be determined" actually flips

Sweep the domain. If only one outcome ever appears, the answer is not D:

```python
outcomes = {truth(n + 4, 4 * n) for n in range(1, 50)}   # ctx: n is a whole number > 0
assert len(outcomes) > 1, "claimed D but the answer never changes"
```

Run the mirror-image check on any item that has a `ctx` **and** a definite A/B/C answer — confirm the claim holds across the *entire* domain, not just the value you had in mind.

### Step 3 — Run the structural auditor

`audit_scat.py` (delivered alongside this spec) checks question counts, duplicate and malformed choices, answer-key spread, missing `ctx` on D items, explanation length, duplicate questions across sets, and JS syntax:

```
python3 audit_scat.py scat-practice-intermediate.html
```

Exit code 0 means clean. It does **not** check arithmetic — Steps 1 and 2 are still required.

### Step 4 — Open it and take a set

Confirm the questions render, the timer counts, scoring is right, and the printout is clean.

---

## 8. Known traps

Things that have already gone wrong or nearly did:

- **Fixed answer position.** The first build had every correct verbal answer in slot 1. A sharp child pattern-matches within days and stops reasoning entirely. The app now shuffles at runtime — never remove `shuffleChoices()`.
- **Fake "cannot be determined" items.** Writing `ctx` with a variable that is actually pinned. Always sweep the domain.
- **Decimal rounding deciding a close comparison.** Use exact fractions.
- **Counting `!` as a sentence end.** Factorials (`7!/5!`) inflate automated sentence counts. The auditor already guards against this.
- **Near-miss distractor that is actually correct.** Check that no distractor also satisfies the stated relationship. If two answers work, the question is broken.
- **Wrong level.** Confirm the registration grade before writing. A 6th grader sits Advanced, not Intermediate.

## 9. Delivering the new sets

Replace the `EXAMS` array in the target file, between `const EXAMS = [` and the closing `];`. Change nothing else — the engine, styling, print stylesheet, and history logic are shared across all three files.

If the new sets are meant to sit **alongside** the existing ones as a separate file rather than replace them, also change:

- `<title>` (line ~6)
- the `.eyebrow` label on the start screen (line ~176)
- `const STORE_KEY` (line ~392) — **must be unique per file**, or the new app will overwrite another child's saved history

Then re-run the full verification protocol on the built file.
