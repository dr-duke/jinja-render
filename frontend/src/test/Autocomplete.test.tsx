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
    options: { trim: true, lstrip: false, strict: true },
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

  it("renders the Hints switch to the left of Trim/Lstrip/Strict/Auto-render", () => {
    render(<App />);
    const labels = Array.from(document.querySelectorAll(".switch .switch-label")).map(
      (el) => el.textContent,
    );
    expect(labels).toEqual(["Hints", "Trim", "Lstrip", "Strict check", "Auto-render"]);
  });

  it("Hints switch is off by default and has the English tooltip", () => {
    render(<App />);
    const hints = screen.getByText("Hints").closest(".switch") as HTMLElement;
    expect(hints).toHaveAttribute(
      "title",
      "Enable Jinja autocomplete and inline help in the template editor.",
    );
    const input = hints.querySelector('input[role="switch"]') as HTMLInputElement;
    expect(input.checked).toBe(false);
  });

  it("toggling the switch updates store state", async () => {
    render(<App />);
    const hints = screen.getByText("Hints").closest(".switch") as HTMLElement;
    const input = hints.querySelector('input[role="switch"]') as HTMLInputElement;
    expect(useStore.getState().autocompleteEnabled).toBe(false);
    await userEvent.click(input);
    expect(useStore.getState().autocompleteEnabled).toBe(true);
    expect(input.checked).toBe(true);
  });

  it("connects/disconnects the autocomplete extension on the template editor", async () => {
    render(<App />);
    // CodeMirror's autocompletion() sets aria-autocomplete="list" on the content
    // element only while a completion source is wired. With hints off (default)
    // it must be absent; enabling the switch must add it.
    const tmpl = screen.getByLabelText("template");
    expect(tmpl.getAttribute("aria-autocomplete")).toBeNull();
    await userEvent.click(
      screen.getByText("Hints").closest(".switch")!.querySelector("input")!,
    );
    expect(useStore.getState().autocompleteEnabled).toBe(true);
    expect(
      screen.getByLabelText("template").getAttribute("aria-autocomplete"),
    ).toBe("list");
  });

  it("never wires autocomplete onto the data editor", async () => {
    render(<App />);
    await userEvent.click(
      screen.getByText("Hints").closest(".switch")!.querySelector("input")!,
    );
    // Even with hints enabled, only the template panel gets autocomplete.
    expect(screen.getByLabelText("data").getAttribute("aria-autocomplete")).toBeNull();
  });

  it("persists the hints setting to localStorage", async () => {
    render(<App />);
    await userEvent.click(
      screen.getByText("Hints").closest(".switch")!.querySelector("input")!,
    );
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
      options: { trim: true, lstrip: false, strict: true },
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
      options: { trim: true, lstrip: false, strict: true },
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
