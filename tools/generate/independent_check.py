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
