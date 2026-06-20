#!/usr/bin/env python3
"""External integration smoke test for a running jinja-render deployment.

Hits the backend directly (default http://localhost:8000) and the frontend /
nginx proxy (default http://localhost:8080), exercising the documented public
behavior. Intended to be run AFTER `docker compose up -d --build`.

Exit code is non-zero if any check fails.

Usage:
    python scripts/external-integration-smoke.py
    BACKEND_URL=http://localhost:8000 FRONTEND_URL=http://localhost:8080 \
        python scripts/external-integration-smoke.py
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

BACKEND = os.environ.get("BACKEND_URL", "http://localhost:8000").rstrip("/")
FRONTEND = os.environ.get("FRONTEND_URL", "http://localhost:8080").rstrip("/")

results: list[tuple[bool, str]] = []


def record(ok: bool, name: str, detail: str = "") -> None:
    status = "PASS" if ok else "FAIL"
    line = f"{status} {name}"
    if detail:
        line += f": {detail}"
    print(line)
    results.append((ok, name))


def http(method: str, url: str, body: dict | None = None, timeout: float = 10.0):
    data = None
    headers = {}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, resp.read().decode("utf-8")


def check(name: str, method: str, url: str, body: dict | None = None,
          expect_status: int = 200, contains: str | None = None) -> None:
    try:
        status, text = http(method, url, body)
        ok = status == expect_status
        if ok and contains is not None:
            ok = contains in text
        record(ok, name, "" if ok else f"status={status} body={text[:200]}")
    except urllib.error.HTTPError as e:  # noqa: PERF203
        body_text = ""
        try:
            body_text = e.read().decode("utf-8")[:200]
        except Exception:  # pragma: no cover
            pass
        ok = e.code == expect_status and (contains is None or contains in body_text)
        record(ok, name, "" if ok else f"<HTTPError {e.code}> {body_text}")
    except Exception as e:  # noqa: BLE001
        record(False, name, str(e))


def render_body(template: str, data: str, **opts) -> dict:
    options = {"trim": True, "lstrip": False, "strict": True, "show_whitespaces": False}
    options.update(opts.pop("options", {}))
    base = {
        "template": template,
        "data": data,
        "data_format": opts.get("data_format", "auto"),
        "render_mode": opts.get("render_mode", "base"),
        "options": options,
    }
    return base


def main() -> int:
    # --- Frontend (static + proxy) ---
    check("frontend root html", "GET", f"{FRONTEND}/", contains="<div id=\"root\"")
    check("frontend nginx /api proxy", "GET", f"{FRONTEND}/api/v1/capabilities",
          contains="render_modes")

    # --- Backend health & metadata ---
    check("backend /healthz", "GET", f"{BACKEND}/healthz", contains="ok")
    check("backend /api/v1/capabilities", "GET", f"{BACKEND}/api/v1/capabilities",
          contains="ipaddr")
    check("backend /api/v1/examples", "GET", f"{BACKEND}/api/v1/examples",
          contains="examples")

    # --- Render scenarios ---
    check("render yaml", "POST", f"{BACKEND}/api/v1/render",
          render_body("Hello {{ name }}", "name: world"), contains="Hello world")
    check("render json", "POST", f"{BACKEND}/api/v1/render",
          render_body("Hello {{ name }}", '{"name": "world"}', data_format="json"),
          contains="Hello world")
    check("render strict undefined", "POST", f"{BACKEND}/api/v1/render",
          render_body("{{ missing }}", "{}"), expect_status=400,
          contains="undefined_error")
    check("render parse error", "POST", f"{BACKEND}/api/v1/render",
          render_body("{{ x }}", "{bad json", data_format="json"),
          expect_status=400, contains="parse_error")
    check("render hash filter", "POST", f"{BACKEND}/api/v1/render",
          render_body("{{ 'abc' | hash('sha256') }}", "{}"),
          contains="ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    check("render ipaddr filter", "POST", f"{BACKEND}/api/v1/render",
          render_body("{{ '192.0.2.1/24' | ipaddr('network') }}", "{}"),
          contains="192.0.2.0")
    check("render whitespace visualization", "POST", f"{BACKEND}/api/v1/render",
          render_body("a b", "{}", options={"show_whitespaces": True}),
          contains="a·b")

    failed = [name for ok, name in results if not ok]
    print()
    print(f"{len(results) - len(failed)}/{len(results)} checks passed.")
    if failed:
        print("Failed: " + ", ".join(failed))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
