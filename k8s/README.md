# Kubernetes reference manifests

Sample manifests for deploying `jinja-render`. These are **reference examples to
adapt**, not a production-ready Helm chart. They demonstrate the project's
config-via-ConfigMap, probes, non-root securityContext, resource limits, and the
runtime CSS override.

## Files

- `configmap.yaml` — backend `JR_*` settings (`jinja-render-config`) and an
  optional frontend CSS override (`jinja-render-custom-css`).
- `backend-deployment.yaml` — backend `Deployment` + `Service`. Probes:
  `livenessProbe: /livez`, `readinessProbe: /readyz` (verifies the render worker
  pool). Runs non-root with dropped capabilities and a read-only root FS.
- `frontend-deployment.yaml` — frontend `Deployment` + `Service`. Built on the
  unprivileged nginx image, it listens on container port **8080** as uid 101
  (runs fully non-root, no `NET_BIND_SERVICE`, no entrypoint writes to read-only
  paths); the Service exposes port 80 → targetPort 8080. Runs with a **read-only
  root filesystem**: nginx's pid (the image default `/tmp/nginx.pid`) and temp
  files (`/tmp/nginx/*`) are kept on a writable `nginx-tmp` `emptyDir` mounted at
  `/tmp` (the pod's `fsGroup: 101` makes that volume writable by the non-root
  user). Also mounts the `custom.css` ConfigMap over
  `/usr/share/nginx/html/custom.css`.

## Build and load images

The manifests reference `jinja-render-backend:latest` and
`jinja-render-frontend:latest`. Build and make them available to your cluster,
e.g. with a local kind/minikube cluster:

```bash
docker build -t jinja-render-backend:latest ./backend
docker build -t jinja-render-frontend:latest ./frontend
# kind:
kind load docker-image jinja-render-backend:latest jinja-render-frontend:latest
# minikube: eval $(minikube docker-env) before building, or `minikube image load ...`
```

Replace the `image:` fields with your registry path for a real cluster.

## Apply

These manifests carry no `namespace:` field, so create one and target it:

```bash
kubectl create namespace jinja-render
kubectl -n jinja-render apply -f k8s/configmap.yaml
kubectl -n jinja-render apply -f k8s/backend-deployment.yaml
kubectl -n jinja-render apply -f k8s/frontend-deployment.yaml
```

Port-forward to try it locally (Service port 80 → container 8080):

```bash
kubectl -n jinja-render port-forward svc/jinja-render-frontend 8080:80
# open http://localhost:8080
```

The frontend calls a relative `/api`; in this split-Service layout you will
typically front both Services with an Ingress, or adjust
`frontend/nginx.conf` (`set $backend_upstream`) to point at the backend Service
DNS name (`jinja-render-backend:8000`).

## Deploy with the Nixys universal chart

As an alternative to the raw manifests above, `values-nxs-universal-chart.yaml`
deploys the same backend + frontend (Services, probes, ConfigMap, CSS override)
through the [nxs-universal-chart](https://github.com/nixys/nxs-universal-chart)
(tested against chart **3.1.0**). It uses the chart's real values schema
(`deployments`, `services`, `configMaps`, container map with `image`/`imageTag`).

This path consumes the images published to GHCR by the
`Build and publish images` workflow:

- `ghcr.io/dr-duke/jinja-render/backend`
- `ghcr.io/dr-duke/jinja-render/frontend`

### After the repo and images are published

The `image:` fields in `k8s/values-nxs-universal-chart.yaml` already point at the
`dr-duke/jinja-render` GHCR paths. Render to inspect, then install. **Override the
image tags to the tag/sha you actually pushed** (the file defaults to `latest`):

The chart has no namespace value of its own — every resource lands in the Helm
**release namespace**. Install into `jinja-render` with `-n jinja-render
--create-namespace`:

```bash
# Inspect the rendered manifests first (namespace must be supplied here too)
helm template jinja-render \
  oci://registry.nixys.ru/nuc/nxs-universal-chart --version 3.1.0 \
  -n jinja-render -f k8s/values-nxs-universal-chart.yaml

# Install / upgrade into the jinja-render namespace, pinning to a pushed tag/sha
helm upgrade --install jinja-render \
  oci://registry.nixys.ru/nuc/nxs-universal-chart --version 3.1.0 \
  -n jinja-render --create-namespace \
  -f k8s/values-nxs-universal-chart.yaml \
  --set 'deployments.backend.containers.backend.imageTag=sha-abc1234' \
  --set 'deployments.frontend.containers.frontend.imageTag=sha-abc1234'
```

The `sha-<short>` tags are produced by the workflow's `type=sha` metadata; a
released `v*` tag (e.g. `1.2.3`) works too.

> The chart prefixes resource names with the release name, so the Service for
> the frontend is `jinja-render-frontend` (matching the raw-manifest name used
> in the port-forward command below).

### Ingress and host

The values file defines an `Ingress` that exposes **only the frontend**; the SPA
proxies `/api` and `/healthz` to the backend in-cluster (see
`frontend/nginx.conf`), so the backend is never published externally. The
default host is `jinja-render.local` with `ingressClassName: nginx`.

Override the host (and class, if your controller differs):

```bash
helm upgrade --install jinja-render \
  oci://registry.nixys.ru/nuc/nxs-universal-chart --version 3.1.0 \
  -n jinja-render --create-namespace \
  -f k8s/values-nxs-universal-chart.yaml \
  --set 'ingresses.jinja-render\.local.hosts[0].hostname=jinja.example.com'
```

For local testing, point `jinja-render.local` at your ingress controller's IP in
`/etc/hosts`, or skip the Ingress entirely and port-forward:

```bash
kubectl -n jinja-render port-forward svc/jinja-render-frontend 8080:80
# open http://localhost:8080
```

The frontend Service listens on port 80 and targets the container's **8080**
(nginx runs non-root on 8080 — see the port note below).

### Updating a running deployment (avoid stale images)

The images use the floating **`latest`** tag. If a pod keeps running an old
image after you push a new one (e.g. the frontend still tries to bind `:80`
after the 8080 fix), the node is serving a cached `latest`. The values file sets
`imagePullPolicy: Always` to prevent this, but to force an already-running
deployment to pick up a freshly pushed image:

```bash
# Re-pull and restart (works because imagePullPolicy: Always)
kubectl -n jinja-render rollout restart deployment/jinja-render-frontend
kubectl -n jinja-render rollout status  deployment/jinja-render-frontend

# Or hard-delete the pod(s) so they are recreated and re-pulled
kubectl -n jinja-render delete pod -l app.kubernetes.io/name=jinja-render
```

**Recommended for reproducible deploys:** pin a concrete tag (the workflow
publishes `sha-<short>` and, on releases, `v*`) instead of relying on `latest`:

```bash
helm upgrade --install jinja-render \
  oci://registry.nixys.ru/nuc/nxs-universal-chart --version 3.1.0 \
  -n jinja-render --create-namespace \
  -f k8s/values-nxs-universal-chart.yaml \
  --set 'deployments.frontend.containers.frontend.imageTag=sha-abc1234' \
  --set 'deployments.backend.containers.backend.imageTag=sha-abc1234'
```

A new immutable tag changes the pod spec, so Kubernetes always rolls out and
pulls the right image regardless of pull policy.

### Troubleshooting: nginx pid/temp permission errors

If the frontend pod crash-loops with a log line like:

```
nginx: [emerg] open() "/tmp/nginx.pid" failed (13: Permission denied)
```

nginx cannot write its pid or temp files because the root filesystem is
read-only and the writable scratch dir is missing or not owned by the runtime
user. The fix is already baked into these manifests:

- nginx keeps its pid at the image default `/tmp/nginx.pid` (NOT overridden —
  the unprivileged image already declares `pid /tmp/nginx.pid;`, so re-setting
  it via `-g` would be a duplicate-directive error) and writes temp files under
  `/tmp/nginx` (temp paths set in `nginx.conf`);
- a writable `nginx-tmp` `emptyDir` is mounted at `/tmp`, covering both;
- the pod sets `fsGroup: 101` so that emptyDir is group-writable by uid 101.

If you adapt these manifests and hit this error, verify all three are present.
A quick check on a running pod:

```bash
kubectl -n jinja-render exec deploy/jinja-render-frontend -- sh -c \
  'nginx -T | grep -E "pid|temp_path"; ls -ld /tmp'
```

`/tmp` should be writable by gid 101, and the pid should resolve to
`/tmp/nginx.pid`.

## Runtime CSS override

`index.html` always loads `/custom.css` last, so it overrides bundled styles.
nginx serves the mounted ConfigMap file if present and an empty no-op stylesheet
otherwise (no 404). To restyle a running deployment without rebuilding the image:

```bash
kubectl edit configmap jinja-render-custom-css   # edit the custom.css key
kubectl rollout restart deployment/jinja-render-frontend
```

## Configuration

All backend runtime config is supplied via the `jinja-render-config` ConfigMap
(`envFrom`). The full list of `JR_*` variables and defaults is documented in
`backend/.env.example`. No secrets are required (no auth / database in MVP).

## Notes and limitations

- **Rate limiting is per-pod.** The in-process token bucket counts requests per
  replica. For a global limit, enforce it at the Ingress or use a shared
  (e.g. Redis-backed) counter.
- **ansible hostfacts are static and fabricated** — real host facts are never
  gathered.
- **Frontend port 8080 / non-root / read-only root FS.** The frontend is built
  on `nginxinc/nginx-unprivileged`, which binds 8080 as uid 101 — so the pod runs
  fully non-root with all capabilities dropped (no `NET_BIND_SERVICE`). The pod
  securityContext pins `runAsUser: 101` (the chart's generic `runAsUser: 10001`
  is overridden for the frontend only) plus `fsGroup: 101`. The container runs
  with `readOnlyRootFilesystem: true`; nginx's pid (the base image's default
  `/tmp/nginx.pid`) and its temp paths (set in `nginx.conf`, e.g.
  `proxy_temp_path /tmp/nginx/proxy_temp`) all live under a writable `nginx-tmp`
  `emptyDir` mounted at `/tmp`. The pid path is intentionally left at the image
  default — the unprivileged image's main `nginx.conf` already declares
  `pid /tmp/nginx.pid;`, so overriding it (e.g. via `-g 'pid ...'`) is a
  duplicate-directive error; mounting the emptyDir at `/tmp` simply makes that
  default path writable. The Service still exposes port 80 (targetPort 8080).
- **Raw manifests omit Ingress, TLS, HPA/autoscaling, NetworkPolicies, and
  PodDisruptionBudgets** — add them per your cluster's standards. The Nixys chart
  values file (above) does define an Ingress for the frontend.
