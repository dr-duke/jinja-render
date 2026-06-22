// Single source of all user-facing interface strings, grouped by area. Collected
// here so a future translation only has to touch one file. English is the
// shipped default. Strings that come from the backend (e.g. filter descriptions
// via /capabilities) are NOT here — those are a server contract.
//
// NOTE: keep values stable — tests match several of these by exact text/label.

export const strings = {
  header: {
    title: "jinja-render",
    subtitle: "sandboxed Jinja2 playground",
  },

  controlbar: {
    modeLabel: "Mode",
    renderModeAria: "Render mode",
    exampleLabel: "Example",
    examplePlaceholder: "Load…",
    loadExampleAria: "Load example",
    render: "Render template",
    rendering: "Rendering…",
    saveAria: "Save workspace to a file",
    loadAria: "Load workspace from a file",
    saveError: "Could not save the workspace file.",
    loadCorruptError: "Unsupported or corrupt workspace file.",
    loadReadError: "Could not read the workspace file (invalid JSON).",
  },

  // Feature toggle buttons (pressed = enabled). label is the visible text;
  // title is the native hover tooltip.
  features: {
    hints: {
      label: "Hints",
      title: "Enable Jinja autocomplete and inline help in the template editor.",
    },
    trim: {
      label: "Trim",
      title: "Remove the first newline after template blocks.",
    },
    lstrip: {
      label: "Lstrip",
      title: "Strip leading spaces and tabs before template blocks.",
    },
    autoRender: {
      label: "Auto-render",
      title: "Render automatically after edits or focus changes.",
    },
  },

  panels: {
    templateLabel: "Template (Jinja2)",
    templateAria: "template",
    dataLabel: "Data (YAML / JSON)",
    dataAria: "data",
    outputLabel: "Rendered output",
    outputAria: "rendered output",
    resizeRowsAria: "Resize template and data panels",
    resizeColsAria: "Resize editors and output",
  },

  actions: {
    copy: "Copy",
    copied: "Copied",
    copyTitle: "Copy raw content",
    lineNumbers: "Toggle line numbers",
    showWhitespaces: "Show whitespaces",
    showWhitespacesTitle: "Show whitespace characters",
    clear: "Clear",
    clearTitle: "Clear this panel",
  },

  output: {
    formatPrefix: "format:",
    modePrefix: "mode:",
    line: "line",
    column: "column",
  },

  info: {
    openAria: "About jinja-render",
    closeAria: "Close",
    versionLabel: "version",
    licenseLabel: "license",
    repoLinkText: "Source on GitHub",
    // Fallbacks shown if GET /api/v1/info is unavailable.
    title: "jinja-render",
    description:
      "A safe, local-first Jinja2 playground: render templates against YAML/JSON data with structured diagnostics.",
    repoUrl: "https://github.com/dr-duke/jinja-render",
  },
} as const;
