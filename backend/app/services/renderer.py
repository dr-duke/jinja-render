from __future__ import annotations

import multiprocessing as mp
import queue as queue_mod
import threading
from dataclasses import dataclass, field
from typing import Any

from jinja2 import StrictUndefined
from jinja2.exceptions import (
    TemplateRuntimeError,
    TemplateSyntaxError,
    UndefinedError,
)
from jinja2.sandbox import SandboxedEnvironment

from ..core.config import get_settings
from ..core.errors import RenderError
from .filters import filters_for_mode
from .hostfacts import merge_facts

RENDER_MODES = ["base", "ansible", "salt"]


@dataclass
class RenderOptions:
    trim: bool = True
    lstrip: bool = False


@dataclass
class RenderResult:
    rendered: str
    warnings: list[str] = field(default_factory=list)


def build_environment(options: RenderOptions, render_mode: str) -> SandboxedEnvironment:
    """Construct a sandboxed Jinja environment for a single render request.

    ``ansible`` and ``salt`` are *profile* modes sharing the base sandbox and
    custom filter set. They are NOT embedded Ansible/Salt runtimes; see README.
    """
    if render_mode not in RENDER_MODES:
        raise RenderError("validation_error", f"Unknown render mode: {render_mode!r}.")

    # Undefined variables always fail (StrictUndefined): strict checking is the
    # only supported behavior — there is no non-strict toggle.
    env = SandboxedEnvironment(
        trim_blocks=options.trim,
        lstrip_blocks=options.lstrip,
        undefined=StrictUndefined,
        autoescape=False,
        keep_trailing_newline=True,
    )
    env.filters.update(filters_for_mode(render_mode))
    return env


def _map_jinja_error(exc: Exception) -> RenderError:
    if isinstance(exc, TemplateSyntaxError):
        return RenderError(
            "template_syntax_error",
            f"Template syntax error: {exc.message}",
            line=exc.lineno,
        )
    if isinstance(exc, UndefinedError):
        return RenderError("undefined_error", f"Undefined variable: {exc}")
    if isinstance(exc, TemplateRuntimeError):
        return RenderError("template_runtime_error", f"Template runtime error: {exc}")
    return RenderError("template_runtime_error", f"Template error: {exc}")


def _prepare_context(data: Any, render_mode: str) -> tuple[dict[str, Any], list[str]]:
    """Normalize render context and apply hostfacts emulation if applicable."""
    if not isinstance(data, dict):
        context: dict[str, Any] = {"data": data}
        warnings = ["Top-level data was not a mapping; exposed as variable 'data'."]
    else:
        context = dict(data)
        warnings = []

    settings = get_settings()
    if (
        render_mode == "ansible"
        and settings.ansible_facts_enabled
        and settings.ansible_facts_default
    ):
        context = merge_facts(context)
    return context, warnings


# Use the "spawn" start method: forking a multi-threaded server process is
# unsafe and can deadlock. Spawn gives each worker a clean interpreter.
_MP_CTX = mp.get_context("spawn")


def _do_render(
    template: str,
    context: dict[str, Any],
    options: RenderOptions,
    render_mode: str,
) -> dict[str, Any]:
    """Render and return a serializable outcome dict (no exceptions escape)."""
    try:
        env = build_environment(options, render_mode)
        tmpl = env.from_string(template)
        return {"result": tmpl.render(**context)}
    except RenderError as exc:  # raised by custom filters / build_environment
        return {"error": exc.to_dict()}
    except Exception as exc:  # noqa: BLE001 - mapped to taxonomy
        return {"error": _map_jinja_error(exc).to_dict()}


def _worker_loop(req_q: Any, res_q: Any) -> None:
    """Persistent worker entrypoint: render jobs until told to stop.

    The heavy imports (this module + Jinja2/Pydantic/netaddr) happen once on
    worker startup, not per request. Each job is ``(job_id, payload)``; the
    result ``(job_id, outcome)`` is pushed back. A ``None`` job ends the loop.
    """
    while True:
        job = req_q.get()
        if job is None:
            return
        job_id, template, context, options, render_mode = job
        outcome = _do_render(template, context, options, render_mode)
        res_q.put((job_id, outcome))


class _Worker:
    """A single persistent worker process with its own request/result queues."""

    def __init__(self) -> None:
        self.req_q: Any = _MP_CTX.Queue()
        self.res_q: Any = _MP_CTX.Queue()
        self.proc = _MP_CTX.Process(
            target=_worker_loop, args=(self.req_q, self.res_q), daemon=True
        )
        self.proc.start()

    def is_alive(self) -> bool:
        return self.proc.is_alive()

    def kill(self) -> None:
        """Forcibly stop the worker and drain its queues."""
        if self.proc.is_alive():
            self.proc.terminate()
            self.proc.join(1.0)
            if self.proc.is_alive():
                self.proc.kill()
                self.proc.join()
        for q in (self.req_q, self.res_q):
            try:
                q.close()
                q.cancel_join_thread()
            except Exception:  # noqa: BLE001 - best-effort cleanup
                pass


class RenderPool:
    """Persistent pool of reusable worker processes with a hard killable timeout.

    Workers are started once and reused across requests, eliminating the
    per-request ``spawn`` cold-start (Python + Jinja2/Pydantic/netaddr import)
    that dominated latency in the previous implementation.

    A daemon thread + ``thread.join`` cannot interrupt a CPU-bound infinite
    loop in user template code. Here the parent waits on the worker's result
    queue with a timeout; on overrun it ``terminate``/``kill``s that worker and
    starts a fresh one in its place, so no runaway CPU survives the request and
    the pool stays at full capacity.
    """

    def __init__(self, size: int) -> None:
        self._size = max(1, size)
        self._lock = threading.Lock()
        self._idle: queue_mod.Queue[_Worker] = queue_mod.Queue()
        self._job_seq = 0
        for _ in range(self._size):
            self._idle.put(_Worker())

    def is_ready(self) -> bool:
        """Ready when at least one live worker can be obtained."""
        try:
            worker = self._idle.get_nowait()
        except queue_mod.Empty:
            # All workers are busy serving requests — that still means ready.
            return True
        alive = worker.is_alive()
        if not alive:
            worker = self._replace(worker)
        self._idle.put(worker)
        return True

    def _replace(self, dead: _Worker) -> _Worker:
        dead.kill()
        return _Worker()

    def shutdown(self) -> None:
        """Stop all workers. Best-effort; used in tests/teardown."""
        workers: list[_Worker] = []
        while True:
            try:
                workers.append(self._idle.get_nowait())
            except queue_mod.Empty:
                break
        for w in workers:
            try:
                w.req_q.put(None)
            except Exception:  # noqa: BLE001
                pass
            w.kill()

    def run(
        self,
        template: str,
        context: dict[str, Any],
        options: RenderOptions,
        render_mode: str,
        *,
        timeout: float,
    ) -> str:
        worker = self._idle.get()  # block until a worker is free
        if not worker.is_alive():
            worker = self._replace(worker)

        with self._lock:
            self._job_seq += 1
            job_id = self._job_seq

        timed_out = False
        try:
            worker.req_q.put((job_id, template, context, options, render_mode))
            try:
                got_id, outcome = worker.res_q.get(timeout=timeout)
            except queue_mod.Empty:
                timed_out = True
                raise RenderError(
                    "timeout_error",
                    f"Render exceeded the {timeout}s time limit.",
                )
            # Defensive: a stale result from a prior killed job should never
            # appear because killed workers are discarded, but guard anyway.
            if got_id != job_id:
                raise RenderError(
                    "internal_error", "Render worker returned a mismatched result."
                )
        finally:
            if timed_out:
                # Worker is stuck in user code; kill it and add a fresh one.
                replacement = self._replace(worker)
                self._idle.put(replacement)
            else:
                self._idle.put(worker)

        if "error" in outcome:
            raise RenderError(**_error_kwargs(outcome["error"]))
        return outcome.get("result", "")


def _error_kwargs(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "type_": payload.get("type", "internal_error"),
        "message": payload.get("message", "Render error."),
        "line": payload.get("line"),
        "column": payload.get("column"),
        "details": payload.get("details") or {},
    }


_POOL: RenderPool | None = None
_POOL_LOCK = threading.Lock()


def get_pool() -> RenderPool:
    global _POOL
    with _POOL_LOCK:
        if _POOL is None:
            _POOL = RenderPool(get_settings().render_pool_size)
        return _POOL


def render_template(
    template: str,
    data: Any,
    options: RenderOptions,
    render_mode: str,
    *,
    timeout: float,
) -> RenderResult:
    """Render ``template`` with ``data`` under a wall-clock timeout.

    The render runs in a persistent worker process from a shared pool. If it
    overruns ``timeout`` the worker is killed and replaced and a
    ``timeout_error`` is raised — this reliably reclaims CPU-bound infinite
    loops, unlike a daemon-thread join, without paying a per-request cold-start.
    """
    context, warnings = _prepare_context(data, render_mode)
    rendered = get_pool().run(
        template, context, options, render_mode, timeout=timeout
    )
    return RenderResult(rendered=rendered, warnings=warnings)
