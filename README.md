# jinja-render — local Jinja2 playground

A safe, local-first **Jinja2 playground** for daily infrastructure, automation, and
network-templating work: paste a Jinja2 template, paste YAML/JSON data, pick a
render mode and options, and render — with structured diagnostics and whitespace
visualization.

- **Backend:** Python 3.12 · FastAPI · Pydantic v2 · Jinja2 (sandboxed) · PyYAML · netaddr
- **Frontend:** React 18 · Vite · TypeScript · Zustand
- **Packaging:** single container (FastAPI serves the API + built SPA on one
  origin) · Docker Compose

## Features

- Template + data editors with a render-on-demand workflow.
- Data input as **YAML**, **JSON**, or **auto** (JSON tried first, then YAML).
- Render modes: `base`, `ansible`, `salt` (see *Compatibility limitations*).
- Options: `trim` → `trim_blocks`, `lstrip` → `lstrip_blocks`, `strict` → strict
  undefined behavior, `show_whitespaces` → derived visualization.
- Custom filters: `hash(algorithm)` and `ipaddr(query)` (always available in
  templates; not surfaced as a UI control).
- Copy raw output, clear output (editors preserved), `Ctrl/Cmd+Enter` to render.
- Structured, classified errors (parse / syntax / runtime / undefined / timeout / …).
- Default demo example loaded on open.

## Quick start

### Docker Compose (recommended)

```bash
docker compose up -d --build
```

A single container serves both the web UI and the API on one origin:

- Web UI: <http://localhost:8080>
- API (same origin): <http://localhost:8080/api/v1/capabilities>, `GET /healthz`

Stop with `docker compose down`.

### Local development

Backend:

```bash
cd backend
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt pytest httpx
uvicorn app.main:app --reload --port 8000
```

Frontend (in another terminal):

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173 (proxies /api → :8000)
```

A `Makefile` wraps these: `make backend-install`, `make backend-dev`,
`make frontend-dev`, `make up`, etc. Run `make help` for the full list.

## Architecture

```
repo/
├── backend/                # FastAPI app
│   └── app/
│       ├── api/v1/          # render, capabilities, examples routes (thin)
│       ├── core/            # config, logging, security, error taxonomy
│       ├── services/        # parsers, filters, renderer, whitespace, examples
│       ├── schemas/         # Pydantic request/response models
│       └── main.py          # app factory, middleware, static SPA serving
├── frontend/                # Vite + React + TS
│   └── src/
│       ├── app/store.ts     # Zustand state
│       ├── components/       # Editor, Toggle, ControlBar, OutputPane
│       ├── features/workbench/
│       ├── services/api.ts
│       └── types/api.ts
├── Dockerfile               # multi-stage: Node builds SPA → FastAPI serves it
├── docker-compose.yml
├── Makefile
└── docs/                    # spec.md + design note
```

At runtime there is **one container**: the multi-stage `Dockerfile` builds the
Vite SPA with Node, then copies `dist/` into the Python/FastAPI image, which
serves the API and the static SPA together on container port 8000. The
`backend/` and `frontend/` directories stay separate in source.

- All Jinja evaluation lives **only in the backend**. The frontend never
  interprets Jinja semantics; it sends a request and renders the response.
- Whitespace visualization is computed on the backend (`rendered_visualized`),
  and the frontend simply chooses which string to display. The raw rendered text
  is never mutated, and **Copy always copies raw output**.

## API

Base path: `/api/v1`.

### `POST /api/v1/render`

Request:

```json
{
  "template": "Hello {{ name }}",
  "data": "name: world",
  "data_format": "auto",
  "render_mode": "base",
  "options": { "trim": true, "lstrip": false, "strict": true, "show_whitespaces": false }
}
```

Success `200`:

```json
{
  "success": true,
  "rendered": "Hello world",
  "rendered_visualized": "Hello·world",
  "data_parsed": { "name": "world" },
  "meta": {
    "data_format_detected": "yaml",
    "render_mode_applied": "base",
    "filters_enabled": ["hash", "ipaddr"],
    "duration_ms": 3
  },
  "warnings": []
}
```

Error `4xx/5xx`:

```json
{
  "success": false,
  "error": { "type": "undefined_error", "message": "…", "line": 1, "column": null, "details": {} },
  "meta": { "duration_ms": 1 }
}
```

Error `type` is one of: `validation_error`, `parse_error`, `template_syntax_error`,
`template_runtime_error`, `undefined_error`, `unsupported_filter_error`,
`timeout_error`, `internal_error`.

### `GET /api/v1/capabilities`

Returns supported render modes, options, filters, and data formats.

### `GET /api/v1/examples`

Returns built-in template/data example pairs plus the default example.

### Operational endpoints

- `GET /livez` — liveness probe.
- `GET /readyz` — readiness probe (verifies the render worker pool is ready).
- `GET /healthz` — legacy liveness check (kept for backward compatibility).
- `GET /metrics` — plaintext Prometheus-style counters (`render_requests_total`,
  `render_errors_total`, `render_errors_by_type{type="…"}`).
- `GET /swagger` + `GET /openapi.json` — interactive API docs (the built-in
  `/docs` and `/redoc` are disabled in favor of `/swagger`).

## Custom filters

### `hash`

```jinja2
{{ hostname | hash('sha256') }}
```

- Available in all render modes; `algorithm` defaults to `sha256`.
- Algorithms come from `hashlib`; unknown algorithms return a controlled
  `unsupported_filter_error` (never a 500).
- Non-string values are normalized deterministically (scalars → `str`,
  dict/list → stable JSON) before hashing.

### `ipaddr`

ansible-like filter built on `netaddr`.

```jinja2
{{ '192.0.2.1/24' | ipaddr('address') }}   {# 192.0.2.1 #}
{{ '192.0.2.1/24' | ipaddr('network') }}   {# 192.0.2.0 #}
{{ '192.0.2.1/24' | ipaddr('prefix') }}    {# 24 #}
{{ '192.0.2.1/24' | ipaddr('netmask') }}   {# 255.255.255.0 #}
```

Supported queries: `address`, `network`, `netmask`, `prefix`, `host`,
`broadcast`, `int`, `bool`, `version`, `size`. A bare `ipaddr` validates the
value (returns the normalized form or `False`). Lists are accepted: invalid /
non-matching entries are dropped, mirroring ansible UX. Invalid input never
crashes — it returns `False`.

## Whitespace visualization

When `show_whitespaces` is enabled, the displayed output uses visible markers:

| char | marker |
|------|--------|
| space | `·` |
| tab | `⇥` |
| newline | `↵` (kept on its line) |
| carriage return | `␍` |

The raw output is unchanged and remains what Copy copies.

## Security assumptions and limitations

This tool renders **untrusted** template input, so:

- Rendering uses `jinja2.sandbox.SandboxedEnvironment` — no filesystem access,
  no arbitrary attribute/callable access (e.g. `''.__class__.__mro__` is blocked).
- Only the whitelisted `hash` and `ipaddr` filters are registered; no custom
  globals are exposed.
- Request payloads are size-limited (template ≤ 512 KB, data ≤ 1 MB) and parsed
  data nesting depth is bounded (default 50). All limits are env-configurable.
- Each render runs in a **persistent worker process** under a wall-clock timeout
  (default 2s); on overrun the worker is force-killed and replaced.
- The backend container runs as a **non-root** user with `no-new-privileges`,
  and debug mode is off by default.
- Errors are returned as structured JSON; raw stack traces are never sent to
  clients (they are logged server-side with a request id).

**Known limitations:**

- The render timeout is enforced by a **persistent pool of worker processes**.
  Renders run in a reused worker (no per-request process spawn / cold-start); on
  timeout the parent force-kills (`terminate`/`kill`) the stuck worker and starts
  a fresh one, so even a pure CPU-bound infinite loop is reliably reclaimed and
  the request returns `timeout_error`. Pool size and timeout are env-configurable
  (`JR_render_pool_size`, `JR_render_timeout_seconds`).
- `ansible` and `salt` are **profile modes**, not embedded Ansible/Salt
  runtimes. They share the sandboxed base environment and the `hash`/`ipaddr`
  filters. They are intentionally *partially* compatible: most common
  network/automation snippets work, but full Ansible/Salt filter and plugin
  parity is explicitly out of scope.
- `ansible` mode injects **emulated, static** host facts (e.g. `ansible_hostname`);
  these are fabricated and deterministic — real host facts are never gathered.
  User-provided keys always win over emulated facts.
- `ipaddr` implements a practical subset of ansible's filter, not the entire
  surface area.

## Testing

Backend (parsing, render modes, strict/trim/lstrip, hash, ipaddr, whitespace,
timeout, sandbox, hostfacts, rate limiting, API contract, plus a perf smoke test
asserting no per-request cold-start):

```bash
cd backend && . .venv/bin/activate && python -m pytest -q
```

Frontend (vitest + testing-library — render flow, hotkey, error state, copy,
whitespace toggle):

```bash
cd frontend && npm run test
```

## Configuration

All runtime configuration comes from environment variables (no hardcoded
runtime values), so the same images can be deployed unchanged across
environments.

- **Backend:** all settings use the `JR_` prefix and map to
  `backend/app/core/config.py`. The full list with defaults is documented in
  `backend/.env.example` (app, guardrails, render pool, rate limit, hostfacts,
  docs paths, static dir, CORS). In Docker/Kubernetes, supply these via env /
  ConfigMap. `JR_static_dir` (default `/app/static`) is where FastAPI serves the
  built SPA from; `JR_custom_css_path` (default `<static_dir>/custom.css`) is the
  optional runtime CSS override file.
- **Frontend:**
  - The app and the API share one origin, so the app calls a same-origin
    `/api/v1` — no proxy is involved. (In local Vite dev, `npm run dev` proxies
    `/api` → `:8000`.)
  - **Runtime CSS override without rebuilding:** `index.html` always loads
    `/custom.css` last (so it overrides bundled styles). FastAPI serves a mounted
    `custom.css` if present (as `text/css`) and returns an empty no-op stylesheet
    otherwise, so a missing file never 404s. Mount your own file (e.g. from a
    ConfigMap) over `<JR_static_dir>/custom.css` to restyle a running deployment.

## Kubernetes

Reference manifests live in `k8s/` (samples to adapt, not a production Helm
chart):

- `configmap.yaml` — backend `JR_*` settings and an optional `custom.css`.
- `app-deployment.yaml` — the app `Deployment` + `Service` + `Ingress` with
  `livenessProbe: /livez`, `readinessProbe: /readyz`, non-root `securityContext`
  (uid 10001, read-only root FS, writable `/tmp` emptyDir), CPU/memory
  `resources`, and the `custom.css` ConfigMap mounted over
  `/app/static/custom.css`. The Service exposes port 80 → targetPort 8000; the
  Ingress publishes the whole app (SPA + `/api` on one origin).
- `values-nxs-universal-chart.yaml` — values for the
  [nxs-universal-chart](https://github.com/nixys/nxs-universal-chart) (tested
  against 3.1.0) to deploy the same single container via Helm using the GHCR
  image, including the `Ingress` (default host `jinja-render.local`).

### Container image (GHCR)

The `Build and publish image` GitHub Actions workflow builds and pushes a single
image:

- `ghcr.io/dr-duke/jinja-render/app`

on pushes to `main`, `v*` tags, and manual dispatch (pull requests build but do
not push). Deploy it via the Nixys chart into the `jinja-render` namespace,
overriding the image tag to a pushed `sha-<short>` or `v*` tag:

```bash
helm upgrade --install jinja-render \
  oci://registry.nixys.ru/nuc/nxs-universal-chart --version 3.1.0 \
  -n jinja-render --create-namespace \
  -f k8s/values-nxs-universal-chart.yaml \
  --set 'deployments.app.containers.app.imageTag=sha-abc1234'
```

The chart has no namespace value, so the namespace comes from Helm
(`-n jinja-render --create-namespace`). The Ingress exposes the whole app on one
origin. Override the host with
`--set 'ingresses.jinja-render\.local.hosts[0].hostname=your.host'`.

See `k8s/README.md` for apply instructions and notes (per-pod rate limiting,
ingress/TLS left to the cluster operator).

## License

This project is licensed under the **MIT License** — a permissive free-software
license that allows use, copying, modification, merging, publishing,
distribution, sublicensing, and sale, provided the copyright and license notice
are retained. The software is provided "as is", without warranty of any kind.
See [`LICENSE`](./LICENSE) for the full text. This section is informational and
not legal advice.

## Example templates

See `GET /api/v1/examples` or `backend/app/services/examples.py` for ready-made
template/data pairs (basic loop, `hash` filter, `ipaddr` filter).

## Open assumptions (decided by the implementation)

- **Editor:** plain `<textarea>`-based component rather than Monaco/CodeMirror,
  chosen for offline-build robustness and simple, dependency-light tests. Can be
  upgraded behind the existing `Editor` component without touching the rest.
- **Styling:** plain CSS, not Tailwind.
- **Whitespace visualization:** computed on the backend, displayed on the frontend.
- **`auto` parsing:** JSON first, then YAML (deterministic).
- Debounced live-render was intentionally not added; render is manual + hotkey.
