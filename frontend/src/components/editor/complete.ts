import type {
  Completion,
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete";
import { autocompletion } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import type { DataFormat, RenderMode } from "../../types/api";
import { extractVariablePaths } from "./vars";
import {
  ANSIBLE_FACTS,
  FILTERS,
  KEYWORDS,
  SNIPPETS,
  TESTS,
} from "./jinjaData";

// Provider of the live editor context the completion source needs. Read lazily
// so completions always reflect the current Data panel and render mode without
// rebuilding the editor extension.
export interface CompletionEnv {
  getData: () => string;
  getDataFormat: () => DataFormat;
  getRenderMode: () => RenderMode;
}

// Determine whether the cursor sits inside a Jinja delimiter, and which kind.
// We scan backwards from the cursor for the nearest opening vs closing marker.
type DelimKind = "expr" | "stmt" | "comment" | null;

function delimiterContext(before: string): DelimKind {
  const openExpr = before.lastIndexOf("{{");
  const openStmt = before.lastIndexOf("{%");
  const openComment = before.lastIndexOf("{#");
  const closeExpr = before.lastIndexOf("}}");
  const closeStmt = before.lastIndexOf("%}");
  const closeComment = before.lastIndexOf("#}");

  const open = Math.max(openExpr, openStmt, openComment);
  if (open === -1) return null;
  // If a matching close occurs after the most recent open, we're outside.
  if (open === openComment && open > closeComment) return "comment";
  if (open === openExpr && open > closeExpr && openExpr >= openStmt) return "expr";
  if (open === openStmt && open > closeStmt && openStmt >= openExpr) return "stmt";
  // Re-evaluate precisely: pick the latest open and check its own close.
  if (openExpr >= openStmt && openExpr >= openComment) {
    return openExpr > closeExpr ? "expr" : null;
  }
  if (openStmt >= openExpr && openStmt >= openComment) {
    return openStmt > closeStmt ? "stmt" : null;
  }
  return openComment > closeComment ? "comment" : null;
}

function varCompletions(env: CompletionEnv): Completion[] {
  const paths = extractVariablePaths(env.getData(), env.getDataFormat());
  return paths.map((p) => ({
    label: p,
    type: "variable",
    detail: "variable · from data",
    info: `User variable from the Data panel: ${p}`,
  }));
}

// Synchronous completion source. The return type is narrowed (no Promise) so
// callers/tests can use the result directly without awaiting.
export type SyncCompletionSource = (ctx: CompletionContext) => CompletionResult | null;

export function makeJinjaCompletionSource(env: CompletionEnv): SyncCompletionSource {
  return (ctx: CompletionContext): CompletionResult | null => {
    const before = ctx.state.sliceDoc(0, ctx.pos);
    const kind = delimiterContext(before);

    // Snippets are offered even outside delimiters (they insert the delimiters),
    // matching a plain identifier word at the cursor.
    const word = ctx.matchBefore(/[\w.|]*/);

    if (kind === "comment") return null;

    // Outside any delimiter: only offer snippets (which scaffold {{ }} / {% %}).
    if (kind === null) {
      const w = ctx.matchBefore(/\w*/);
      if (!w || (w.from === w.to && !ctx.explicit)) return null;
      return { from: w.from, options: SNIPPETS, validFor: /^\w*$/ };
    }

    // After a pipe: filters. Match the partial filter name after the last `|`.
    const pipeMatch = before.match(/\|\s*(\w*)$/);
    if (pipeMatch) {
      const from = ctx.pos - pipeMatch[1].length;
      return { from, options: FILTERS, validFor: /^\w*$/ };
    }

    // After `is`: tests.
    const isMatch = before.match(/\bis\s+(?:not\s+)?(\w*)$/);
    if (isMatch) {
      const from = ctx.pos - isMatch[1].length;
      return { from, options: TESTS, validFor: /^\w*$/ };
    }

    // After a dot: nested variable keys. Match the full dotted path being typed
    // and suggest variable paths that extend the prefix before the dot.
    const dotMatch = before.match(/([A-Za-z_][\w]*(?:\.[\w]*)*)$/);
    if (dotMatch && dotMatch[1].includes(".")) {
      const typed = dotMatch[1];
      const lastDot = typed.lastIndexOf(".");
      const prefix = typed.slice(0, lastDot);
      const vars = extractVariablePaths(env.getData(), env.getDataFormat());
      const children = vars
        .filter((p) => p.startsWith(prefix + ".") && p.slice(prefix.length + 1).indexOf(".") === -1)
        .map((p) => ({
          label: p.slice(prefix.length + 1),
          type: "property",
          detail: "key · from data",
          info: `Nested key: ${p}`,
        }));
      // Offer children even if empty? No — fall through to general if none.
      if (children.length > 0) {
        return { from: ctx.pos - (typed.length - lastDot - 1), options: children, validFor: /^\w*$/ };
      }
    }

    // General context inside a delimiter: keywords (stmt-leaning), variables,
    // builtins, and snippets. In expr context, favor variables + filters via
    // pipe handled above; here we provide the broad set.
    const options: Completion[] = [];
    options.push(...varCompletions(env));
    if (kind === "stmt") options.push(...KEYWORDS);
    options.push(...SNIPPETS);
    if (env.getRenderMode() === "ansible") options.push(...ANSIBLE_FACTS);
    // A few constants/operators useful in expressions.
    if (kind === "expr") {
      options.push(
        { label: "true", type: "constant", detail: "literal", info: "Boolean true." },
        { label: "false", type: "constant", detail: "literal", info: "Boolean false." },
        { label: "none", type: "constant", detail: "literal", info: "Null value." },
      );
    }

    const from = word ? word.from : ctx.pos;
    return { from, options, validFor: /^[\w.]*$/ };
  };
}

export function jinjaAutocomplete(env: CompletionEnv): Extension {
  return autocompletion({
    override: [makeJinjaCompletionSource(env)],
    icons: true,
    defaultKeymap: true,
  });
}
