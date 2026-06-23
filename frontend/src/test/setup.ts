import "@testing-library/jest-dom";

// jsdom has no layout engine, but CodeMirror's measuring path calls
// getClientRects()/getBoundingClientRect() on Ranges and elements. On some
// runners (e.g. Node 24 CI) the Range methods are missing entirely and editor
// measuring throws ("textRange(...).getClientRects is not a function"). Provide
// minimal stubs so measuring is a no-op instead of crashing tests that focus or
// edit the editor.
function stubRect(): DOMRect {
  return {
    x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0,
    toJSON() {},
  } as DOMRect;
}
function stubRectList(): DOMRectList {
  const list: DOMRect[] = [];
  return Object.assign(list, { item: (i: number) => list[i] ?? null }) as unknown as DOMRectList;
}
if (typeof Range !== "undefined") {
  Range.prototype.getClientRects = function () {
    return stubRectList();
  };
  Range.prototype.getBoundingClientRect = function () {
    return stubRect();
  };
}

// Default fetch stub: components load /capabilities and /examples on mount, and
// we don't want those hitting the network in tests. Individual tests still mock
// api.renderTemplate directly for the render flow. Kept as a plain assignment
// (not vi.fn / vi.stubGlobal) so vi.restoreAllMocks() between tests never
// removes it. Examples are empty so the example picker stays hidden and the
// editors keep whatever each test sets in beforeEach.
const CAPABILITIES = {
  render_modes: ["base", "ansible", "salt"],
  options: ["trim", "lstrip"],
  filters: ["hash", "ipaddr", "combine"],
  filters_by_mode: {
    base: [],
    ansible: ["hash", "ipaddr", "combine"],
    salt: [],
  },
  filter_descriptions: {
    hash: "Hash a value with a hashlib algorithm (default sha256).",
    ipaddr: "ansible-like IP/network filter.",
    combine: "Merge dictionaries (recursive + list_merge options).",
  },
  ansible_facts: ["ansible_hostname", "ansible_facts"],
  data_formats: ["auto", "yaml", "json"],
};

const EXAMPLES = { examples: [], default: null };

const INFO = {
  name: "jinja-render",
  description: "A safe, local-first Jinja2 playground.",
  version: "0.0.2",
  repository: "https://github.com/dr-duke/jinja-render",
  license: "MIT",
};

function jsonResponse(body: unknown): Promise<Response> {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => body,
  } as Response);
}

globalThis.fetch = ((input: RequestInfo | URL): Promise<Response> => {
  const url = typeof input === "string" ? input : input.toString();
  if (url.includes("/api/v1/capabilities")) return jsonResponse(CAPABILITIES);
  if (url.includes("/api/v1/examples")) return jsonResponse(EXAMPLES);
  if (url.includes("/api/v1/info")) return jsonResponse(INFO);
  return Promise.reject(new Error(`unmocked fetch in tests: ${url}`));
}) as typeof fetch;
