"""The agent eval suite runs offline on every commit: golden, adversarial and robustness cases."""

from app.evals import CASES, run


def test_offline_eval_suite_passes_every_case():
    report = run("offline")
    failed = [(c["id"], [x for x in c["checks"] if not x["passed"]]) for s in report["suites"] for c in s["cases"] if not c["passed"]]
    assert failed == []
    assert (report["summary"]["passed"], report["summary"]["total"], report["summary"]["stable"]) == (len(CASES), len(CASES), len(CASES))
    assert {s["name"] for s in report["suites"]} == {"golden", "adversarial", "robustness"}
