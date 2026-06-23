import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { useStore } from "../app/store";

// Render <App/> with a given template/data/mode and return the template editor's
// content node once CodeMirror has mounted.
async function mountWith(state: Partial<ReturnType<typeof useStore.getState>>) {
  useStore.setState({
    // Keep the directive prefix empty so it never interferes with assertions.
    options: { trim: false, lstrip: false },
    autoRender: false,
    autocompleteEnabled: false,
    dataFormat: "auto",
    renderMode: "base",
    data: "",
    ...state,
  });
  render(<App />);
  const el = screen.getByLabelText("template");
  await waitFor(() => expect(el.querySelector(".cm-content")?.textContent ?? el.textContent).toBeTruthy());
  return el;
}

function marks(el: HTMLElement, cls: string): string[] {
  return Array.from(el.querySelectorAll(`.${cls}`)).map((n) => n.textContent ?? "");
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  useStore.setState({
    panelViews: {
      template: { showLines: false, showWhitespaces: false },
      data: { showLines: false, showWhitespaces: false },
      output: { showLines: false, showWhitespaces: false },
    },
  });
});

afterEach(() => vi.restoreAllMocks());

describe("template variable highlighting", () => {
  it("marks a data-backed variable as known", async () => {
    const el = await mountWith({ template: "{{ user }}", data: "user: alice\n" });
    await waitFor(() => expect(marks(el, "cm-jinja-var-known")).toContain("user"));
    expect(marks(el, "cm-jinja-var-unknown")).not.toContain("user");
  });

  it("marks a variable absent from data as unknown", async () => {
    const el = await mountWith({ template: "{{ hostnam }}", data: "" });
    await waitFor(() => expect(marks(el, "cm-jinja-var-unknown")).toContain("hostnam"));
  });

  it("treats {% for %} loop variables as known", async () => {
    const el = await mountWith({
      template: "{% for h in hosts %}{{ h }}{% endfor %}",
      data: "hosts:\n  - a\n  - b\n",
    });
    await waitFor(() => {
      const known = marks(el, "cm-jinja-var-known");
      expect(known).toContain("hosts");
      expect(known).toContain("h");
    });
    expect(marks(el, "cm-jinja-var-unknown")).not.toContain("h");
  });

  it("treats {% set %} names as known", async () => {
    const el = await mountWith({ template: "{% set port = 8080 %}{{ port }}", data: "" });
    await waitFor(() => expect(marks(el, "cm-jinja-var-known")).toContain("port"));
  });

  it("knows emulated ansible facts only in ansible mode", async () => {
    const ans = await mountWith({
      template: "{{ ansible_hostname }}",
      data: "",
      renderMode: "ansible",
    });
    await waitFor(() => expect(marks(ans, "cm-jinja-var-known")).toContain("ansible_hostname"));
  });

  it("flags an ansible fact as unknown in base mode", async () => {
    const base = await mountWith({ template: "{{ ansible_hostname }}", data: "" });
    await waitFor(() =>
      expect(marks(base, "cm-jinja-var-unknown")).toContain("ansible_hostname"),
    );
  });

  it("does not flag filter names or attributes as variables", async () => {
    const el = await mountWith({
      template: "{{ user.name | upper }}",
      data: "user:\n  name: a\n",
    });
    await waitFor(() => expect(marks(el, "cm-jinja-var-known")).toContain("user"));
    // `name` (attribute after .) and `upper` (filter after |) are not variables.
    const all = [...marks(el, "cm-jinja-var-known"), ...marks(el, "cm-jinja-var-unknown")];
    expect(all).not.toContain("name");
    expect(all).not.toContain("upper");
  });
});
