# syntax=docker/dockerfile:1.7
# Agent API: FastAPI + LangGraph. Same code path as the Vercel function (api/index.py imports app.main).

FROM python:3.12-slim AS deps
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /build
COPY requirements.txt .
# uvicorn is the container entrypoint only; the Vercel function does not need it.
RUN python -m venv /opt/venv && /opt/venv/bin/pip install -r requirements.txt uvicorn==0.54.0

FROM python:3.12-slim AS runtime
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TESTOPS_DATA_SOURCE=fixtures
RUN groupadd --system --gid 10001 app && useradd --system --uid 10001 --gid app --no-create-home app
WORKDIR /srv
COPY --from=deps /opt/venv /opt/venv
COPY app/ app/
COPY knowledge/ knowledge/
COPY data/ data/
COPY migrations/ migrations/
USER 10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4).status == 200 else 1)"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
