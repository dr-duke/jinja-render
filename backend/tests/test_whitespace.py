from __future__ import annotations

from app.services.whitespace import visualize


def test_visualize_space_tab_newline():
    assert visualize("a b\tc\n") == "a·b⇥c↵\n"


def test_visualize_does_not_mutate_raw():
    raw = "x y"
    _ = visualize(raw)
    assert raw == "x y"


def test_visualize_carriage_return():
    assert visualize("a\r\n") == "a␍↵\n"
