import { Decoration, type DecorationSet, ViewPlugin, type ViewUpdate, EditorView } from "@codemirror/view";
import { RangeSetBuilder, type Extension } from "@codemirror/state";

// Frontend-only whitespace visualization for CodeMirror. Spaces and tabs get a
// decorative glyph rendered via CSS ::after on a mark decoration; the real
// character stays in the document, so copy/selection (which CodeMirror derives
// from the document, not the DOM) never picks up the glyph. Newlines are shown
// with a trailing widget glyph on the line.
//
// Glyphs mirror the previous overlay: space -> ·, tab -> ⇥, newline -> ↵.

const spaceDeco = Decoration.mark({ class: "cm-ws-space" });
const tabDeco = Decoration.mark({ class: "cm-ws-tab" });

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const pos = from + i;
      if (ch === " ") builder.add(pos, pos + 1, spaceDeco);
      else if (ch === "\t") builder.add(pos, pos + 1, tabDeco);
    }
  }
  return builder.finish();
}

const whitespacePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) {
        this.decorations = buildDecorations(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

// Theme for the decorative glyphs. The marker is drawn with ::after and is
// non-selectable; the real whitespace char keeps its width so alignment holds.
const whitespaceTheme = EditorView.baseTheme({
  ".cm-ws-space": { position: "relative" },
  ".cm-ws-space::after": {
    content: '"·"',
    position: "absolute",
    left: "0",
    top: "0",
    color: "var(--muted)",
    opacity: "0.55",
    pointerEvents: "none",
    userSelect: "none",
    WebkitUserSelect: "none",
  },
  ".cm-ws-tab": { position: "relative" },
  ".cm-ws-tab::after": {
    content: '"⇥"',
    position: "absolute",
    left: "0",
    top: "0",
    color: "var(--muted)",
    opacity: "0.55",
    pointerEvents: "none",
    userSelect: "none",
    WebkitUserSelect: "none",
  },
});

export function whitespaceExtension(): Extension {
  return [whitespacePlugin, whitespaceTheme];
}
