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
        cid = it.get("id")
        claimed = it.get("ans")
        if cid is None or claimed is None:
            errs.append(f"{cid or '<no id>'}: item missing id or ans"); continue
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
