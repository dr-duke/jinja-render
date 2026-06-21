import type { EditorState, TransactionSpec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import type { KeyBinding } from "@codemirror/view";

// Block indentation uses exactly two spaces, matching the project's two-space
// convention. Tab indents, Shift+Tab dedents, both operating on whole lines.
export const INDENT_UNIT = "  ";

// Collect the line numbers (1-based) intersecting every selection range. A line
// is included even when the selection is just a cursor sitting on it, so Tab with
// no selection indents the current line.
function affectedLines(state: EditorState): number[] {
  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
    const fromLine = state.doc.lineAt(range.from).number;
    const toLine = state.doc.lineAt(range.to).number;
    for (let n = fromLine; n <= toLine; n++) lines.add(n);
  }
  return [...lines].sort((a, b) => a - b);
}

// Build a transaction that prepends two spaces to the start of each affected
// line. Returns null when there is nothing to change (never happens here, but
// keeps the type honest). Selection is remapped through the changes so it tracks
// the inserted spaces naturally.
export function indentMoreSpaces(state: EditorState): TransactionSpec | null {
  const changes = affectedLines(state).map((n) => {
    const line = state.doc.line(n);
    return { from: line.from, insert: INDENT_UNIT };
  });
  if (changes.length === 0) return null;
  // No explicit selection: CodeMirror maps the existing selection through the
  // changes, so the cursor/selection tracks the inserted spaces naturally.
  return { changes, userEvent: "input.indent" };
}

// Build a transaction that removes up to two leading spaces from each affected
// line. A line with one leading space loses one; a line with none is untouched.
// Tabs and non-space characters are never removed.
export function indentLessSpaces(state: EditorState): TransactionSpec | null {
  const changes: { from: number; to: number }[] = [];
  for (const n of affectedLines(state)) {
    const line = state.doc.line(n);
    let remove = 0;
    while (remove < INDENT_UNIT.length && line.text[remove] === " ") remove++;
    if (remove > 0) changes.push({ from: line.from, to: line.from + remove });
  }
  if (changes.length === 0) return null;
  return { changes, userEvent: "delete.dedent" };
}

// Keymap applied only to editable input panels (template, data). Output is
// read-only and never receives this keymap, so Tab keeps its default behavior
// there. Returning true marks the key handled (prevents focus traversal /
// default Tab insertion) only when we actually dispatch a change.
export function indentKeymap() {
  const bindings: KeyBinding[] = [
    {
      key: "Tab",
      run: (view) => {
        const spec = indentMoreSpaces(view.state);
        if (!spec) return false;
        view.dispatch(view.state.update(spec));
        return true;
      },
    },
    {
      key: "Shift-Tab",
      run: (view) => {
        const spec = indentLessSpaces(view.state);
        if (!spec) {
          // Nothing to dedent, but still swallow the key so focus does not jump
          // out of the editor unexpectedly.
          return true;
        }
        view.dispatch(view.state.update(spec));
        return true;
      },
    },
  ];
  return keymap.of(bindings);
}
