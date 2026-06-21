import { describe, expect, it } from "vitest";
import { EditorState, EditorSelection } from "@codemirror/state";
import {
  INDENT_UNIT,
  indentLessSpaces,
  indentMoreSpaces,
} from "../components/editor/indent";

// Apply a transaction spec to a state and return the resulting document text.
function applySpec(
  state: EditorState,
  build: (s: EditorState) => ReturnType<typeof indentMoreSpaces>,
): string {
  const spec = build(state);
  if (!spec) return state.doc.toString();
  return state.update(spec).state.doc.toString();
}

// Build a state with the cursor/selection at the given anchor/head offsets.
function stateAt(doc: string, anchor: number, head = anchor): EditorState {
  return EditorState.create({
    doc,
    selection: EditorSelection.single(anchor, head),
  });
}

describe("two-space block indent", () => {
  it("uses a two-space indent unit", () => {
    expect(INDENT_UNIT).toBe("  ");
  });

  describe("Tab (indentMoreSpaces)", () => {
    it("adds two spaces to the current line when there is no selection", () => {
      const s = stateAt("alpha\nbeta\ngamma", 2); // cursor on line 1
      expect(applySpec(s, indentMoreSpaces)).toBe("  alpha\nbeta\ngamma");
    });

    it("indents the current line regardless of cursor column", () => {
      const s = stateAt("alpha\nbeta", 8); // cursor inside "beta"
      expect(applySpec(s, indentMoreSpaces)).toBe("alpha\n  beta");
    });

    it("adds two spaces to every line intersecting a multi-line selection", () => {
      const doc = "one\ntwo\nthree\nfour";
      // Select from inside line 1 to inside line 3.
      const from = doc.indexOf("ne");
      const to = doc.indexOf("ree");
      const s = stateAt(doc, from, to);
      expect(applySpec(s, indentMoreSpaces)).toBe("  one\n  two\n  three\nfour");
    });

    it("indents already-indented lines by two more spaces", () => {
      const s = stateAt("  already\nplain", 0);
      expect(applySpec(s, indentMoreSpaces)).toBe("    already\nplain");
    });

    it("indents an empty line too", () => {
      const s = stateAt("\nx", 0);
      expect(applySpec(s, indentMoreSpaces)).toBe("  \nx");
    });
  });

  describe("Shift+Tab (indentLessSpaces)", () => {
    it("removes two leading spaces from the current line", () => {
      const s = stateAt("    indented", 6);
      expect(applySpec(s, indentLessSpaces)).toBe("  indented");
    });

    it("removes a single leading space when only one is present", () => {
      const s = stateAt(" oneSpace", 3);
      expect(applySpec(s, indentLessSpaces)).toBe("oneSpace");
    });

    it("leaves a line with no leading spaces unchanged", () => {
      const s = stateAt("noindent", 2);
      expect(applySpec(s, indentLessSpaces)).toBe("noindent");
    });

    it("never removes leading tabs (spaces only)", () => {
      const s = stateAt("\ttabbed", 1);
      expect(applySpec(s, indentLessSpaces)).toBe("\ttabbed");
    });

    it("dedents every line in a multi-line selection independently", () => {
      const doc = "    four\n  two\n one\nzero";
      const s = stateAt(doc, 0, doc.length);
      // line1: 4->2 spaces, line2: 2->0, line3: 1->0, line4: unchanged.
      expect(applySpec(s, indentLessSpaces)).toBe("  four\ntwo\none\nzero");
    });

    it("returns null when nothing can be dedented", () => {
      const s = stateAt("abc\ndef", 0);
      expect(indentLessSpaces(s)).toBeNull();
    });
  });

  it("Tab then Shift+Tab round-trips on a clean two-space line", () => {
    const start = "x\ny";
    const s1 = stateAt(start, 0);
    const indented = applySpec(s1, indentMoreSpaces);
    expect(indented).toBe("  x\ny");
    const s2 = stateAt(indented, 0);
    expect(applySpec(s2, indentLessSpaces)).toBe(start);
  });
});
