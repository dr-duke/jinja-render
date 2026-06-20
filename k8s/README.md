# Kubernetes reference manifests

Sample manifests for deploying `jinja-render`. These are **reference examples to
adapt**, not a production-ready Helm chart. They demonstrate the project's
config-via-ConfigMap, probes, non-root securityContext, resource limits, and the
runtime CSS override.

The app ships as a **single container**: FastAPI/uvicorn serves both the API
(`/api/v1/*`, health/docs endpoints) and the built React/Vite SPA on one origin
(container port **8000**). There is no separate frontend/nginx container.

## Files

- `configmap.yaml` — backend `JR_*` settings (`jinja-render-config`) and an
  optional runtime CSS override (`jinja-render-custom-css`).
- `app-deployment.yaml` — the app `Deployment` + `Service` + `Ingress`. Probes:
  `livenessProbe: /livez`, `readinessProbe: /readyz` (verifies the render worker
  pool). Runs non-root (uid 10001) with dropped capabilities and a read-only root
  filesystem; a writable `tmp` `emptyDir` is mounted at `/tmp` for the render
  pool's transient needs. The `custom.css` ConfigMap is mounted over
  `/app/static/custom.css`. The Service exposes port 80 → targetPort 8000, and
  the Ingress publishes the whole app (SPA + `/api` on one origin).
- `values-nxs-universal-chart.yaml` — values for the
  [nxs-universal-chart](https://github.com/nixys/nxs-universal-chart) (tested
  against 3.1.0) to deploy the same single container via Helm using the GHCR
  image, including the `Ingress` (default host `jinja-render.local`).

## Build and load the image

The manifests reference `jinja-render-app:latest`. Build it (the root multi-stage
`Dockerfile` builds the SPA with Node, then serves it with FastAPI) and make it
available to your cluster, e.g. with a local kind/minikube cluster:

```bash
docker build -t jinja-render-app:latest .
# kind:
kind load docker-image jinja-render-app:latest
# minikube: eval $(minikube docker-env) before building, or `minikube image load ...`
```

Replace the `image:` field with your registry path for a real cluster.

## Apply

These manifests carry no `namespace:` field, so create one and target it:

```bash
kubectl create namespace jinja-render
kubectl -n jinja-render apply -f k8s/configmap.yaml
kubectl -n jinja-render apply -f k8s/app-deployment.yaml
```

Port-forward to try it locally (Service port 80 → container 8000):

```bash
kubectl -n jinja-render port-forward svc/jinja-render 8080:80
# open http://localhost:8080
```

Because the API and SPA share one origin, the frontend calls a same-origin
`/api/v1` — no proxy or in-cluster upstream rewiring is needed.

## Deploy with the Nixys universal chart

As an alternative to the raw manifests above, `values-nxs-universal-chart.yaml`
deploys the same single app container (Service, Ingress, probes, ConfigMap, CSS
override) through the [nxs-universal-chart](https://github.com/nixys/nxs-universal-chart)
(tested against chart **3.1.0**). It uses the chart's real values schema
(`deployments`, `services`, `ingresses`, `configMaps`, container map with
`image`/`imageTag`).

This path consumes the image published to GHCR by the
`Build and publish image` workflow:

- `ghcr.io/dr-duke/jinja-render/app`

### After the repo and image are published

The `image:` field in `k8s/values-nxs-universal-chart.yaml` already points at the
`dr-duke/jinja-render` GHCR path. Render to inspect, then install. **Override the
image tag to the tag/sha you actually pushed** (the file defaults to `latest`):

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
  --set 'deployments.app.containers.app.imageTag=sha-abc1234'
```

The `sha-<short>` tags are produced by the workflow's `type=sha` metadata; a
released `v*` tag (e.g. `1.2.3`) works too.

> The chart prefixes resource names with the release name, so the Service is
> `jinja-render` (matching the raw-manifest name used in the port-forward command
> above).

### Ingress and host

The values file defines an `Ingress` that exposes the **whole app** (SPA + `/api`
on the same origin). The default host is `jinja-render.local` with
`ingressClassName: nginx`.

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
kubectl -n jinja-render port-forward svc/jinja-render 8080:80
# open http://localhost:8080
```

### Updating a running deployment (avoid stale images)

The image uses the floating **`latest`** tag. If a pod keeps running an old image
after you push a new one, the node is serving a cached `latest`. The values file
sets `imagePullPolicy: Always` to prevent this, but to force an already-running
deployment to pick up a freshly pushed image:

```bash
# Re-pull and restart (works because imagePullPolicy: Always)
kubectl -n jinja-render rollout restart deployment/jinja-render
kubectl -n jinja-render rollout status  deployment/jinja-render

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
  --set 'deployments.app.containers.app.imageTag=sha-abc1234'
```

A new immutable tag changes the pod spec, so Kubernetes always rolls out and
pulls the right image regardless of pull policy.

### Read-only root filesystem and /tmp

The container runs with `readOnlyRootFilesystem: true`. The multiprocessing
render pool needs a writable scratch path on some platforms, so a `tmp`
`emptyDir` is mounted at `/tmp`. The app itself does not normally write to disk.
If you adapt these manifests and the pool fails to start under a read-only root,
verify the `/tmp` emptyDir is present.

## Runtime CSS override

`index.html` always loads `/custom.css` last, so it overrides bundled styles.
FastAPI serves the mounted ConfigMap file if present (as `text/css`) and an empty
no-op stylesheet otherwise (never a 404). The file is mounted over
`/app/static/custom.css` (the path FastAPI serves `/custom.css` from). To restyle
a running deployment without rebuilding the image:

```bash
kubectl edit configmap jinja-render-custom-css   # edit the custom.css key
kubectl rollout restart deployment/jinja-render
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
- **Single container, non-root, read-only root FS.** The app runs as uid 10001
  with all capabilities dropped and `readOnlyRootFilesystem: true`. uvicorn binds
  container port 8000 (>1024, so no `NET_BIND_SERVICE`). A writable `tmp`
  `emptyDir` mounted at `/tmp` covers the render pool's transient needs.
- **Raw manifests include an Ingress but omit TLS, HPA/autoscaling,
  NetworkPolicies, and PodDisruptionBudgets** — add them per your cluster's
  standards.
