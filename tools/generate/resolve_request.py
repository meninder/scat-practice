"""Emit LEVELS_JSON for the workflow: {"advanced":[{strand,tier,count},...], ...}"""
import json, os, sys

def monthly_needs():
    return {lvl: [{"strand": s, "tier": t, "count": 4} for s in ("v", "q") for t in (1, 2, 3)]
            for lvl in ("advanced", "intermediate")}

if __name__ == "__main__":
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
