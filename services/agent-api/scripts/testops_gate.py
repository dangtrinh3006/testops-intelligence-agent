#!/usr/bin/env python3
"""Release gate for a CI pipeline step: asks the TestOps API for a run's check and exits with its conclusion.

    python testops_gate.py --run run-chk-main-0418 [--api https://testops.dangtrinh.dev] [--format text|markdown|json]

Exit codes: 0 success or neutral, 1 failure (BLOCK), 2 action_required (HOLD_MANUAL_REVIEW), 3 error.
Standard library only, so it runs on any CI image with Python 3.9+.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

EXIT = {"success": 0, "neutral": 0, "failure": 1, "action_required": 2}
EXIT_ERROR = 3


def fetch_check(api: str, run: str, timeout: float = 30.0) -> dict:
    url = f"{api.rstrip('/')}/api/checks/{urllib.parse.quote(run, safe='')}"
    with urllib.request.urlopen(urllib.request.Request(url, headers={"accept": "application/json"}), timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def render(check: dict, fmt: str) -> str:
    if fmt == "json":
        return json.dumps(check, indent=2)
    if fmt == "markdown":
        return check["summary_markdown"]
    lines = [f"{check['conclusion'].upper()}: {check['title']}", f"run {check['run_id']} · {check['service_id']} · commit {check['commit']}"]
    for f in check["failures"]:
        defect = f["defect"]["label"] if f.get("defect") else "-"
        lines.append(f"  {f['test_id']:<10} {f['state']:<17} {defect:<15} flake={f.get('flake_level') or '-'}  {f['attempt_id']}")
    lines.append(f"verdict from {check['policy_id']} (rules {check['rules_version']}), not from a language model")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Fail a pipeline step on the TestOps release gate.")
    p.add_argument("--api", default=os.environ.get("TESTOPS_API", "http://localhost:8000"))
    p.add_argument("--run", required=True, help="run id or release candidate id")
    p.add_argument("--format", choices=["text", "markdown", "json"], default="text")
    a = p.parse_args(argv)
    try:
        check = fetch_check(a.api, a.run)
    except urllib.error.HTTPError as e:
        print(f"error: HTTP {e.code} from {a.api} for '{a.run}'", file=sys.stderr)
        return EXIT_ERROR
    except (urllib.error.URLError, TimeoutError, ValueError) as e:
        print(f"error: cannot reach {a.api}: {e}", file=sys.stderr)
        return EXIT_ERROR
    print(render(check, a.format))
    return EXIT.get(check.get("conclusion"), EXIT_ERROR)


if __name__ == "__main__":
    sys.exit(main())
