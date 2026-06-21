from __future__ import annotations

import time

import pytest

from app.core.errors import RenderError
from app.services.renderer import RenderOptions, get_pool, render_template

TIMEOUT = 2.0


def test_base_render():
    res = render_template("Hello {{ name }}", {"name": "world"}, RenderOptions(), "base", timeout=TIMEOUT)
    assert res.rendered == "Hello world"


def test_ansible_mode_render():
    res = render_template("{{ ip | ipaddr('network') }}", {"ip": "10.0.0.5/8"}, RenderOptions(), "ansible", timeout=TIMEOUT)
    assert res.rendered == "10.0.0.0"


def test_salt_mode_render():
    res = render_template("{{ a + b }}", {"a": 2, "b": 3}, RenderOptions(), "salt", timeout=TIMEOUT)
    assert res.rendered == "5"


def test_strict_undefined_raises():
    with pytest.raises(RenderError) as exc:
        render_template("{{ missing }}", {}, RenderOptions(strict=True), "base", timeout=TIMEOUT)
    assert exc.value.type == "undefined_error"


def test_non_strict_undefined_renders_empty():
    res = render_template("[{{ missing }}]", {}, RenderOptions(strict=False), "base", timeout=TIMEOUT)
    assert res.rendered == "[]"


def test_trim_blocks():
    tmpl = "{% if true %}\nX\n{% endif %}\n"
    trimmed = render_template(tmpl, {}, RenderOptions(trim=True), "base", timeout=TIMEOUT).rendered
    not_trimmed = render_template(tmpl, {}, RenderOptions(trim=False), "base", timeout=TIMEOUT).rendered
    assert trimmed == "X\n"
    assert not_trimmed == "\nX\n\n"


def test_lstrip_blocks():
    tmpl = "    {% if true %}X{% endif %}"
    lstripped = render_template(tmpl, {}, RenderOptions(lstrip=True, trim=False), "base", timeout=TIMEOUT).rendered
    not_lstripped = render_template(tmpl, {}, RenderOptions(lstrip=False, trim=False), "base", timeout=TIMEOUT).rendered
    assert lstripped == "X"
    assert not_lstripped == "    X"


def test_syntax_error():
    with pytest.raises(RenderError) as exc:
        render_template("{% if %}", {}, RenderOptions(), "base", timeout=TIMEOUT)
    assert exc.value.type == "template_syntax_error"


def test_timeout():
    # Nested loops produce a long-running render without huge allocation,
    # so the wall-clock timeout fires before completion.
    tmpl = "{% for i in range(100000) %}{% for j in range(100000) %}{% endfor %}{% endfor %}"
    with pytest.raises(RenderError) as exc:
        render_template(tmpl, {}, RenderOptions(), "base", timeout=0.2)
    assert exc.value.type == "timeout_error"


def test_no_per_request_cold_start():
    """Persistent workers must not pay a spawn cold-start on each render.

    The previous implementation spawned a process per request, costing
    ~200ms every render. With a reused pool, steady-state renders are far
    faster. We warm the pool, then assert the median of repeated simple
    renders is well under the old per-request cold-start cost.
    """
    get_pool()  # ensure workers are started
    # Warm up the render path once (first job per worker primes imports).
    for _ in range(2):
        render_template("{{ x }}", {"x": 1}, RenderOptions(), "base", timeout=TIMEOUT)

    samples = []
    for _ in range(8):
        start = time.perf_counter()
        render_template("{{ x }}", {"x": 1}, RenderOptions(), "base", timeout=TIMEOUT)
        samples.append((time.perf_counter() - start) * 1000.0)
    samples.sort()
    median_ms = samples[len(samples) // 2]
    # Generous bound: cold-start was ~200ms; reused workers are sub-ms to
    # low-ms. 50ms leaves wide headroom for slow CI without re-admitting a
    # per-request spawn regression.
    assert median_ms < 50.0, f"median render {median_ms:.1f}ms suggests cold-start"


def test_sandbox_blocks_dangerous_access():
    with pytest.raises(RenderError):
        render_template("{{ ''.__class__.__mro__ }}", {}, RenderOptions(), "base", timeout=TIMEOUT)


def test_ansible_mode_injects_emulated_hostfacts():
    res = render_template(
        "{{ ansible_hostname }}/{{ ansible_facts.ansible_os_family }}",
        {},
        RenderOptions(),
        "ansible",
        timeout=TIMEOUT,
    )
    assert res.rendered == "node01/Debian"


def test_base_mode_has_no_hostfacts():
    res = render_template(
        "{{ ansible_hostname }}", {}, RenderOptions(strict=False), "base", timeout=TIMEOUT
    )
    assert res.rendered == ""


def test_user_data_overrides_emulated_hostfacts():
    res = render_template(
        "{{ ansible_hostname }}",
        {"ansible_hostname": "user-host"},
        RenderOptions(),
        "ansible",
        timeout=TIMEOUT,
    )
    assert res.rendered == "user-host"


def test_ansible_filter_available_in_ansible_mode():
    res = render_template(
        "{{ {'a': 1} | combine({'b': 2}) | to_json }}",
        {},
        RenderOptions(),
        "ansible",
        timeout=TIMEOUT,
    )
    assert res.rendered == '{"a": 1, "b": 2}'


def test_ansible_filter_absent_in_base_mode():
    # `combine` is an ansible-only filter; base mode must not expose it.
    with pytest.raises(RenderError) as exc:
        render_template(
            "{{ {'a': 1} | combine({'b': 2}) }}",
            {},
            RenderOptions(),
            "base",
            timeout=TIMEOUT,
        )
    assert exc.value.type in {"template_runtime_error", "template_syntax_error"}


def test_ansible_filter_absent_in_salt_mode():
    with pytest.raises(RenderError):
        render_template(
            "{{ 'foo' | regex_replace('o', '0') }}",
            {},
            RenderOptions(),
            "salt",
            timeout=TIMEOUT,
        )


def test_common_filters_still_work_in_all_modes():
    for mode in ("base", "ansible", "salt"):
        res = render_template(
            "{{ 'x' | hash('sha256') }}", {}, RenderOptions(), mode, timeout=TIMEOUT
        )
        assert len(res.rendered) == 64
