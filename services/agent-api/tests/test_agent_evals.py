"""The agent eval suite runs offline on every commit: golden, adversarial and robustness cases."""

from app.evals import CASES, run


def test_offline_eval_suite_passes_every_case():
    report = run("offline")
    failed = [(c["id"], [x for x in c["checks"] if not x["passed"]]) for s in report["suites"] for c in s["cases"] if not c["passed"]]
    assert failed == []
    assert (report["summary"]["passed"], report["summary"]["total"], report["summary"]["stable"]) == (len(CASES), len(CASES), len(CASES))
    assert {s["name"] for s in report["suites"]} == {"golden", "adversarial", "robustness"}


def test_live_eval_does_not_count_an_offline_fallback_as_a_pass(ds, monkeypatch):
    from app.evals import CASES, _one
    for k in ("LLM_API_KEY", "GROQ_API_KEY", "AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN"):
        monkeypatch.delenv(k, raising=False)
    case = next(c for c in CASES if c.id == "C-conflict")
    r, resp = _one(ds, case, "live")
    assert resp.mode == "offline"  # no credentials: the API degrades, as designed
    guard = next(c for c in r["checks"] if c["name"] == "answered_by_live_model")
    assert not guard["passed"] and not r["passed"]
