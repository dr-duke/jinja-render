import { StreamLanguage, type StreamParser } from "@codemirror/language";

// Lightweight Jinja2 highlighter built on CodeMirror's StreamLanguage. This is
// intentionally "good enough" tokenization of Jinja delimiters and their inner
// expressions rather than a full grammar: it highlights {{ }}, {% %}, {# #},
// strings, numbers, keywords, filters and operators. Text outside delimiters is
// left untokenized (it is plain template text / target output language).

export const KEYWORDS = new Set([
  "if", "elif", "else", "endif",
  "for", "endfor", "in", "recursive",
  "block", "endblock",
  "extends", "include", "import", "from", "as",
  "macro", "endmacro", "call", "endcall",
  "set", "endset",
  "filter", "endfilter",
  "with", "endwith", "without", "context",
  "autoescape", "endautoescape",
  "raw", "endraw",
  "do", "is", "not", "and", "or",
  "true", "false", "none", "True", "False", "None",
]);

type Mode = null | "expr" | "stmt" | "comment";

interface JinjaState {
  mode: Mode;
}

const parser: StreamParser<JinjaState> = {
  startState(): JinjaState {
    return { mode: null };
  },

  token(stream, state): string | null {
    // Inside a comment block: consume until the closing #}.
    if (state.mode === "comment") {
      if (stream.match(/^.*?#\}/)) {
        state.mode = null;
      } else {
        stream.skipToEnd();
      }
      return "comment";
    }

    // Outside any delimiter: look for the next opening delimiter.
    if (state.mode === null) {
      if (stream.match("{#")) {
        state.mode = "comment";
        return "comment";
      }
      if (stream.match("{{")) {
        state.mode = "expr";
        return "brace";
      }
      if (stream.match("{%")) {
        state.mode = "stmt";
        return "brace";
      }
      // Advance to the next potential delimiter start; emit plain text.
      if (stream.match(/^[^{]+/)) return null;
      stream.next();
      return null;
    }

    // Inside an expression {{ }} or statement {% %}.
    if (stream.eatSpace()) return null;

    const close = state.mode === "expr" ? "}}" : "%}";
    if (stream.match(close)) {
      state.mode = null;
      return "brace";
    }
    // Also tolerate whitespace-control variants: -}} / -%} and {{- / {%-.
    if (stream.match(state.mode === "expr" ? "-}}" : "-%}")) {
      state.mode = null;
      return "brace";
    }

    // Strings.
    if (stream.match(/^"(?:[^"\\]|\\.)*"/) || stream.match(/^'(?:[^'\\]|\\.)*'/)) {
      return "string";
    }
    // Numbers.
    if (stream.match(/^\d+\.?\d*/)) return "number";

    // The pipe introduces a filter: highlight the following name as a function.
    if (stream.eat("|")) return "operator";

    // Identifiers / keywords.
    const word = stream.match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (word) {
      const w = Array.isArray(word) ? word[0] : String(word);
      if (KEYWORDS.has(w)) return "keyword";
      return "variableName";
    }

    // Operators / punctuation.
    if (stream.match(/^(==|!=|>=|<=|\/\/|\*\*|[-+*/%<>=~.,:()[\]{}])/)) {
      return "operator";
    }

    stream.next();
    return null;
  },
};

export const jinja = () => StreamLanguage.define(parser);
