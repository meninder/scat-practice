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
    with client.messages.stream(model=MODEL, max_tokens=32000,
        messages=[{"role": "user", "content": build_prompt(args.level, needs, bank)}]) as stream:
        text = "".join(stream.text_stream)
    text = text.replace("```json", "").replace("```", "")
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
