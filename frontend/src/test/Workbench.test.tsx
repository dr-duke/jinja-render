import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import * as api from "../services/api";
import { useStore } from "../app/store";
import type { RenderSuccess, RenderFailure } from "../types/api";

const success: RenderSuccess = {
  success: true,
  rendered: "Hello world",
  rendered_visualized: "Hello·world",
  data_parsed: { name: "world" },
  meta: {
    data_format_detected: "yaml",
    render_mode_applied: "base",
    filters_enabled: ["hash", "ipaddr"],
    duration_ms: 3,
  },
  warnings: [],
};

const failure: RenderFailure = {
  success: false,
  error: {
    type: "undefined_error",
    message: "Undefined variable: 'missing' is undefined",
    line: 1,
    column: null,
    details: {},
  },
  meta: { duration_ms: 1 },
};

// Find the per-panel action block for a given panel by its header label.
function panelActions(labelRe: RegExp): HTMLElement {
  const header = screen.getByText(labelRe).closest(".panel-header") as HTMLElement;
  return header.querySelector(".panel-actions") as HTMLElement;
}

beforeEach(() => {
  localStorage.clear();
  // Reset store to defaults between tests.
  useStore.setState({
    template: "Hosts:\n{% for host in hosts %}\n  - {{ host.name }}\n{% endfor %}\n",
    data: "hosts:\n  - name: web-01\n",
    status: "idle",
    lastSuccess: null,
    lastError: null,
    options: { trim: true, lstrip: false, strict: true, show_whitespaces: false },
    renderMode: "base",
    panelViews: {
      template: { showLines: false, showWhitespaces: false },
      data: { showLines: false, showWhitespaces: false },
      output: { showLines: false, showWhitespaces: false },
    },
    // Disable auto-render by default so explicit-trigger tests stay deterministic.
    autoRender: false,
  });
  vi.restoreAllMocks();
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Workbench", () => {
  it("loads with demo template and data", () => {
    render(<App />);
    const tmpl = screen.getByLabelText("template") as HTMLTextAreaElement;
    expect(tmpl.value).toContain("{% for host in hosts %}");
    const data = screen.getByLabelText("data") as HTMLTextAreaElement;
    expect(data.value).toContain("hosts:");
  });

  it("render button triggers API call and shows output", async () => {
    const spy = vi.spyOn(api, "renderTemplate").mockResolvedValue(success);
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /render template/i }));
    await waitFor(() => expect(spy).toHaveBeenCalledOnce());
    expect(screen.getByTestId("output")).toHaveTextContent("Hello world");
  });

  it("Ctrl+Enter triggers render", async () => {
    const spy = vi.spyOn(api, "renderTemplate").mockResolvedValue(success);
    render(<App />);
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(spy).toHaveBeenCalledOnce());
  });

  it("displays structured error state", async () => {
    vi.spyOn(api, "renderTemplate").mockResolvedValue(failure);
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /render template/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent("undefined_error");
  });

  it("render option switches render with English tooltips", () => {
    render(<App />);
    const trim = screen.getByText("Trim").closest(".switch") as HTMLElement;
    expect(trim).toHaveAttribute(
      "title",
      "Remove the first newline after template blocks.",
    );
    expect(within(trim).getByRole("switch")).toBeInTheDocument();
    const auto = screen.getByText("Auto-render").closest(".switch") as HTMLElement;
    expect(auto).toHaveAttribute(
      "title",
      "Render automatically after edits or focus changes.",
    );
  });

  it("header no longer has Show whitespaces or Clear render controls", () => {
    render(<App />);
    expect(screen.queryByText("Show whitespaces")).not.toBeInTheDocument();
    expect(screen.queryByText("Clear render")).not.toBeInTheDocument();
  });

  it("output copy button copies raw output without whitespace markers", async () => {
    vi.spyOn(api, "renderTemplate").mockResolvedValue(success);
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /render template/i }));
    await waitFor(() => expect(screen.getByTestId("output")).toHaveTextContent("Hello world"));
    // Turn on per-panel whitespace visualization for the output panel.
    const actions = panelActions(/rendered output/i);
    await userEvent.click(within(actions).getByRole("button", { name: /show whitespaces/i }));
    // Markers are present visually but copy still yields the raw text.
    await userEvent.click(within(actions).getByRole("button", { name: /copy/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Hello world");
  });

  it("per-panel whitespace toggle adds decorative markers to output", async () => {
    vi.spyOn(api, "renderTemplate").mockResolvedValue({
      ...success,
      rendered: "a b",
    });
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /render template/i }));
    await waitFor(() => expect(screen.getByTestId("output")).toHaveTextContent("a b"));
    const actions = panelActions(/rendered output/i);
    await userEvent.click(within(actions).getByRole("button", { name: /show whitespaces/i }));
    // The decorative glyph appears; it is aria-hidden so not part of raw text.
    const pre = screen.getByTestId("output");
    expect(pre.querySelector(".ws-glyph")).not.toBeNull();
  });

  it("output line-numbers toggle shows a decorative gutter for that panel only", async () => {
    vi.spyOn(api, "renderTemplate").mockResolvedValue(success);
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /render template/i }));
    await waitFor(() => expect(screen.getByTestId("output")).toHaveTextContent("Hello world"));
    const outputActions = panelActions(/rendered output/i);
    await userEvent.click(within(outputActions).getByRole("button", { name: /line numbers/i }));
    expect(document.querySelectorAll(".line-numbers").length).toBe(1);
  });

  it("template Clear empties the template editor only", async () => {
    render(<App />);
    const actions = panelActions(/^Template \(Jinja2\)$/);
    await userEvent.click(within(actions).getByRole("button", { name: /clear/i }));
    const tmpl = screen.getByLabelText("template") as HTMLTextAreaElement;
    expect(tmpl.value).toBe("");
    const data = screen.getByLabelText("data") as HTMLTextAreaElement;
    expect(data.value).not.toBe("");
  });

  it("output Clear removes displayed render but keeps editors", async () => {
    vi.spyOn(api, "renderTemplate").mockResolvedValue(success);
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /render template/i }));
    await waitFor(() => expect(screen.getByTestId("output")).toHaveTextContent("Hello world"));
    const actions = panelActions(/rendered output/i);
    await userEvent.click(within(actions).getByRole("button", { name: /clear/i }));
    expect(screen.getByTestId("output")).toHaveTextContent("");
    const tmpl = screen.getByLabelText("template") as HTMLTextAreaElement;
    expect(tmpl.value).not.toBe("");
  });

  it("per-panel toggles persist to localStorage", async () => {
    render(<App />);
    const actions = panelActions(/rendered output/i);
    await userEvent.click(within(actions).getByRole("button", { name: /line numbers/i }));
    await waitFor(() => {
      const raw = localStorage.getItem("jinja-render:v1:workspace-state");
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw as string);
      expect(parsed.panelViews.output.showLines).toBe(true);
    });
  });

  it("auto-render triggers a render on editor blur when enabled", async () => {
    const spy = vi.spyOn(api, "renderTemplate").mockResolvedValue(success);
    useStore.setState({ autoRender: true });
    render(<App />);
    const tmpl = screen.getByLabelText("template");
    fireEvent.focus(tmpl);
    fireEvent.blur(tmpl);
    await waitFor(() => expect(spy).toHaveBeenCalled());
  });

  it("renders resizable splitters for the panels", () => {
    render(<App />);
    const separators = screen.getAllByRole("separator");
    expect(separators.length).toBe(2);
  });
});
