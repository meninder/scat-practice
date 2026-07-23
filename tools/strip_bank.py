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
