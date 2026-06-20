from __future__ import annotations

SPACE = "·"  # ·
TAB = "⇥"  # ⇥
NEWLINE = "↵"  # ↵
CARRIAGE_RETURN = "␍"  # ␍


def visualize(text: str) -> str:
    """Return a copy of ``text`` with non-printable whitespace made visible.

    The raw text is never mutated; this is a derived representation only.
    Newlines are kept (marker is prepended) so line structure is preserved.
    """
    out: list[str] = []
    for char in text:
        if char == " ":
            out.append(SPACE)
        elif char == "\t":
            out.append(TAB)
        elif char == "\n":
            out.append(NEWLINE + "\n")
        elif char == "\r":
            out.append(CARRIAGE_RETURN)
        else:
            out.append(char)
    return "".join(out)
