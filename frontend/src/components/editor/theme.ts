import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";

// Editor chrome theme aligned with the app's dark palette (styles.css :root).
const baseTheme = EditorView.theme(
  {
    "&": {
      color: "var(--text)",
      backgroundColor: "transparent",
      height: "100%",
      fontSize: "13px",
    },
    ".cm-content": {
      fontFamily: "var(--mono)",
      padding: "0 0 10px 0",
      caretColor: "var(--text)",
    },
    ".cm-scroller": {
      fontFamily: "var(--mono)",
      lineHeight: "1.5",
      overflow: "auto",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-gutters": {
      backgroundColor: "var(--panel)",
      color: "var(--muted)",
      border: "none",
      borderRight: "1px solid var(--border)",
    },
    ".cm-activeLine": { backgroundColor: "transparent" },
    ".cm-activeLineGutter": { backgroundColor: "transparent" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
      backgroundColor: "rgba(124, 140, 255, 0.35)",
    },
    ".cm-cursor": { borderLeftColor: "var(--text)" },
  },
  { dark: true },
);

// Token colors for Jinja / YAML / JSON. Kept compact and consistent with the
// accent-based palette.
const highlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: "#c792ea" },
  { tag: [t.string, t.special(t.string)], color: "#c3e88d" },
  { tag: t.number, color: "#f78c6c" },
  { tag: [t.bool, t.null], color: "#ff9cac" },
  { tag: [t.propertyName, t.definition(t.propertyName)], color: "#82aaff" },
  { tag: t.variableName, color: "#e4e6f1" },
  { tag: [t.operator, t.punctuation], color: "#89ddff" },
  { tag: t.comment, color: "#7f849c", fontStyle: "italic" },
  // StreamLanguage emits "brace" -> tags.brace for Jinja delimiters.
  { tag: t.brace, color: "#7c8cff", fontWeight: "bold" },
]);

export function editorTheme(): Extension {
  return [baseTheme, syntaxHighlighting(highlightStyle)];
}
