from __future__ import annotations


def _render(client, **kwargs):
    body = {
        "template": "Hello {{ name }}",
        "data": "name: world",
        "data_format": "auto",
        "render_mode": "base",
        "options": {"trim": True, "lstrip": False, "strict": True},
    }
    body.update(kwargs)
    return client.post("/api/v1/render", json=body)


def test_render_success(client):
    resp = _render(client)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["rendered"] == "Hello world"
    assert data["meta"]["data_format_detected"] == "yaml"
    assert data["meta"]["render_mode_applied"] == "base"
    assert "hash" in data["meta"]["filters_enabled"]


def test_render_response_has_no_backend_whitespace_field(client):
    # Whitespace visualization is frontend-only now: the backend returns only the
    # raw rendered text and must not emit a visualized variant.
    resp = _render(client, template="a b", data="{}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["rendered"] == "a b"
    assert "rendered_visualized" not in body


def test_render_ignores_legacy_show_whitespaces_option(client):
    # Older clients may still send show_whitespaces; it must be ignored, not error.
    resp = _render(
        client,
        template="a b",
        data="{}",
        options={"trim": True, "lstrip": False, "strict": True, "show_whitespaces": True},
    )
    assert resp.status_code == 200
    assert resp.json()["rendered"] == "a b"


def test_capabilities_omits_show_whitespaces(client):
    resp = client.get("/api/v1/capabilities")
    assert resp.status_code == 200
    assert resp.json()["options"] == ["trim", "lstrip", "strict"]


def test_render_undefined_error(client):
    resp = _render(client, template="{{ missing }}", data="{}")
    assert resp.status_code == 400
    body = resp.json()
    assert body["success"] is False
    assert body["error"]["type"] == "undefined_error"


def test_render_parse_error(client):
    resp = _render(client, data="{bad json", data_format="json")
    assert resp.status_code == 400
    assert resp.json()["error"]["type"] == "parse_error"


def test_render_syntax_error(client):
    resp = _render(client, template="{% if %}", data="{}")
    assert resp.status_code == 400
    assert resp.json()["error"]["type"] == "template_syntax_error"


def test_capabilities(client):
    resp = client.get("/api/v1/capabilities")
    assert resp.status_code == 200
    data = resp.json()
    assert data["render_modes"] == ["base", "ansible", "salt"]
    # Common filters are present in every mode.
    assert {"hash", "ipaddr"} <= set(data["filters"])
    # ansible mode additionally exposes the emulated Templar filter set.
    assert data["filters_by_mode"]["base"] == ["hash", "ipaddr"]
    assert "combine" in data["filters_by_mode"]["ansible"]
    assert "combine" not in data["filters_by_mode"]["salt"]


def test_examples(client):
    resp = client.get("/api/v1/examples")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["examples"]) >= 1
    assert data["default"]["id"] == data["examples"][0]["id"]


def test_healthz(client):
    assert client.get("/healthz").json() == {"status": "ok"}


def test_metrics(client):
    _render(client)
    resp = client.get("/metrics")
    assert resp.status_code == 200
    assert "render_requests_total" in resp.text


def test_livez(client):
    resp = client.get("/livez")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_readyz(client):
    resp = client.get("/readyz")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["checks"]["render_pool"] is True


def test_openapi_schema(client):
    resp = client.get("/openapi.json")
    assert resp.status_code == 200
    assert resp.json()["info"]["title"]


def test_swagger_ui(client):
    resp = client.get("/swagger")
    assert resp.status_code == 200
    assert "swagger-ui" in resp.text.lower()


def test_render_ansible_injects_hostfacts(client):
    resp = _render(
        client,
        template="{{ ansible_hostname }}",
        data="{}",
        render_mode="ansible",
    )
    assert resp.status_code == 200
    assert resp.json()["rendered"] == "node01"


def test_rate_limit_returns_429(rate_limited_client):
    body = {
        "template": "ok",
        "data": "{}",
        "data_format": "auto",
        "render_mode": "base",
        "options": {"trim": True, "lstrip": False, "strict": True},
    }
    statuses = [
        rate_limited_client.post("/api/v1/render", json=body).status_code
        for _ in range(5)
    ]
    assert 429 in statuses
    resp = rate_limited_client.post("/api/v1/render", json=body)
    if resp.status_code == 429:
        assert resp.json()["error"]["type"] == "rate_limit_error"
        assert "Retry-After" in resp.headers
