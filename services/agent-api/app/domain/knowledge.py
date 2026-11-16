"""Loads the expert rule file and exposes the failure taxonomy."""

from __future__ import annotations

from datetime import date
from functools import lru_cache
from pathlib import Path

import yaml

RULES_PATH = Path(__file__).resolve().parents[2] / "knowledge" / "testops_rules.yaml"
NON_TEST_CATEGORIES = {"INFRA", "EXTERNAL_DEPENDENCY"}


@lru_cache(maxsize=1)
def knowledge() -> dict:
    return yaml.safe_load(RULES_PATH.read_text(encoding="utf-8"))


def category(error_class: str | None) -> str | None:
    if not error_class:
        return None
    for name, entry in knowledge()["taxonomy"].items():
        if error_class in entry["classes"]:
            return name
    return "UNCLASSIFIED"


def triage(error_class: str | None) -> dict | None:
    """ReportPortal-style defect type for an error class; unknown classes go to To Investigate."""
    cat = category(error_class)
    if cat is None:
        return None
    k = knowledge()
    code = k["taxonomy"].get(cat, {}).get("triage", "TI")
    return {"code": code, "label": k["triage_buckets"][code]["label"]}


def min_flake_runs() -> int:
    return int(knowledge().get("flakiness", {}).get("min_runs", 5))


def quarantine_entry(test_id: str, as_of: date) -> dict | None:
    """Active or expired quarantine entry for a test; `active` says whether it still applies."""
    for q in knowledge()["quarantine"]:
        if q["test_id"] == test_id:
            return {**q, "expires": str(q["expires"]), "active": date.fromisoformat(str(q["expires"])) >= as_of}
    return None


def rule(rule_id: str) -> dict:
    return next(r for r in knowledge()["rules"] if r["id"] == rule_id)
