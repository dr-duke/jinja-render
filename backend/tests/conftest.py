from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import create_app


@pytest.fixture
def client(monkeypatch) -> TestClient:
    # Disable rate limiting for the bulk of the suite so repeated requests in
    # a single test run are not throttled. Rate limiting is covered explicitly.
    monkeypatch.setenv("JR_rate_limit_enabled", "false")
    get_settings.cache_clear()
    app = create_app()
    try:
        yield TestClient(app)
    finally:
        get_settings.cache_clear()


@pytest.fixture
def rate_limited_client(monkeypatch) -> TestClient:
    monkeypatch.setenv("JR_rate_limit_enabled", "true")
    monkeypatch.setenv("JR_rate_limit_requests_per_minute", "60")
    monkeypatch.setenv("JR_rate_limit_burst", "2")
    get_settings.cache_clear()
    app = create_app()
    try:
        yield TestClient(app)
    finally:
        get_settings.cache_clear()
