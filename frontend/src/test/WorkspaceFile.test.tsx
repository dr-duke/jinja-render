import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { useStore } from "../app/store";
import { defaultWorkspaceFilename } from "../app/workspaceFile";

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

describe("defaultWorkspaceFilename", () => {
  it("includes the hostname and local minute timestamp", () => {
    // jsdom's default hostname is "localhost".
    const when = new Date(2026, 5, 21, 20, 38); // 2026-06-21 20:38 local
    expect(defaultWorkspaceFilename(when)).toBe("localhost-20260621-2038.json");
  });

  it("falls back to jinja-render when hostname is empty", () => {
    const spy = vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      hostname: "",
    } as Location);
    const when = new Date(2026, 0, 2, 3, 4);
    expect(defaultWorkspaceFilename(when)).toBe("jinja-render-20260102-0304.json");
    spy.mockRestore();
  });

  it("sanitizes unsafe characters in the hostname", () => {
    const spy = vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      hostname: "host name/with:weird*chars",
    } as Location);
    const when = new Date(2026, 5, 21, 9, 5);
    const name = defaultWorkspaceFilename(when);
    expect(name).toBe("host-name-with-weird-chars-20260621-0905.json");
    spy.mockRestore();
  });
});

describe("store export/import", () => {
  it("exportState returns persisted fields and excludes rendered output", () => {
    useStore.setState({
      lastSuccess: {
        success: true,
        rendered: "SHOULD NOT BE EXPORTED",
        data_parsed: {},
        meta: {
          data_format_detected: "yaml",
          render_mode_applied: "base",
          filters_enabled: [],
          duration_ms: 1,
        },
        warnings: [],
      },
    });
    const snap = useStore.getState().exportState();
    expect(snap).toMatchObject({
      version: 1,
      template: "Hello {{ name }}",
      data: "name: world\n",
      dataFormat: "auto",
      renderMode: "base",
      options: { trim: true, lstrip: false, strict: true },
      autoRender: false,
    });
    expect(JSON.stringify(snap)).not.toContain("SHOULD NOT BE EXPORTED");
    expect(snap).not.toHaveProperty("lastSuccess");
    expect(snap).not.toHaveProperty("rendered");
  });

  it("importState restores a valid snapshot and persists it", () => {
    const ok = useStore.getState().importState({
      version: 1,
      template: "T2 {{ x }}",
      data: '{"x": 1}',
      dataFormat: "json",
      renderMode: "ansible",
      options: { trim: false, lstrip: true, strict: false },
      autoRender: true,
      panelViews: {
        template: { showLines: true, showWhitespaces: false },
        data: { showLines: false, showWhitespaces: true },
        output: { showLines: false, showWhitespaces: false },
      },
    });
    expect(ok).toBe(true);
    const s = useStore.getState();
    expect(s.template).toBe("T2 {{ x }}");
    expect(s.data).toBe('{"x": 1}');
    expect(s.dataFormat).toBe("json");
    expect(s.renderMode).toBe("ansible");
    expect(s.options).toEqual({ trim: false, lstrip: true, strict: false });
    expect(s.autoRender).toBe(true);
    expect(s.panelViews.template.showLines).toBe(true);
    expect(s.panelViews.data.showWhitespaces).toBe(true);

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string).template).toBe("T2 {{ x }}");
  });

  it("importState rejects an incompatible schema and leaves state intact", () => {
    const before = useStore.getState().exportState();
    const ok = useStore.getState().importState({ version: 999, template: "x" });
    expect(ok).toBe(false);
    expect(useStore.getState().exportState()).toEqual(before);
  });

  it("importState rejects non-object input without throwing", () => {
    expect(useStore.getState().importState(null)).toBe(false);
    expect(useStore.getState().importState("not an object")).toBe(false);
    expect(useStore.getState().importState(42)).toBe(false);
  });
});

describe("ControlBar save/load UI", () => {
  it("renders Save and Load buttons with accessible labels and tooltips", () => {
    render(<App />);
    const save = screen.getByRole("button", { name: /save workspace to a file/i });
    const load = screen.getByRole("button", { name: /load workspace from a file/i });
    expect(save).toHaveAttribute("title", "Save workspace to a file");
    expect(load).toHaveAttribute("title", "Load workspace from a file");
  });

  it("Save triggers a download of the exported JSON", async () => {
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    // jsdom lacks URL.createObjectURL / revokeObjectURL; assign mocks directly.
    const createMock = vi.fn().mockReturnValue("blob:mock");
    const revokeMock = vi.fn();
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = createMock;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revokeMock;

    render(<App />);
    await userEvent.click(
      screen.getByRole("button", { name: /save workspace to a file/i }),
    );
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(createMock).toHaveBeenCalledOnce();
  });

  it("loading a valid file restores the workspace", async () => {
    render(<App />);
    const snapshot = {
      version: 1,
      template: "imported {{ y }}",
      data: "y: 7\n",
      dataFormat: "yaml",
      renderMode: "salt",
      options: { trim: false, lstrip: true, strict: false },
      autoRender: false,
      panelViews: {
        template: { showLines: false, showWhitespaces: false },
        data: { showLines: false, showWhitespaces: false },
        output: { showLines: false, showWhitespaces: false },
      },
    };
    const file = new File([JSON.stringify(snapshot)], "ws.json", {
      type: "application/json",
    });
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await userEvent.upload(input, file);

    await waitFor(() => {
      expect(useStore.getState().template).toBe("imported {{ y }}");
    });
    expect(useStore.getState().renderMode).toBe("salt");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("loading an invalid file shows an error and preserves current state", async () => {
    render(<App />);
    const before = useStore.getState().exportState();
    const file = new File(["{ this is not valid json"], "bad.json", {
      type: "application/json",
    });
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await userEvent.upload(input, file);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/invalid json/i);
    expect(useStore.getState().exportState()).toEqual(before);
  });

  it("loading a wrong-schema file shows an error and preserves state", async () => {
    render(<App />);
    const before = useStore.getState().exportState();
    const file = new File([JSON.stringify({ version: 42, template: "x" })], "ws.json", {
      type: "application/json",
    });
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await userEvent.upload(input, file);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/unsupported or corrupt/i);
    });
    expect(useStore.getState().exportState()).toEqual(before);
  });
});
