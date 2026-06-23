import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import * as api from "../services/api";
import { useStore } from "../app/store";
import { jinjaDirective } from "../components/editor/directive";
import type { RenderSuccess } from "../types/api";

const success: RenderSuccess = {
  success: true,
  rendered: "x",
  data_parsed: {},
  meta: {
    data_format_detected: "yaml",
    render_mode_applied: "base",
    filters_enabled: [],
    duration_ms: 1,
  },
  warnings: [],
};

function panelActions(labelRe: RegExp): HTMLElement {
  const header = screen.getByText(labelRe).closest(".panel-header") as HTMLElement;
  return header.querySelector(".panel-actions") as HTMLElement;
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  useStore.setState({
    template: "Hello {{ name }}",
    data: "name: world\n",
    options: { trim: true, lstrip: false },
    status: "idle",
    lastSuccess: null,
    lastError: null,
    autoRender: false,
    autocompleteEnabled: false,
  });
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => vi.restoreAllMocks());

describe("jinjaDirective", () => {
  it("formats the directive from the active options", () => {
    expect(jinjaDirective({ trim: true, lstrip: false })).toBe(
      "#jinja2: trim_blocks: True",
    );
    expect(jinjaDirective({ trim: false, lstrip: true })).toBe(
      "#jinja2: lstrip_blocks: True",
    );
    expect(jinjaDirective({ trim: true, lstrip: true })).toBe(
      "#jinja2: trim_blocks: True, lstrip_blocks: True",
    );
    expect(jinjaDirective({ trim: false, lstrip: false })).toBe("");
  });
});

describe("template #jinja2 directive line", () => {
  it("shows the directive as the first line when an option is on, but keeps store.template clean", () => {
    render(<App />);
    const tmpl = screen.getByLabelText("template");
    expect(tmpl.textContent).toContain("#jinja2: trim_blocks: True");
    // Frontend-only: the directive is not part of the stored template value.
    expect(useStore.getState().template).toBe("Hello {{ name }}");
    expect(useStore.getState().template).not.toContain("#jinja2");
  });

  it("appears and disappears when toggling an option", async () => {
    useStore.setState({ options: { trim: false, lstrip: false } });
    render(<App />);
    expect(screen.getByLabelText("template").textContent).not.toContain("#jinja2");
    await userEvent.click(screen.getByRole("button", { name: "Lstrip" }));
    await waitFor(() =>
      expect(screen.getByLabelText("template").textContent).toContain(
        "#jinja2: lstrip_blocks: True",
      ),
    );
    await userEvent.click(screen.getByRole("button", { name: "Lstrip" }));
    await waitFor(() =>
      expect(screen.getByLabelText("template").textContent).not.toContain("#jinja2"),
    );
  });

  it("copies the template with the directive prepended", async () => {
    render(<App />);
    const actions = panelActions(/^Template \(Jinja2\)$/);
    await userEvent.click(within(actions).getByRole("button", { name: /copy/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "#jinja2: trim_blocks: True\nHello {{ name }}",
    );
  });

  it("does not send the directive to the backend on render", async () => {
    const spy = vi.spyOn(api, "renderTemplate").mockResolvedValue(success);
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /render template/i }));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const arg = spy.mock.calls[0][0];
    expect(arg.template).toBe("Hello {{ name }}");
    expect(arg.template).not.toContain("#jinja2");
  });

  it("protects the directive line from user edits", async () => {
    render(<App />);
    const content = screen.getByLabelText("template");
    content.focus();
    // Move the caret to the very start (inside the directive) and try to type and
    // delete — the protected prefix must stay intact and the stored value clean.
    await userEvent.keyboard("{Control>}{Home}{/Control}");
    await userEvent.keyboard("XYZ{Backspace}{Delete}");
    expect(useStore.getState().template).toBe("Hello {{ name }}");
    expect(screen.getByLabelText("template").textContent).toContain(
      "#jinja2: trim_blocks: True",
    );
  });
});
