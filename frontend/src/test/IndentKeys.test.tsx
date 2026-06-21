import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import * as api from "../services/api";
import { useStore } from "../app/store";
import type { RenderSuccess } from "../types/api";

const STORAGE_KEY = "jinja-render:v1:workspace-state";

const success: RenderSuccess = {
  success: true,
  rendered: "out\nput",
  data_parsed: {},
  meta: {
    data_format_detected: "yaml",
    render_mode_applied: "base",
    filters_enabled: [],
    duration_ms: 1,
  },
  warnings: [],
};

// Place a collapsed selection (cursor) at `offset` inside the named editor by
// mutating the store first, then driving a Tab keydown. The CodeMirror view owns
// selection internally; to position it we rely on the default selection (start of
// doc) for single-line cases and on a real selection for multi-line cases via the
// content DOM is not directly addressable, so these integration tests assert the
// store-level effect of Tab on the default cursor position (document start).
function templateContent(): HTMLElement {
  return screen.getByLabelText("template");
}
function dataContent(): HTMLElement {
  return screen.getByLabelText("data");
}

beforeEach(() => {
  localStorage.clear();
  useStore.setState({
    template: "alpha\nbeta",
    data: "k: 1\nv: 2",
    status: "idle",
    lastSuccess: null,
    lastError: null,
    autoRender: false,
    autocompleteEnabled: false,
  });
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Tab / Shift+Tab indentation wiring", () => {
  it("Tab indents the current line of the template editor and updates the store", () => {
    render(<App />);
    const content = templateContent();
    content.focus();
    fireEvent.keyDown(content, { key: "Tab" });
    expect(useStore.getState().template).toBe("  alpha\nbeta");
  });

  it("Tab indents the current line of the data editor and updates the store", () => {
    render(<App />);
    const content = dataContent();
    content.focus();
    fireEvent.keyDown(content, { key: "Tab" });
    expect(useStore.getState().data).toBe("  k: 1\nv: 2");
  });

  it("Shift+Tab removes two leading spaces from the current template line", () => {
    useStore.setState({ template: "    alpha\nbeta" });
    render(<App />);
    const content = templateContent();
    content.focus();
    fireEvent.keyDown(content, { key: "Tab", shiftKey: true });
    expect(useStore.getState().template).toBe("  alpha\nbeta");
  });

  it("Shift+Tab removes a single leading space when only one is present", () => {
    useStore.setState({ template: " alpha\nbeta" });
    render(<App />);
    const content = templateContent();
    content.focus();
    fireEvent.keyDown(content, { key: "Tab", shiftKey: true });
    expect(useStore.getState().template).toBe("alpha\nbeta");
  });

  it("Shift+Tab leaves an unindented line unchanged", () => {
    useStore.setState({ template: "alpha\nbeta" });
    render(<App />);
    const content = templateContent();
    content.focus();
    fireEvent.keyDown(content, { key: "Tab", shiftKey: true });
    expect(useStore.getState().template).toBe("alpha\nbeta");
  });

  it("indentation changes are persisted to localStorage", async () => {
    render(<App />);
    const content = templateContent();
    content.focus();
    fireEvent.keyDown(content, { key: "Tab" });
    await waitFor(() => {
      const raw = localStorage.getItem(STORAGE_KEY);
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw as string).template).toBe("  alpha\nbeta");
    });
  });

  it("Tab is undoable (history transaction), restoring the original text", () => {
    render(<App />);
    const content = templateContent();
    content.focus();
    fireEvent.keyDown(content, { key: "Tab" });
    expect(useStore.getState().template).toBe("  alpha\nbeta");
    // Ctrl+Z (default history keymap) reverts the indent change.
    fireEvent.keyDown(content, { key: "z", ctrlKey: true });
    expect(useStore.getState().template).toBe("alpha\nbeta");
  });

  it("Tab does not modify the read-only output panel", async () => {
    vi.spyOn(api, "renderTemplate").mockResolvedValue(success);
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /render template/i }));
    await waitFor(() => expect(screen.getByTestId("output")).toHaveTextContent("out"));
    const out = screen.getByTestId("output");
    out.focus();
    fireEvent.keyDown(out, { key: "Tab" });
    fireEvent.keyDown(out, { key: "Tab", shiftKey: true });
    // The rendered output is derived from lastSuccess and must be untouched.
    expect(useStore.getState().lastSuccess?.rendered).toBe("out\nput");
    expect(screen.getByTestId("output")).toHaveTextContent("out");
  });
});
