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

def test_missing_stem_key_does_not_crash():
    """Test that audit() handles missing stem keys without crashing."""
    bank_shell = {
        "level": "intermediate",
        "items": [
            {
                "t": "v",
                "d": 1,
                "skill": "antonym",
                "a": "expand",
                "ch": ["a", "b", "c", "d"],
                "ans": 0,
                "why": "X."
                # Note: no "b", "c", no "id"
            }
        ]
    }
    errs = audit(bank_shell)
    assert isinstance(errs, list)
    assert len(errs) > 0
    assert any("missing" in e for e in errs)

def test_report_on_malformed_bank_does_not_crash(tmp_path):
    """Test that CLI --report handles malformed bank without traceback crash."""
    malformed_bank = {
        "level": "intermediate",
        "items": [
            {
                "t": "v",
                "d": 1,
                "skill": "antonym",
                "a": "expand",
                "ch": ["a", "b", "c", "d"],
                "ans": 0,
                "why": "X."
                # Note: no "b", "c", no "id"
            }
        ]
    }
    p = tmp_path / "malformed.json"
    p.write_text(json.dumps(malformed_bank))
    r = subprocess.run(
        [sys.executable, "tools/audit_bank.py", str(p), "--report"],
        capture_output=True,
        text=True
    )
    assert r.returncode == 1
    assert "Traceback" not in r.stderr
