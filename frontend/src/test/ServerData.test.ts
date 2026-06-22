import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../services/api";
import { useStore } from "../app/store";
import type { CapabilitiesResponse, ExamplesResponse } from "../types/api";

const caps: CapabilitiesResponse = {
  render_modes: ["base", "ansible", "salt"],
  options: ["trim", "lstrip"],
  filters: ["hash", "ipaddr", "combine"],
  filters_by_mode: { base: ["hash", "ipaddr"], ansible: ["hash", "ipaddr", "combine"], salt: ["hash", "ipaddr"] },
  filter_descriptions: { hash: "Hash a value.", ipaddr: "IP filter.", combine: "Merge dicts." },
  ansible_facts: ["ansible_hostname"],
  data_formats: ["auto", "yaml", "json"],
};

const examplesResp: ExamplesResponse = {
  examples: [
    { id: "x", title: "X", render_mode: "ansible", data_format: "yaml", template: "T", data: "D" },
  ],
  default: { id: "x", title: "X", render_mode: "ansible", data_format: "yaml", template: "T", data: "D" },
};

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  useStore.setState({ template: "", data: "", capabilities: null, examples: [], renderMode: "base" });
});

afterEach(() => vi.restoreAllMocks());

describe("loadServerData", () => {
  it("normalizes capabilities and seeds the first example into an empty workspace", async () => {
    vi.spyOn(api, "fetchCapabilities").mockResolvedValue(caps);
    vi.spyOn(api, "fetchExamples").mockResolvedValue(examplesResp);

    await useStore.getState().loadServerData();

    const s = useStore.getState();
    expect(s.capabilities?.filterDescriptions.combine).toBe("Merge dicts.");
    expect(s.capabilities?.filtersByMode.ansible).toContain("combine");
    expect(s.capabilities?.ansibleFacts).toContain("ansible_hostname");
    expect(s.examples).toHaveLength(1);
    // Empty workspace gets seeded from the default example.
    expect(s.template).toBe("T");
    expect(s.data).toBe("D");
    expect(s.renderMode).toBe("ansible");
  });

  it("does not overwrite a non-empty workspace", async () => {
    useStore.setState({ template: "keep", data: "d" });
    vi.spyOn(api, "fetchCapabilities").mockResolvedValue(caps);
    vi.spyOn(api, "fetchExamples").mockResolvedValue(examplesResp);

    await useStore.getState().loadServerData();

    expect(useStore.getState().template).toBe("keep");
    expect(useStore.getState().data).toBe("d");
  });

  it("survives a failed capabilities request (keeps fallbacks)", async () => {
    vi.spyOn(api, "fetchCapabilities").mockRejectedValue(new Error("offline"));
    vi.spyOn(api, "fetchExamples").mockRejectedValue(new Error("offline"));

    await expect(useStore.getState().loadServerData()).resolves.toBeUndefined();
    expect(useStore.getState().capabilities).toBeNull();
  });
});
