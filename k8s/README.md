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
- `frontend-deployment.yaml` — frontend `Deployment` + `Service`. nginx listens
  on container port **8080** (runs fully non-root, no `NET_BIND_SERVICE`); the
  Service exposes port 80 → targetPort 8080. Mounts the `custom.css` ConfigMap
  over `/usr/share/nginx/html/custom.css`.

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
- **Frontend port 8080.** nginx binds 8080 so the pod runs fully non-root with
  all capabilities dropped (no `NET_BIND_SERVICE`). The Service still exposes
  port 80 (targetPort 8080), so external consumers and the Ingress are unchanged.
- **Raw manifests omit Ingress, TLS, HPA/autoscaling, NetworkPolicies, and
  PodDisruptionBudgets** — add them per your cluster's standards. The Nixys chart
  values file (above) does define an Ingress for the frontend.
