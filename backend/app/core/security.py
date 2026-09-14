from __future__ import annotations

from .errors import RenderError


def check_payload_sizes(template: str, data: str, *, max_template: int, max_data: int) -> None:
    """Reject oversized payloads before any expensive work."""
    if len(template.encode("utf-8")) > max_template:
        raise RenderError(
            "validation_error",
            f"Template exceeds maximum size of {max_template} bytes.",
        )
    if len(data.encode("utf-8")) > max_data:
        raise RenderError(
            "validation_error",
            f"Data payload exceeds maximum size of {max_data} bytes.",
        )


def check_data_depth(
    value: object, *, max_depth: int, max_nodes: int | None = None
) -> None:
    """Guard against abusive parsed structures (DoS protection).

    Two independent limits:

    - ``max_depth`` rejects structures nested deeper than this. The traversal is
      iterative with an explicit stack, so a deeply nested input is rejected
      cleanly instead of overflowing Python's recursion limit (which would leak
      out as a 500 ``internal_error``).
    - ``max_nodes`` bounds the total number of node *visits*. Because YAML
      anchors/aliases produce shared references, a tiny input can expand to a
      structure with astronomically many nodes when traversed (a "billion
      laughs" bomb). Counting visits (not unique nodes) makes such an expansion
      hit the budget quickly and be rejected, before the depth check, the render,
      or response serialization can blow up on it.
    """
    stack: list[tuple[object, int]] = [(value, 0)]
    visits = 0
    while stack:
        obj, depth = stack.pop()
        visits += 1
        if max_nodes is not None and visits > max_nodes:
            raise RenderError(
                "validation_error",
                f"Parsed data expands to more than {max_nodes} nodes "
                "(possible anchor/alias expansion).",
            )
        if depth > max_depth:
            raise RenderError(
                "validation_error",
                f"Parsed data exceeds maximum nesting depth of {max_depth}.",
            )
        if isinstance(obj, dict):
            for v in obj.values():
                stack.append((v, depth + 1))
        elif isinstance(obj, (list, tuple)):
            for v in obj:
                stack.append((v, depth + 1))
