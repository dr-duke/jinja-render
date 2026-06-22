import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "../App";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => vi.restoreAllMocks());

describe("info button", () => {
  it("is collapsed until clicked, then shows version, license and a repo link from /info", async () => {
    render(<App />);
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /about jinja-render/i }));
    const link = screen.getByRole("link", { name: /source on github/i });
    expect(link).toHaveAttribute("href", "https://github.com/dr-duke/jinja-render");
    // version + license are loaded from GET /api/v1/info on first open.
    expect(await screen.findByText(/version: 0\.0\.2/)).toBeInTheDocument();
    expect(screen.getByText(/license: MIT/)).toBeInTheDocument();
  });

  it("closes the popover on Escape", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /about jinja-render/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
