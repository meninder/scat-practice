#!/usr/bin/env python3
"""
audit_scat.py — structural QA for a built SCAT practice app.

Usage:  python3 audit_scat.py path/to/scat-practice-*.html [...]

Checks everything that can be verified WITHOUT knowing the math:
  structure, choice hygiene, answer-key sanity, answer-position bias,
  explanation length, duplicate stems, JS syntax.

It does NOT verify arithmetic. That requires the separate value table
described in the spec (Step 2 of the verification protocol).
Exit code 0 = clean, 1 = problems found.
"""
import json, re, sys, subprocess, tempfile, os
from collections import Counter

QUANT_ANS = {"A", "B", "C", "D"}
MAX_SENTENCES = 4


def extract_exams(html):
    """Pull the EXAMS array out of the HTML and JSON-ify it via node."""
    i = html.index("const EXAMS")
    sub = html[i:]
    lit = sub[sub.index("["): sub.index("\n];") + 2]
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as f:
        f.write("const E=" + lit + ";console.log(JSON.stringify(E));")
        path = f.name
    try:
        out = subprocess.run(["node", path], capture_output=True, text=True)
        if out.returncode:
            raise RuntimeError("could not parse EXAMS: " + out.stderr.strip())
        return json.loads(out.stdout)
    finally:
        os.unlink(path)


def sentence_count(text):
    """Count sentences, ignoring '!' used as factorial (e.g. 7!/5!)."""
    guarded = re.sub(r"\d!", "", text)
    return len(re.findall(r"[.!?]+(?:\s|$)", guarded))


def check_js(html, problems):
    m = re.search(r"<script>([\s\S]*?)</script>", html)
    if not m:
        problems.append("no <script> block found")
        return
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as f:
        f.write(m.group(1))
        path = f.name
    try:
        r = subprocess.run(["node", "--check", path], capture_output=True, text=True)
        if r.returncode:
            problems.append("JS syntax error: " + r.stderr.strip().splitlines()[0])
    finally:
        os.unlink(path)


def audit(path):
    html = open(path, encoding="utf-8").read()
    problems, notes = [], []

    check_js(html, problems)

    if "shuffleChoices" not in html:
        problems.append(
            "shuffleChoices() missing — verbal answers would sit in a fixed slot")
    if "window.print()" not in html:
        problems.append("no print handler found")

    key = re.search(r'STORE_KEY = "([^"]+)"', html)
    if not key:
        problems.append("STORE_KEY not found")
    else:
        notes.append(f"history key: {key.group(1)}")

    exams = extract_exams(html)
    if len(exams) != 6:
        problems.append(f"expected 6 sets, found {len(exams)}")

    vpos, qans, stems = Counter(), Counter(), Counter()
    nv = nq = 0

    for si, ex in enumerate(exams, 1):
        for part, n in (("v", len(ex.get("v", []))), ("q", len(ex.get("q", [])))):
            if n != 8:
                problems.append(f"set {si}: {n} {part} questions (expected 8)")

        for qi, q in enumerate(ex.get("v", []), 1):
            nv += 1
            tag = f"set {si} V{qi}"
            for f in ("a", "b", "c", "why"):
                if not q.get(f):
                    problems.append(f"{tag}: empty field '{f}'")
            ch = q.get("ch", [])
            if len(ch) != 4:
                problems.append(f"{tag}: {len(ch)} choices (expected 4)")
            if len(set(ch)) != len(ch):
                problems.append(f"{tag}: duplicate choices {ch}")
            if not isinstance(q.get("ans"), int) or not 0 <= q["ans"] < len(ch):
                problems.append(f"{tag}: bad ans index {q.get('ans')}")
            else:
                vpos[q["ans"]] += 1
            if sentence_count(q.get("why", "")) > MAX_SENTENCES:
                problems.append(f"{tag}: explanation over {MAX_SENTENCES} sentences")
            stems[(q.get("a"), q.get("b"), q.get("c"))] += 1

        for qi, q in enumerate(ex.get("q", []), 1):
            nq += 1
            tag = f"set {si} Q{qi}"
            for f in ("A", "B", "why"):
                if not q.get(f):
                    problems.append(f"{tag}: empty field '{f}'")
            a = q.get("ans")
            if a not in QUANT_ANS:
                problems.append(f"{tag}: bad ans '{a}' (expected A/B/C/D)")
            else:
                qans[a] += 1
            if a == "D" and not q.get("ctx"):
                problems.append(
                    f"{tag}: answer 'D' with no ctx — a 'cannot be determined' "
                    "item needs a free variable or condition")
            if a != "D" and q.get("ctx") and re.search(r"\b[a-z]\b", str(q.get("ctx"))):
                notes.append(f"{tag}: has ctx but definite answer '{a}' — "
                             "confirm it holds across the whole domain")
            if sentence_count(q.get("why", "")) > MAX_SENTENCES:
                problems.append(f"{tag}: explanation over {MAX_SENTENCES} sentences")
            stems[(q.get("A"), q.get("B"), q.get("ctx"))] += 1

    for stem, c in stems.items():
        if c > 1:
            problems.append(f"duplicate question across sets: {stem}")

    # Authoring position bias is fine ONLY because the app shuffles at runtime.
    if len(vpos) == 1 and "shuffleChoices" not in html:
        problems.append("every verbal answer in the same slot and no runtime shuffle")

    d = qans.get("D", 0)
    if d == 0:
        problems.append("no 'cannot be determined' items — that answer is never correct")
    elif not 4 <= d <= 10:
        notes.append(f"{d} 'cannot be determined' items across 6 sets (≈1/set is the target)")
    for letter in "ABC":
        if qans.get(letter, 0) == 0:
            problems.append(f"answer '{letter}' never correct in the quant bank")

    print(f"\n=== {os.path.basename(path)} ===")
    print(f"  {nv} verbal + {nq} quantitative = {nv + nq} questions")
    print(f"  quant answer key spread: {dict(sorted(qans.items()))}")
    print(f"  verbal answer slots as authored: {dict(sorted(vpos.items()))}"
          f"{'  (shuffled at runtime — fine)' if 'shuffleChoices' in html else ''}")
    for n in notes:
        print(f"  note: {n}")
    if problems:
        print(f"  {len(problems)} PROBLEM(S):")
        for p in problems:
            print(f"    ✗ {p}")
    else:
        print("  ✓ clean")
    return len(problems)


if __name__ == "__main__":
    files = sys.argv[1:]
    if not files:
        print(__doc__)
        sys.exit(2)
    total = sum(audit(f) for f in files)
    print(f"\n{'ALL CLEAN' if total == 0 else str(total) + ' PROBLEM(S) TOTAL'}\n")
    sys.exit(1 if total else 0)
