from __future__ import annotations

import hashlib

import pytest

from app.core.errors import RenderError
from app.services.filters import do_hash, do_ipaddr


def test_hash_sha256():
    assert do_hash("router-01", "sha256") == hashlib.sha256(b"router-01").hexdigest()


def test_hash_sha1():
    assert do_hash("abc", "sha1") == hashlib.sha1(b"abc").hexdigest()


def test_hash_default_is_sha256():
    assert do_hash("x") == hashlib.sha256(b"x").hexdigest()


def test_hash_invalid_algorithm():
    with pytest.raises(RenderError) as exc:
        do_hash("x", "not-a-real-algo")
    assert exc.value.type == "unsupported_filter_error"


def test_hash_non_string_is_normalized():
    assert do_hash(123) == hashlib.sha256(b"123").hexdigest()


def test_ipaddr_valid_ip_bare():
    assert do_ipaddr("192.0.2.1") == "192.0.2.1"


def test_ipaddr_invalid_returns_false():
    assert do_ipaddr("not-an-ip") is False


def test_ipaddr_cidr_queries():
    assert do_ipaddr("192.0.2.10/24", "address") == "192.0.2.10"
    assert do_ipaddr("192.0.2.10/24", "network") == "192.0.2.0"
    assert do_ipaddr("192.0.2.10/24", "netmask") == "255.255.255.0"
    assert do_ipaddr("192.0.2.10/24", "prefix") == 24


def test_ipaddr_int_query():
    assert do_ipaddr("0.0.0.1", "int") == 1


def test_ipaddr_version():
    assert do_ipaddr("::1", "version") == 6
    assert do_ipaddr("192.0.2.1", "version") == 4


def test_ipaddr_list_filters_invalid():
    result = do_ipaddr(["192.0.2.1", "bad", "192.0.2.2"], "address")
    assert result == ["192.0.2.1", "192.0.2.2"]
