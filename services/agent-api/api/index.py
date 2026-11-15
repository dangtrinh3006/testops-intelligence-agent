"""Vercel entrypoint: the platform serves the ASGI `app` exported here; vercel.json routes every path to it."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app  # noqa: E402

__all__ = ["app"]
