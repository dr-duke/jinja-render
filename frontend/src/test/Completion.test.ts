import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { makeJinjaCompletionSource, type CompletionEnv } from "../components/editor/complete";
import { extractVariablePaths } from "../components/editor/vars";
import type { Capabilities, DataFormat, RenderMode } from "../types/api";

// Build a CompletionContext positioned at the end of `doc`.
function ctxAtEnd(doc: string, explicit = true): CompletionContext {
  const state = EditorState.create({ doc });
  return {
    state,
    pos: doc.length,
    explicit,
    matchBefore(re: RegExp) {
      const line = state.doc.lineAt(doc.length);
      const text = line.text.slice(0, doc.length - line.from);
      const match = text.match(new RegExp(re.source + "$"));
      if (!match) return null;
      const from = doc.length - match[0].length;
      return { from, to: doc.length, text: match[0] };
    },
    // Unused by our source but part of the type surface.
    tokenBefore: () => null,
    aborted: false,
    addEventListener: () => {},
  } as unknown as CompletionContext;
}

const env = (
  data: string,
  format: DataFormat,
  mode: RenderMode = "base",
  capabilities: Capabilities | null = null,
): CompletionEnv => ({
  getData: () => data,
  getDataFormat: () => format,
  getRenderMode: () => mode,
  getCapabilities: () => capabilities,
});

const CAPS: Capabilities = {
  renderModes: ["base", "ansible", "salt"],
  options: ["trim", "lstrip"],
  filtersByMode: {
    base: ["hash", "ipaddr"],
    ansible: ["hash", "ipaddr", "combine", "regex_replace", "union"],
    salt: ["hash", "ipaddr"],
  },
  filterDescriptions: {
    hash: "Hash a value with a hashlib algorithm (default sha256).",
    ipaddr: "ansible-like IP/network filter.",
    combine: "Merge dictionaries (recursive + list_merge options).",
    regex_replace: "Replace text matching a regex pattern.",
    union: "Set union of two lists, preserving order.",
  },
  ansibleFacts: ["ansible_hostname", "ansible_fqdn", "ansible_facts"],
  dataFormats: ["auto", "yaml", "json"],
};

function labels(res: CompletionResult | null): string[] {
  return res ? res.options.map((o) => o.label) : [];
}

describe("variable extraction", () => {
  it("extracts nested paths from YAML", () => {
    const yaml = `user:\n  name: alice\n  role: admin\nserver:\n  interfaces:\n    eth0:\n      address: 10.0.0.1\n`;
    const paths = extractVariablePaths(yaml, "auto");
    expect(paths).toContain("user");
    expect(paths).toContain("user.name");
    expect(paths).toContain("server.interfaces.eth0.address");
  });

  it("extracts paths and array-of-object keys from JSON", () => {
    const json = '{"user":{"name":"a"},"hosts":[{"name":"web-01","ip":"1.2.3.4"}]}';
    const paths = extractVariablePaths(json, "json");
    expect(paths).toContain("user.name");
    expect(paths).toContain("hosts.name");
    expect(paths).toContain("hosts.ip");
  });

  it("returns no paths for invalid JSON (does not throw)", () => {
    expect(extractVariablePaths("{ broken", "json")).toEqual([]);
  });

  it("returns no paths for empty data", () => {
    expect(extractVariablePaths("", "auto")).toEqual([]);
  });
});

describe("jinja completion source", () => {
  it("suggests filters after a pipe", () => {
    const src = makeJinjaCompletionSource(env("", "auto"));
    const res = src(ctxAtEnd("{{ name | "));
    const ls = labels(res);
    expect(ls).toContain("default");
    expect(ls).toContain("join");
    expect(ls).toContain("hash");
    expect(ls).toContain("ipaddr");
  });

  it("suggests tests after `is`", () => {
    const src = makeJinjaCompletionSource(env("", "auto"));
    const res = src(ctxAtEnd("{% if x is "));
    const ls = labels(res);
    expect(ls).toContain("defined");
    expect(ls).toContain("undefined");
  });

  it("suggests statement keywords inside {% %}", () => {
    const src = makeJinjaCompletionSource(env("", "auto"));
    const res = src(ctxAtEnd("{% "));
    const ls = labels(res);
    expect(ls).toContain("for");
    expect(ls).toContain("if");
    expect(ls).toContain("set");
  });

  it("suggests user variables inside {{ }} from YAML data", () => {
    const yaml = "user:\n  name: alice\nport: 8080\n";
    const src = makeJinjaCompletionSource(env(yaml, "auto"));
    const res = src(ctxAtEnd("{{ "));
    const ls = labels(res);
    expect(ls).toContain("user");
    expect(ls).toContain("user.name");
    expect(ls).toContain("port");
  });

  it("suggests nested keys after a dot", () => {
    const json = '{"server":{"host":"h","port":1}}';
    const src = makeJinjaCompletionSource(env(json, "json"));
    const res = src(ctxAtEnd("{{ server."));
    const ls = labels(res);
    expect(ls).toContain("host");
    expect(ls).toContain("port");
  });

  it("offers ansible facts only in ansible mode", () => {
    const baseRes = makeJinjaCompletionSource(env("", "auto", "base"))(ctxAtEnd("{{ "));
    expect(labels(baseRes)).not.toContain("ansible_hostname");
    const ansRes = makeJinjaCompletionSource(env("", "auto", "ansible"))(ctxAtEnd("{{ "));
    expect(labels(ansRes)).toContain("ansible_hostname");
  });

  it("does not suggest inside comments", () => {
    const src = makeJinjaCompletionSource(env("", "auto"));
    expect(src(ctxAtEnd("{# note "))).toBeNull();
  });

  it("invalid data does not break variable suggestions", () => {
    const src = makeJinjaCompletionSource(env("{ broken yaml: [", "json"));
    const res = src(ctxAtEnd("{{ "));
    // No variable paths, but keywords/snippets still returned without throwing.
    expect(res).not.toBeNull();
  });

  it("provides English help text on key entries", () => {
    const src = makeJinjaCompletionSource(env("", "auto"));
    const res = src(ctxAtEnd("{{ name | "));
    const hash = res?.options.find((o) => o.label === "hash");
    expect(typeof hash?.info).toBe("string");
    expect(hash?.info as string).toMatch(/hash/i);
    expect(hash?.detail).toMatch(/filter/);
  });
});

describe("capabilities-driven filters and facts", () => {
  it("offers emulated ansible filters with descriptions in ansible mode", () => {
    const src = makeJinjaCompletionSource(env("", "auto", "ansible", CAPS));
    const res = src(ctxAtEnd("{{ x | "));
    const combine = res?.options.find((o) => o.label === "combine");
    expect(combine).toBeDefined();
    // Description comes straight from the backend's /capabilities payload.
    expect(combine?.info).toBe("Merge dictionaries (recursive + list_merge options).");
    const ls = labels(res);
    expect(ls).toContain("regex_replace");
    expect(ls).toContain("union");
    // Builtin Jinja filters remain available too.
    expect(ls).toContain("default");
  });

  it("does not offer ansible-only filters in base mode", () => {
    const src = makeJinjaCompletionSource(env("", "auto", "base", CAPS));
    const ls = labels(src(ctxAtEnd("{{ x | ")));
    expect(ls).toContain("hash");
    expect(ls).not.toContain("combine");
    expect(ls).not.toContain("regex_replace");
  });

  it("sources ansible fact names from capabilities when present", () => {
    const src = makeJinjaCompletionSource(env("", "auto", "ansible", CAPS));
    const ls = labels(src(ctxAtEnd("{{ ")));
    expect(ls).toContain("ansible_fqdn");
  });
});
