import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { useStore } from "../app/store";

const STORAGE_KEY = "jinja-render:v1:workspace-state";

function baseState() {
  return {
    template: "Hello {{ name }}",
    data: "name: world\n",
    dataFormat: "auto" as const,
    renderMode: "base" as const,
    options: { trim: true, lstrip: false },
    status: "idle" as const,
    lastSuccess: null,
    lastError: null,
    autoRender: false,
    autocompleteEnabled: false,
    panelViews: {
      template: { showLines: false, showWhitespaces: false },
      data: { showLines: false, showWhitespaces: false },
      output: { showLines: false, showWhitespaces: false },
    },
  };
}

beforeEach(() => {
  localStorage.clear();
  useStore.setState(baseState());
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("autocomplete hints switch", () => {
  it("defaults to off in fresh store state", () => {
    // A brand-new store (no persisted state) must have hints disabled.
    expect(useStore.getState().autocompleteEnabled).toBe(false);
  });

  it("renders the Hints toggle to the left of Trim/Lstrip/Strict/Auto-render", () => {
    render(<App />);
    const labels = Array.from(document.querySelectorAll(".btn-toggle")).map(
      (el) => el.textContent,
    );
    expect(labels).toEqual(["Hints", "Trim", "Lstrip", "Auto-render"]);
  });

  it("Hints toggle is unpressed by default and has the English tooltip", () => {
    render(<App />);
    const hints = screen.getByRole("button", { name: "Hints" });
    expect(hints).toHaveAttribute(
      "title",
      "Enable Jinja autocomplete and inline help in the template editor.",
    );
    expect(hints).toHaveAttribute("aria-pressed", "false");
  });

  it("toggling the button updates store state and aria-pressed", async () => {
    render(<App />);
    const hints = screen.getByRole("button", { name: "Hints" });
    expect(useStore.getState().autocompleteEnabled).toBe(false);
    await userEvent.click(hints);
    expect(useStore.getState().autocompleteEnabled).toBe(true);
    expect(hints).toHaveAttribute("aria-pressed", "true");
  });

  it("connects/disconnects the autocomplete extension on the template editor", async () => {
    render(<App />);
    // CodeMirror's autocompletion() sets aria-autocomplete="list" on the content
    // element only while a completion source is wired. With hints off (default)
    // it must be absent; enabling the toggle must add it.
    const tmpl = screen.getByLabelText("template");
    expect(tmpl.getAttribute("aria-autocomplete")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Hints" }));
    expect(useStore.getState().autocompleteEnabled).toBe(true);
    expect(
      screen.getByLabelText("template").getAttribute("aria-autocomplete"),
    ).toBe("list");
  });

  it("never wires autocomplete onto the data editor", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Hints" }));
    // Even with hints enabled, only the template panel gets autocomplete.
    expect(screen.getByLabelText("data").getAttribute("aria-autocomplete")).toBeNull();
  });

  it("persists the hints setting to localStorage", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Hints" }));
    await waitFor(() => {
      const raw = localStorage.getItem(STORAGE_KEY);
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw as string).autocompleteEnabled).toBe(true);
    });
  });

  it("is included in exported workspace JSON and restored on import", () => {
    useStore.setState({ autocompleteEnabled: true });
    const snap = useStore.getState().exportState();
    expect(snap.autocompleteEnabled).toBe(true);

    // Importing a snapshot with the flag enabled restores it.
    useStore.setState({ autocompleteEnabled: false });
    const ok = useStore.getState().importState({
      version: 1,
      template: "t",
      data: "d",
      dataFormat: "auto",
      renderMode: "base",
      options: { trim: true, lstrip: false },
      autoRender: false,
      autocompleteEnabled: true,
      panelViews: {
        template: { showLines: false, showWhitespaces: false },
        data: { showLines: false, showWhitespaces: false },
        output: { showLines: false, showWhitespaces: false },
      },
    });
    expect(ok).toBe(true);
    expect(useStore.getState().autocompleteEnabled).toBe(true);
  });

  it("import without the flag leaves it at its current value", () => {
    // Older workspace files won't carry the new field; import must not throw and
    // the flag should simply be left untouched (validation treats it as optional).
    useStore.setState({ autocompleteEnabled: true });
    const ok = useStore.getState().importState({
      version: 1,
      template: "t",
      data: "d",
      dataFormat: "auto",
      renderMode: "base",
      options: { trim: true, lstrip: false },
      autoRender: false,
      panelViews: {
        template: { showLines: false, showWhitespaces: false },
        data: { showLines: false, showWhitespaces: false },
        output: { showLines: false, showWhitespaces: false },
      },
    });
    expect(ok).toBe(true);
    expect(useStore.getState().autocompleteEnabled).toBe(true);
  });
});
