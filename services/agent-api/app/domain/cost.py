"""Illustrative triage-effort model. Counts are measured from data; minutes and rates are assumptions."""

from __future__ import annotations

from .knowledge import knowledge


def estimate(investigations: int, window_days: int, minutes: dict | None = None, rate: dict | None = None) -> dict:
    a = knowledge()["effort_assumptions"]
    minutes = minutes or a["triage_minutes_per_investigation"]
    rate = rate or a["loaded_cost_per_engineer_hour_usd"]
    scenarios = {}
    for level in ("low", "base", "high"):
        hours = investigations * minutes[level] / 60
        scenarios[level] = {
            "minutes_per_investigation": minutes[level],
            "usd_per_hour": rate[level],
            "engineer_hours": round(hours, 1),
            "usd": round(hours * rate[level]),
        }
    return {
        "formula": "engineer_hours = investigations x minutes_per_investigation / 60;  cost = engineer_hours x loaded_hourly_rate",
        "measured": {"investigations": investigations, "window_days": window_days, "source": "retry-pass + final-failure series in the window"},
        "assumed": {"minutes_per_investigation": minutes, "loaded_cost_per_engineer_hour_usd": rate},
        "scenarios": scenarios,
        "caveat": "Minutes and rates are illustrative assumptions, not measured company data. A pilot replaces them with a measured baseline.",
    }
