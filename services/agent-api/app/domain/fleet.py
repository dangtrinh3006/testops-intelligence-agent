"""Agent fleet control plane: connector enrolment, heartbeats, policy, kill switches, audit and event ingest.

State is process-local and in memory (sandbox only): it resets on restart or a serverless cold start, and two
instances do not share it. Pilot scale moves it to Postgres. Credentials are stored as SHA-256 digests only.
"""

from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import threading
import time
from collections import deque
from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

WORKSPACE = "Kestrel Commerce"
TARGET_VERSION = "1.4.2"
MIN_SUPPORTED_VERSION = "1.2.0"
HEARTBEAT_S, STALE_AFTER_S, LOST_AFTER_S = 30, 90, 240
MAX_BATCH = 500
MAX_ENROLLED = 25
OPERATOR = "operator (sandbox)"
# Public sandbox enrolment code, documented in the README. A real workspace issues one-time codes per install.
SANDBOX_ENROL_CODE = "enroll-demo-not-secret"

ADAPTERS = ("github-actions", "jenkins", "junit-xml", "reportportal")
Adapter = Literal["github-actions", "jenkins", "junit-xml", "reportportal"]
SCOPES = ["read:ci", "read:artifacts"]
EGRESS_ALLOWLIST = ["testops-agent-api.vercel.app", "testops.dangtrinh.dev"]
REDACTION = [
    {"rule": "schema_allowlist", "detail": "Fields outside the event schema are rejected, never stored"},
    {"rule": "email", "detail": "Email addresses in messages are replaced with [redacted-email]"},
    {"rule": "message_length", "detail": "Messages are capped at 500 characters"},
    {"rule": "no_logs", "detail": "Raw logs and artifacts stay in the customer network; only test outcomes leave"},
]
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
VERSION = r"^\d+\.\d+\.\d+$"


class FleetError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


class Host(BaseModel):
    model_config = ConfigDict(extra="forbid")
    os: str = Field("linux", max_length=32, pattern=r"^[a-z0-9._-]+$")
    arch: str = Field("amd64", max_length=16, pattern=r"^[a-z0-9_-]+$")


class EnrolRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(max_length=64)
    name: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{2,39}$")
    adapters: list[Adapter] = Field(min_length=1, max_length=4)
    version: str = Field(TARGET_VERSION, pattern=VERSION)
    host: Host = Host()


class HeartbeatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: str | None = Field(None, pattern=VERSION)
    host: Host | None = None


class KillSwitchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool


class CiEvent(BaseModel):
    """Minimal outcome schema. extra='forbid' is the first redaction rule: unknown fields never get stored."""

    model_config = ConfigDict(extra="forbid")
    run_id: str = Field(min_length=1, max_length=120)
    service_id: str = Field(min_length=1, max_length=80)
    test_id: str = Field(min_length=1, max_length=240)
    status: Literal["PASS", "FAIL", "ERROR", "SKIPPED"]
    attempt: int = Field(1, ge=1, le=20)
    error_class: str | None = Field(None, max_length=160)
    message: str | None = Field(None, max_length=4000)
    ts: datetime


def _v(s: str) -> tuple[int, ...]:
    return tuple(int(p) for p in s.split("."))


def version_state(version: str) -> str:
    if _v(version) >= _v(TARGET_VERSION):
        return "current"
    return "behind" if _v(version) >= _v(MIN_SUPPORTED_VERSION) else "unsupported"


def status_for_age(age_s: float) -> str:
    if age_s < STALE_AFTER_S:
        return "connected"
    return "stale" if age_s < LOST_AFTER_S else "lost"


def _iso(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _digest(credential: str) -> str:
    return hashlib.sha256(credential.encode()).hexdigest()


# Simulated connectors keep a fixed heartbeat age so their status stays meaningful however long the process lives.
_SEED = [
    {"id": "con-ci-eu-1", "name": "kestrel-ci-eu-1", "adapters": ["github-actions"], "version": "1.4.2",
     "host": {"os": "linux", "arch": "amd64"}, "age_s": 12, "events": 18_420},
    {"id": "con-jenkins-dc2", "name": "kestrel-jenkins-dc2", "adapters": ["jenkins", "junit-xml"], "version": "1.3.0",
     "host": {"os": "linux", "arch": "arm64"}, "age_s": 150, "events": 6_310},
    {"id": "con-rp-bridge", "name": "kestrel-rp-bridge", "adapters": ["reportportal"], "version": "1.4.2",
     "host": {"os": "linux", "arch": "amd64"}, "age_s": 21, "events": 2_975},
    {"id": "con-legacy-qa", "name": "kestrel-legacy-qa", "adapters": ["junit-xml"], "version": "1.0.4",
     "host": {"os": "windows", "arch": "amd64"}, "age_s": 3 * 86_400 + 1_800, "events": 0},
]


class FleetStore:
    def __init__(self, clock=time.time):
        self.clock = clock
        self.lock = threading.Lock()
        now = clock()
        self.kill_switch = False
        self.connectors: dict[str, dict[str, Any]] = {}
        self.digests: dict[str, str] = {}
        self.events: deque = deque(maxlen=50)
        self.audit: deque = deque(maxlen=200)
        for i, s in enumerate(_SEED):
            self.connectors[s["id"]] = {
                "id": s["id"], "name": s["name"], "sandbox": True, "adapters": list(s["adapters"]), "version": s["version"],
                "host": dict(s["host"]), "egress": EGRESS_ALLOWLIST[:1], "scopes": list(SCOPES), "paused": False,
                "sim_age_s": s["age_s"], "last_heartbeat": None, "seed_events_24h": s["events"], "ingest": deque(),
            }
            self._audit("enrolment (sandbox seed)", "connector.enrolled", s["id"], f"{s['name']} v{s['version']}",
                        ts=now - 14 * 86_400 + i * 3_600)
        self._audit("system", "policy.published", "workspace", "read-only scope, 4 adapters, 2 egress hosts", ts=now - 7 * 86_400)

    # -- helpers (caller holds the lock) --
    def _audit(self, actor: str, action: str, target: str, detail: str, ts: float | None = None) -> None:
        self.audit.append({"ts": _iso(self.clock() if ts is None else ts), "actor": actor, "action": action,
                           "target": target, "detail": detail})

    def _get(self, cid: str) -> dict[str, Any]:
        c = self.connectors.get(cid)
        if c is None:
            raise FleetError(404, "not_found", f"Unknown connector '{cid[:60]}'.")
        return c

    def _last_beat(self, c: dict[str, Any], now: float) -> float:
        return now - c["sim_age_s"] if c["sim_age_s"] is not None else c["last_heartbeat"]

    def _events_24h(self, c: dict[str, Any], now: float) -> int:
        while c["ingest"] and now - c["ingest"][0][0] > 86_400:
            c["ingest"].popleft()
        return c["seed_events_24h"] + sum(n for _, n in c["ingest"])

    def _authenticate(self, cid: str | None, credential: str | None) -> dict[str, Any]:
        if not credential:
            raise FleetError(401, "unauthenticated", "Missing Bearer credential.")
        owner = self.digests.get(_digest(credential))
        if owner is None or (cid is not None and not hmac.compare_digest(owner, cid)):
            raise FleetError(401, "unauthenticated", "Credential is not valid for this connector.")
        return self.connectors[owner]

    def policy(self) -> dict[str, Any]:
        return {"read_only": True, "scopes": list(SCOPES), "adapters": list(ADAPTERS), "egress_allowlist": list(EGRESS_ALLOWLIST),
                "redaction": [dict(r) for r in REDACTION], "heartbeat_s": HEARTBEAT_S, "stale_after_s": STALE_AFTER_S,
                "lost_after_s": LOST_AFTER_S, "max_batch": MAX_BATCH}

    # -- reads --
    def snapshot(self) -> dict[str, Any]:
        with self.lock:
            now = self.clock()
            rows = []
            for c in self.connectors.values():
                beat = self._last_beat(c, now)
                rows.append({
                    "id": c["id"], "name": c["name"], "sandbox": c["sandbox"], "adapters": list(c["adapters"]),
                    "status": status_for_age(now - beat), "last_heartbeat_utc": _iso(beat), "heartbeat_age_s": int(now - beat),
                    "version": c["version"], "version_state": version_state(c["version"]),
                    "host": f"{c['host']['os']}/{c['host']['arch']}", "egress": list(c["egress"]), "scopes": list(c["scopes"]),
                    "paused": c["paused"], "events_ingested_24h": self._events_24h(c, now),
                })
            return {"workspace": {"name": WORKSPACE, "sandbox": True, "kill_switch": self.kill_switch},
                    "as_of_utc": _iso(now), "target_version": TARGET_VERSION, "min_supported_version": MIN_SUPPORTED_VERSION,
                    "connectors": rows, "policy": self.policy(), "recent_events": len(self.events),
                    "audit": list(reversed(self.audit))}

    # -- connector-facing writes --
    def enrol(self, req: EnrolRequest) -> dict[str, Any]:
        if not hmac.compare_digest(req.code.encode(), SANDBOX_ENROL_CODE.encode()):
            raise FleetError(403, "invalid_enrolment_code", "Enrolment code is not valid for this workspace.")
        with self.lock:
            if any(c["name"] == req.name for c in self.connectors.values()):
                raise FleetError(409, "name_taken", f"A connector named '{req.name}' is already enrolled.")
            if sum(not c["sandbox"] for c in self.connectors.values()) >= MAX_ENROLLED:
                raise FleetError(429, "fleet_full", f"Sandbox holds at most {MAX_ENROLLED} enrolled connectors.")
            now = self.clock()
            cid = f"con-{secrets.token_hex(4)}"
            credential = f"tcon_{secrets.token_urlsafe(32)}"
            self.digests[_digest(credential)] = cid
            self.connectors[cid] = {
                "id": cid, "name": req.name, "sandbox": False, "adapters": sorted(set(req.adapters)), "version": req.version,
                "host": req.host.model_dump(), "egress": EGRESS_ALLOWLIST[:1], "scopes": list(SCOPES), "paused": False,
                "sim_age_s": None, "last_heartbeat": now, "seed_events_24h": 0, "ingest": deque(),
            }
            self._audit("enrolment code", "connector.enrolled", cid,
                        f"{req.name} v{req.version} · credential {credential[:9]}… issued")
            return {"connector_id": cid, "name": req.name, "credential": credential, "credential_prefix": credential[:9],
                    "policy": self.policy(), "target_version": TARGET_VERSION, "version_state": version_state(req.version)}

    def heartbeat(self, cid: str, credential: str | None, req: HeartbeatRequest) -> dict[str, Any]:
        with self.lock:
            self._get(cid)
            c = self._authenticate(cid, credential)
            c["last_heartbeat"] = self.clock()
            if req.version and req.version != c["version"]:
                self._audit("connector", "connector.upgraded", cid, f"{c['version']} -> {req.version}")
                c["version"] = req.version
            if req.host:
                c["host"] = req.host.model_dump()
            return {"connector_id": cid, "status": "connected", "paused": c["paused"] or self.kill_switch,
                    "workspace_kill_switch": self.kill_switch, "target_version": TARGET_VERSION,
                    "version_state": version_state(c["version"]), "next_heartbeat_s": HEARTBEAT_S, "policy": self.policy()}

    def ingest(self, credential: str | None, batch: list[Any]) -> dict[str, Any]:
        with self.lock:
            c = self._authenticate(None, credential)
            if self.kill_switch:
                raise FleetError(423, "workspace_paused", "Workspace kill switch is on; pushes are rejected.")
            if c["paused"]:
                raise FleetError(423, "connector_paused", f"Connector '{c['name']}' is paused; pushes are rejected.")
        if len(batch) > MAX_BATCH:
            raise FleetError(413, "batch_too_large", f"At most {MAX_BATCH} events per batch, got {len(batch)}.")
        accepted, reasons, redacted = [], [], 0
        for i, raw in enumerate(batch):
            try:
                ev = CiEvent.model_validate(raw)
            except ValidationError as e:
                err = e.errors()[0]
                field = ".".join(str(p) for p in err["loc"]) or "event"
                reasons.append(f"event[{i}] {field}: {'field not in schema' if err['type'] == 'extra_forbidden' else err['msg']}")
                continue
            if ev.message:
                msg, n = EMAIL.subn("[redacted-email]", ev.message)
                redacted += n
                ev = ev.model_copy(update={"message": msg[:500]})
            accepted.append(ev)
        with self.lock:
            now = self.clock()
            if accepted:
                c["ingest"].append((now, len(accepted)))
                self.events.extend({**e.model_dump(mode="json"), "connector_id": c["id"]} for e in accepted)
            if c["sim_age_s"] is None:
                c["last_heartbeat"] = now
        return {"accepted": len(accepted), "rejected": len(batch) - len(accepted), "redacted": redacted,
                "reasons": reasons[:20]}

    # -- operator controls (human only; not exposed to the agent tools or the MCP server) --
    def set_paused(self, cid: str, paused: bool) -> dict[str, Any]:
        with self.lock:
            c = self._get(cid)
            if c["paused"] != paused:
                c["paused"] = paused
                self._audit(OPERATOR, "connector.paused" if paused else "connector.resumed", cid, c["name"])
            return {"connector_id": cid, "paused": c["paused"]}

    def set_kill_switch(self, enabled: bool) -> dict[str, Any]:
        with self.lock:
            if self.kill_switch != enabled:
                self.kill_switch = enabled
                self._audit(OPERATOR, "workspace.kill_switch_on" if enabled else "workspace.kill_switch_off", "workspace",
                            "all pushes rejected" if enabled else "pushes accepted again")
            return {"kill_switch": self.kill_switch}


_store = FleetStore()


def store() -> FleetStore:
    return _store


def reset(clock=time.time) -> FleetStore:
    global _store
    _store = FleetStore(clock)
    return _store
