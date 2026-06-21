import { Fragment, type ReactNode } from "react";

// Whitespace marker glyphs mirror the backend visualization style.
const SPACE = "·";
const TAB = "⇥";
const NEWLINE = "↵";

// Render text where the real whitespace characters stay as selectable/copyable
// text, and a decorative glyph is layered on top via the .ws-glyph span. The
// glyph span is aria-hidden and non-selectable, so neither drag-selection nor a
// programmatic copy of the surrounding text picks it up — only the raw character
// is part of the selection.
export function decorateWhitespace(text: string): ReactNode {
  const nodes: ReactNode[] = [];
  let i = 0;
  for (const ch of text) {
    if (ch === " " || ch === "\t") {
      const glyph = ch === " " ? SPACE : TAB;
      nodes.push(
        <span className="ws-cell" key={i}>
          {ch}
          <span className="ws-glyph" aria-hidden="true">
            {glyph}
          </span>
        </span>,
      );
    } else if (ch === "\n") {
      nodes.push(
        <Fragment key={i}>
          <span className="ws-glyph" aria-hidden="true">
            {NEWLINE}
          </span>
          {"\n"}
        </Fragment>,
      );
    } else {
      nodes.push(<Fragment key={i}>{ch}</Fragment>);
    }
    i += 1;
  }
  return nodes;
}

// Decorative, non-selectable line-number gutter for a block of text.
export function LineNumbers({ text }: { text: string }) {
  const count = text.length === 0 ? 1 : text.split("\n").length;
  const lines = Array.from({ length: count }, (_, idx) => idx + 1);
  return (
    <div className="line-numbers" aria-hidden="true">
      {lines.map((n) => (
        <span className="line-number" key={n}>
          {n}
        </span>
      ))}
    </div>
  );
}
