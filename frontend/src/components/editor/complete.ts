import type {
  Completion,
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete";
import { autocompletion } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import type { Capabilities, DataFormat, RenderMode } from "../../types/api";
import { extractVariablePaths } from "./vars";
import {
  ANSIBLE_FACTS_FALLBACK,
  BUILTIN_FILTERS,
  KEYWORDS,
  PROJECT_FILTERS_FALLBACK,
  SNIPPETS,
  TESTS,
} from "./jinjaData";

// Provider of the live editor context the completion source needs. Read lazily
// so completions always reflect the current Data panel and render mode without
// rebuilding the editor extension. getCapabilities is optional: when present and
// loaded, project filters and ansible facts come from the backend (accurate
// per-mode set with descriptions); otherwise static fallbacks are used.
export interface CompletionEnv {
  getData: () => string;
  getDataFormat: () => DataFormat;
  getRenderMode: () => RenderMode;
  getCapabilities?: () => Capabilities | null;
}

// Project/emulated filters available after `|`: Jinja2 builtins (always) plus the
// backend filter set for the current mode (or a static fallback before
// /capabilities loads). Project filters (incl. hash/ipaddr) are ansible-only, so
// base/salt offer only Jinja2 builtins. The ansible mode surfaces the full
// emulated Templar set (hash, ipaddr, combine, regex_*, set ops, …) with
// one-line descriptions from the server.
function filterCompletions(env: CompletionEnv): Completion[] {
  const caps = env.getCapabilities?.() ?? null;
  if (!caps) {
    // No capabilities yet: project filters exist only in ansible mode.
    const fallback =
      env.getRenderMode() === "ansible" ? PROJECT_FILTERS_FALLBACK : [];
    return [...BUILTIN_FILTERS, ...fallback];
  }
  const names = caps.filtersByMode[env.getRenderMode()] ?? [];
  const project: Completion[] = names.map((name) => ({
    label: name,
    type: "function",
    detail: "filter · project",
    info: caps.filterDescriptions[name] ?? `Project filter: ${name}`,
  }));
  return [...BUILTIN_FILTERS, ...project];
}

// Emulated ansible facts (offered only in ansible mode), from the backend when
// available, else the static fallback.
function factCompletions(env: CompletionEnv): Completion[] {
  const caps = env.getCapabilities?.() ?? null;
  if (!caps || caps.ansibleFacts.length === 0) return ANSIBLE_FACTS_FALLBACK;
  return caps.ansibleFacts.map((name) => ({
    label: name,
    type: "variable",
    detail: "ansible fact",
    info: `Emulated, static host fact (ansible mode); user data overrides it: ${name}`,
  }));
}

// Determine whether the cursor sits inside a Jinja delimiter, and which kind.
// We scan backwards from the cursor for the nearest opening vs closing marker.
type DelimKind = "expr" | "stmt" | "comment" | null;

function delimiterContext(before: string): DelimKind {
  // Find the most recent opening marker; we're inside it only if its matching
  // closing marker does not appear after it.
  const opens: { pos: number; kind: Exclude<DelimKind, null>; close: string }[] = [
    { pos: before.lastIndexOf("{{"), kind: "expr", close: "}}" },
    { pos: before.lastIndexOf("{%"), kind: "stmt", close: "%}" },
    { pos: before.lastIndexOf("{#"), kind: "comment", close: "#}" },
  ];
  const latest = opens.reduce((a, b) => (b.pos > a.pos ? b : a));
  if (latest.pos === -1) return null;
  return before.lastIndexOf(latest.close) > latest.pos ? null : latest.kind;
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
      return { from, options: filterCompletions(env), validFor: /^\w*$/ };
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
    if (env.getRenderMode() === "ansible") options.push(...factCompletions(env));
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
