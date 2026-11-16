# Deployment

Two paths share one codebase. **Vercel** serves https://testops.dangtrinh.dev today. **Containers + GitOps** are the portable production path: they build and run locally today, and the cluster side is a target that has not been applied.

| Piece | Status (16 Nov 2026) |
|---|---|
| Vercel: `testops-agent-api` (Python function) + `testops-web` (Next.js) | Live |
| `services/agent-api/Dockerfile`, `apps/web/Dockerfile` | Build locally: API 316 MB, web 337 MB |
| `docker-compose.yml` (api + web, optional Postgres profile) | Runs locally; both containers report healthy; `/api/ask` answers through the web proxy |
| `.github/workflows/containers.yml` (build, Trivy scan, push to GHCR) | Written; first run happens on the next push |
| `deploy/k8s` (kustomize base + staging/prod overlays) | Renders with `kubectl kustomize`; not applied to any cluster |
| `deploy/argocd/application.yaml`, ALB Ingress annotations, External Secrets | Target only |

## Run locally

```bash
docker compose up -d --build api web           # http://localhost:3000, API on :8000 (fixtures, no database)
API_PORT=18000 WEB_PORT=13000 docker compose up -d api web   # if 8000/3000 are taken
docker compose --profile db up -d db            # optional Postgres 16; see the api env comments to seed and switch
docker compose down
```

Model keys are read only from `services/agent-api/.env.local` (gitignored, optional). Without it the API answers in replay and offline modes and says so.

## CI: build, scan, push

`containers.yml` runs a matrix over `agent-api` and `web`:

1. Buildx build with the GitHub Actions layer cache.
2. Trivy scan of the built image. The job fails on CRITICAL or HIGH findings that have a fix.
3. On `main` only: push to `ghcr.io/<owner>/<repo>/{agent-api,web}` with tags `sha-<short>` and `main`. It uses `GITHUB_TOKEN` with `packages: write`.

`ci.yml` (ruff, pytest with Postgres, offline evals, web typecheck/lint/build) stays the quality gate.

## GitOps flow (target)

```
push to main ─► containers.yml ─► ghcr.io/...:sha-abc1234
                     │
                     └─► (next step, not yet written) bump newTag in deploy/k8s/overlays/staging ─► PR
ArgoCD (EKS) watches deploy/k8s/overlays/prod ─► sync with prune + selfHeal ─► testops-prod namespace
```

Promotion is a reviewed change to `newTag` in the overlay, so every release is a commit. The tag-bump step and the cluster are not built yet: on EKS, the AWS Load Balancer Controller gives the ALB Ingress (annotations in `base/ingress.yaml`), and External Secrets pulls `DATABASE_URL_READONLY` and the model keys from AWS Secrets Manager (`base/external-secret.example.yaml`).

## Manifest choices

- Both workloads run as UID 10001 with `runAsNonRoot`, `readOnlyRootFilesystem`, all capabilities dropped and the RuntimeDefault seccomp profile. Writable paths are `emptyDir` mounts (`/tmp`, `/app/.next/cache`).
- Probes hit `/api/health` (api) and `/` (web). The images carry the same checks as Docker `HEALTHCHECK`.
- An HPA scales the API from 2 to 6 replicas on CPU. Rate limits are in process memory, so with several replicas they apply per pod until a shared counter replaces them.
- The ALB idle timeout should be at least 120 s, because streamed answers can take that long.

Validate the manifests:

```bash
docker run --rm -v "$PWD/deploy:/d" registry.k8s.io/kubectl:v1.31.0 kustomize /d/k8s/overlays/prod
```
