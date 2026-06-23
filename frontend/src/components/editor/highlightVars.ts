import {
  Decoration,
  type DecorationSet,
  ViewPlugin,
  type ViewUpdate,
  EditorView,
} from "@codemirror/view";
import { RangeSetBuilder, type Extension } from "@codemirror/state";
import type { CompletionEnv } from "./complete";
import { extractVariablePaths } from "./vars";
import { ANSIBLE_FACTS_FALLBACK } from "./jinjaData";
import { KEYWORDS } from "./jinja";

// Semantic variable highlighting for the template editor. Root identifiers used
// inside Jinja delimiters ({{ }} / {% %}) are marked as "known" (defined in the
// Data panel, declared via {% set %} / {% for %}, or an emulated ansible fact in
// ansible mode) or "unknown" (none of the above — likely a typo). Decorations are
// marks on the real text, so selection/copy are unaffected.

const knownMark = Decoration.mark({ class: "cm-jinja-var-known" });
const unknownMark = Decoration.mark({ class: "cm-jinja-var-unknown" });

const IDENT_START = /[A-Za-z_]/;
const IDENT = /[A-Za-z0-9_]/;
const DIGIT = /[0-9]/;

// Build the set of "known" root variable names: Data-panel roots, local names
// from {% set %} / {% for %} anywhere in the template, and (ansible mode only)
// emulated fact names.
function knownRoots(env: CompletionEnv, docText: string): Set<string> {
  const roots = new Set<string>();

  for (const path of extractVariablePaths(env.getData(), env.getDataFormat())) {
    roots.add(path.split(".")[0]);
  }

  // {% set NAME = ... %}  (also {%- set ... %})
  for (const m of docText.matchAll(/\{%-?\s*set\s+([A-Za-z_]\w*)/g)) {
    roots.add(m[1]);
  }
  // {% for X in ... %} and {% for K, V in ... %}
  for (const m of docText.matchAll(
    /\{%-?\s*for\s+([A-Za-z_]\w*)(?:\s*,\s*([A-Za-z_]\w*))?\s+in\b/g,
  )) {
    roots.add(m[1]);
    if (m[2]) roots.add(m[2]);
  }

  if (env.getRenderMode() === "ansible") {
    const caps = env.getCapabilities?.() ?? null;
    const facts =
      caps && caps.ansibleFacts.length > 0
        ? caps.ansibleFacts
        : ANSIBLE_FACTS_FALLBACK.map((c) => String(c.label));
    for (const f of facts) roots.add(f);
  }

  return roots;
}

type Mode = null | "expr" | "stmt" | "comment";

function buildDecorations(view: EditorView, env: CompletionEnv): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const known = knownRoots(env, view.state.doc.toString());

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    let mode: Mode = null;
    // Last significant (non-space) char before the current position, used to
    // detect attribute access (".") and filter names ("|").
    let prev = "";
    let i = 0;
    const n = text.length;

    while (i < n) {
      if (mode === null) {
        if (text.startsWith("{#", i)) {
          mode = "comment";
          i += 2;
        } else if (text.startsWith("{{", i)) {
          mode = "expr";
          prev = "";
          i += 2;
        } else if (text.startsWith("{%", i)) {
          mode = "stmt";
          prev = "";
          i += 2;
        } else {
          i += 1;
        }
        continue;
      }

      if (mode === "comment") {
        if (text.startsWith("#}", i)) {
          mode = null;
          i += 2;
        } else {
          i += 1;
        }
        continue;
      }

      // Inside an expression or statement.
      const close = mode === "expr" ? "}}" : "%}";
      if (text.startsWith(close, i)) {
        mode = null;
        prev = "";
        i += 2;
        continue;
      }

      const ch = text[i];

      if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
        i += 1; // whitespace does not change `prev`
        continue;
      }

      // Strings: skip over, honoring backslash escapes.
      if (ch === '"' || ch === "'") {
        i += 1;
        while (i < n && text[i] !== ch) {
          if (text[i] === "\\") i += 1;
          i += 1;
        }
        i += 1; // closing quote
        prev = "s";
        continue;
      }

      // Numbers: consume so a decimal point isn't seen as attribute access.
      if (DIGIT.test(ch)) {
        i += 1;
        while (i < n && (IDENT.test(text[i]) || text[i] === ".")) i += 1;
        prev = "0";
        continue;
      }

      // Identifiers.
      if (IDENT_START.test(ch)) {
        const start = i;
        i += 1;
        while (i < n && IDENT.test(text[i])) i += 1;
        const word = text.slice(start, i);

        // Look ahead for a kwarg (`name=`, but not `name==`).
        let j = i;
        while (j < n && (text[j] === " " || text[j] === "\t")) j += 1;
        const isKwarg = text[j] === "=" && text[j + 1] !== "=";

        const isAttr = prev === ".";
        const isFilter = prev === "|";
        const isKeyword = KEYWORDS.has(word);

        if (!isAttr && !isFilter && !isKwarg && !isKeyword) {
          builder.add(
            from + start,
            from + i,
            known.has(word) ? knownMark : unknownMark,
          );
        }
        prev = "w";
        continue;
      }

      // Any other char (operator / punctuation): remember "." and "|".
      prev = ch;
      i += 1;
    }
  }

  return builder.finish();
}

function variableHighlightPlugin(env: CompletionEnv) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, env);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged) {
          this.decorations = buildDecorations(u.view, env);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
}

// known: accent blue (matches the property color in the syntax theme).
// unknown: warm amber with a subtle wavy underline — a hint, not an error.
const variableTheme = EditorView.baseTheme({
  ".cm-jinja-var-known": { color: "#82aaff" },
  ".cm-jinja-var-unknown": {
    color: "#ffb454",
    textDecoration: "underline wavy",
    textDecorationColor: "rgba(255, 180, 84, 0.5)",
  },
});

export function jinjaVariableHighlight(env: CompletionEnv): Extension {
  return [variableHighlightPlugin(env), variableTheme];
}
