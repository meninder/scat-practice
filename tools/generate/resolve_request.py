"""Emit LEVELS_JSON for the workflow: {"advanced":[{strand,tier,count},...], ...}"""
import json, os, sys

def monthly_needs():
    return {lvl: [{"strand": s, "tier": t, "count": 4} for s in ("v", "q") for t in (1, 2, 3)]
            for lvl in ("advanced", "intermediate")}

if __name__ == "__main__":
    event = os.environ.get("GITHUB_EVENT_NAME", "")

    if event == "repository_dispatch":
        payload = json.loads(os.environ.get("CLIENT_PAYLOAD") or "null")
        if not payload or not isinstance(payload, dict) or "level" not in payload or "needs" not in payload:
            print("ERROR: repository_dispatch requires CLIENT_PAYLOAD with 'level' and 'needs' keys", file=sys.stderr)
            sys.exit(1)
        out = {payload["level"]: payload["needs"]}
    elif event == "workflow_dispatch":
        in_level = os.environ.get("IN_LEVEL")
        in_needs = os.environ.get("IN_NEEDS")
        if not in_level or not in_needs:
            print("ERROR: workflow_dispatch requires IN_LEVEL and IN_NEEDS environment variables", file=sys.stderr)
            sys.exit(1)
        try:
            needs_parsed = json.loads(in_needs)
        except json.JSONDecodeError as e:
            print(f"ERROR: IN_NEEDS is not valid JSON: {e}", file=sys.stderr)
            sys.exit(1)
        out = {in_level: needs_parsed}
    elif event == "schedule":
        out = monthly_needs()
    else:
        print(f"ERROR: Unsupported GITHUB_EVENT_NAME: {event}", file=sys.stderr)
        sys.exit(1)

    with open(os.environ["GITHUB_OUTPUT"], "a") as f:
        f.write(f"levels={json.dumps(out)}\n")
    print(json.dumps(out))
