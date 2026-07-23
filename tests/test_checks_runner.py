from tools.checks_runner import run_checks
from tools.strip_bank import strip

QA = {"id":"q1","t":"q","d":1,"A":"30% of 90","B":"25","ans":"A","why":"."}
QC = {"id":"q2","t":"q","d":1,"A":"7² − 3²","B":"(7−3)(7+3)","ans":"C","why":"."}
QD = {"id":"q3","t":"q","d":2,"A":"x²","B":"x","ctx":"x is a real number","ans":"D","why":"."}
V  = {"id":"v1","t":"v","d":1,"ans":2,"why":".","a":"a","b":"b","c":"c","ch":["w","x","y","z"]}

def test_const_confirms_and_refutes():
    assert run_checks([QA], {"q1":{"kind":"const","A":"Rational(30,100)*90","B":"25"}}) == []
    errs = run_checks([{**QA,"ans":"B"}], {"q1":{"kind":"const","A":"Rational(30,100)*90","B":"25"}})
    assert any("claimed B" in e and "computed A" in e for e in errs)

def test_equality_and_symbols():
    assert run_checks([QC], {"q2":{"kind":"const","A":"7**2 - 3**2","B":"(7-3)*(7+3)"}}) == []

def test_sweep_confirms_genuine_flip():
    ck = {"q3":{"kind":"sweep","var":"x","values":["2","Rational(1,2)","1"],"A":"x**2","B":"x"}}
    assert run_checks([QD], ck) == []

def test_sweep_refutes_fake_D():
    fake = {**QD, "A":"x + 1", "B":"x"}          # always A — not a real D
    ck = {"q3":{"kind":"sweep","var":"x","values":["2","Rational(1,2)","-3"],"A":"x + 1","B":"x"}}
    assert any("never flips" in e for e in run_checks([fake], ck))

def test_sweep_checks_definite_answers_across_domain():
    item = {**QD, "ans":"A"}                     # claims A but flips
    ck = {"q3":{"kind":"sweep","var":"x","values":["2","Rational(1,2)"],"A":"x**2","B":"x"}}
    assert any("does not hold" in e for e in run_checks([item], ck))

def test_verbal_pick_must_match():
    assert run_checks([V], {"v1":{"kind":"verbal","pick":2}}) == []
    assert any("verbal" in e for e in run_checks([V], {"v1":{"kind":"verbal","pick":1}}))

def test_missing_check_is_an_error():
    assert any("no check" in e for e in run_checks([QA], {}))

def test_malformed_item_does_not_crash_run():
    """Malformed item (missing ans) should not crash the run; good item should still verify."""
    malformed = {"id":"qx","t":"q","A":"1","B":"2"}  # missing "ans"
    result = run_checks([malformed, QA], {"qx":{"kind":"const","A":"1","B":"2"},"q1":{"kind":"const","A":"Rational(30,100)*90","B":"25"}})
    # Should have exactly one error (for malformed item), and QA should be verified
    assert len(result) == 1
    assert any("missing id or ans" in e for e in result)

def test_strip_bank_removes_all_answer_information():
    """Stripped bank should only contain specified keys, no ans/why/skill/d."""
    verbal_item = {"id":"v1","t":"v","d":1,"ans":2,"why":".","skill":"test","a":"a","b":"b","c":"c","ch":["w","x","y","z"]}
    quant_item = {"id":"q1","t":"q","d":1,"A":"30","B":"25","ans":"A","why":".","skill":"test","ctx":"context"}
    result = strip([verbal_item, quant_item])

    # Check verbal item
    verbal_stripped = result[0]
    assert set(verbal_stripped.keys()) == {"id", "t", "a", "b", "c", "ch"}
    assert "ans" not in verbal_stripped and "why" not in verbal_stripped and "skill" not in verbal_stripped and "d" not in verbal_stripped

    # Check quant item
    quant_stripped = result[1]
    assert set(quant_stripped.keys()) == {"id", "t", "A", "B", "ctx"}
    assert "ans" not in quant_stripped and "why" not in quant_stripped and "skill" not in quant_stripped and "d" not in quant_stripped
