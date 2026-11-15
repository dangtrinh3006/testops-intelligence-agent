import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("TESTOPS_DATA_SOURCE", "fixtures")
os.environ.pop("LLM_API_KEY", None) if os.environ.get("TESTOPS_KEEP_LLM") != "1" else None


@pytest.fixture(scope="session")
def ds():
    from app.etl import build, load_raw
    from app.store import DATA_DIR

    return build(*load_raw(DATA_DIR))
