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
    t = it.get("t", "?")
    if t == "v":
        stem = "|".join([it.get("a", ""), it.get("b", ""), it.get("c", "")])
    else:  # t == "q" or other
        stem = "|".join([it.get("A", ""), it.get("B", ""), it.get("ctx", "")])
    return f'{t}-{hashlib.sha256(_norm(stem).encode()).hexdigest()[:8]}'

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
            item_id_val = it.get("id")
            if not item_id_val:
                errs.append(f"{tag}: missing id")
            else:
                ids[item_id_val] += 1
                if item_id_val != item_id(it):
                    errs.append(f"{tag}: id mismatch (expected {item_id(it)})")
            stems[item_id(it)] += 1
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
        v = sum(1 for i in bank.get("items", []) if i.get("t") == "v" and i.get("d") == d)
        q = sum(1 for i in bank.get("items", []) if i.get("t") == "q" and i.get("d") == d)
        keys = Counter(i.get("ans", "") for i in bank.get("items", []) if i.get("t") == "q" and i.get("d") == d)
        print(f"tier {d}: {v} verbal, {q} quant, keys {dict(keys)}")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("bank"); ap.add_argument("--report", action="store_true")
    args = ap.parse_args()
    with open(args.bank) as f:
        bank = json.load(f)
    if args.report:
        report(bank)
    errs = audit(bank)
    for e in errs:
        print("AUDIT:", e, file=sys.stderr)
    sys.exit(1 if errs else 0)
