from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import create_app


def _build_static_dir(root: Path) -> Path:
    """Create a minimal built-SPA layout (index.html + an asset)."""
    static = root / "static"
    (static / "assets").mkdir(parents=True)
    (static / "index.html").write_text("<!doctype html><div id=root></div>", "utf-8")
    (static / "assets" / "app.js").write_text("console.log('spa')", "utf-8")
    (static / "favicon.ico").write_text("icon", "utf-8")
    return static


@pytest.fixture
def spa_client(monkeypatch, tmp_path) -> TestClient:
    static = _build_static_dir(tmp_path)
    monkeypatch.setenv("JR_rate_limit_enabled", "false")
    monkeypatch.setenv("JR_static_dir", str(static))
    get_settings.cache_clear()
    app = create_app()
    try:
        yield TestClient(app)
    finally:
        get_settings.cache_clear()


@pytest.fixture
def no_static_client(monkeypatch, tmp_path) -> TestClient:
    # Point static_dir at an empty dir so SPA serving is skipped entirely.
    empty = tmp_path / "empty"
    empty.mkdir()
    monkeypatch.setenv("JR_rate_limit_enabled", "false")
    monkeypatch.setenv("JR_static_dir", str(empty))
    get_settings.cache_clear()
    app = create_app()
    try:
        yield TestClient(app)
    finally:
        get_settings.cache_clear()


def test_root_serves_index_html(spa_client: TestClient) -> None:
    resp = spa_client.get("/")
    assert resp.status_code == 200
    assert "text/html" in resp.headers["content-type"]
    assert 'id=root' in resp.text


def test_bundled_asset_is_served(spa_client: TestClient) -> None:
    resp = spa_client.get("/assets/app.js")
    assert resp.status_code == 200
    assert "console.log('spa')" in resp.text


def test_unknown_route_falls_back_to_index(spa_client: TestClient) -> None:
    # A client-side route with no matching file returns the SPA shell, not 404.
    resp = spa_client.get("/some/spa/route")
    assert resp.status_code == 200
    assert "text/html" in resp.headers["content-type"]
    assert 'id=root' in resp.text


def test_existing_bundled_file_served_via_fallback(spa_client: TestClient) -> None:
    resp = spa_client.get("/favicon.ico")
    assert resp.status_code == 200
    assert resp.text == "icon"


def test_api_route_not_shadowed_by_spa_fallback(spa_client: TestClient) -> None:
    # The SPA catch-all must not swallow API routes.
    resp = spa_client.get("/api/v1/capabilities")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/json")


def test_health_route_not_shadowed_by_spa_fallback(spa_client: TestClient) -> None:
    resp = spa_client.get("/livez")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_custom_css_present_returns_file(monkeypatch, tmp_path) -> None:
    static = _build_static_dir(tmp_path)
    (static / "custom.css").write_text(":root{--accent:#abc}", "utf-8")
    monkeypatch.setenv("JR_rate_limit_enabled", "false")
    monkeypatch.setenv("JR_static_dir", str(static))
    get_settings.cache_clear()
    client = TestClient(create_app())
    try:
        resp = client.get("/custom.css")
        assert resp.status_code == 200
        assert "text/css" in resp.headers["content-type"]
        assert "--accent" in resp.text
    finally:
        get_settings.cache_clear()


def test_custom_css_absent_returns_empty_css(spa_client: TestClient) -> None:
    # No custom.css file mounted: empty no-op stylesheet, never a 404.
    resp = spa_client.get("/custom.css")
    assert resp.status_code == 200
    assert "text/css" in resp.headers["content-type"]
    assert resp.text == ""


def test_missing_static_dir_keeps_api_working(no_static_client: TestClient) -> None:
    # SPA serving is skipped, but the API still responds.
    api = no_static_client.get("/api/v1/capabilities")
    assert api.status_code == 200
    # Root has no SPA handler now, so it should not return index.html.
    root = no_static_client.get("/")
    assert root.status_code == 404


def test_missing_static_dir_still_serves_empty_custom_css(no_static_client: TestClient) -> None:
    resp = no_static_client.get("/custom.css")
    assert resp.status_code == 200
    assert "text/css" in resp.headers["content-type"]
    assert resp.text == ""
