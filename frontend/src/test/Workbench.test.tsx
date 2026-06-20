import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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

beforeEach(() => {
  // Reset store to defaults between tests.
  useStore.setState({
    status: "idle",
    lastSuccess: null,
    lastError: null,
    options: { trim: true, lstrip: false, strict: true, show_whitespaces: false },
    renderMode: "base",
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

  it("copy button copies raw output, not visualized", async () => {
    vi.spyOn(api, "renderTemplate").mockResolvedValue(success);
    render(<App />);
    // Enable whitespace visualization so displayed differs from raw.
    await userEvent.click(screen.getByText("Show whitespaces"));
    await userEvent.click(screen.getByRole("button", { name: /render template/i }));
    await waitFor(() => expect(screen.getByTestId("output")).toHaveTextContent("Hello·world"));
    await userEvent.click(screen.getByRole("button", { name: /copy/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Hello world");
  });

  it("show whitespaces toggle changes presentation only", async () => {
    vi.spyOn(api, "renderTemplate").mockResolvedValue(success);
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /render template/i }));
    await waitFor(() => expect(screen.getByTestId("output")).toHaveTextContent("Hello world"));
    await userEvent.click(screen.getByText("Show whitespaces"));
    expect(screen.getByTestId("output")).toHaveTextContent("Hello·world");
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
