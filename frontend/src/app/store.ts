import { create } from "zustand";
import { renderTemplate } from "../services/api";
import { AUTO_RENDER_DEFAULT } from "./config";
import type {
  DataFormat,
  RenderFailure,
  RenderMode,
  RenderOptions,
  RenderSuccess,
} from "../types/api";

const DEFAULT_TEMPLATE = `Hosts:
{% for host in hosts %}
  - {{ host.name }} ({{ host.ip }})
{% endfor %}
`;

const DEFAULT_DATA = `hosts:
  - name: web-01
    ip: 192.0.2.10
  - name: web-02
    ip: 192.0.2.11
`;

export type Status = "idle" | "loading" | "success" | "error";

// The three panels that carry their own view toggles (line numbers / whitespace).
export type PanelId = "template" | "data" | "output";

export interface PanelView {
  showLines: boolean;
  showWhitespaces: boolean;
}

export type PanelViews = Record<PanelId, PanelView>;

const DEFAULT_PANEL_VIEWS: PanelViews = {
  template: { showLines: false, showWhitespaces: false },
  data: { showLines: false, showWhitespaces: false },
  output: { showLines: false, showWhitespaces: false },
};

// Versioned localStorage key. Bump the suffix to invalidate incompatible state.
const STORAGE_KEY = "jinja-render:v1:workspace-state";
const SCHEMA_VERSION = 1;
const SAVE_DEBOUNCE_MS = 400;

// Shape persisted to localStorage (and to exported workspace files). Derived /
// server output is never persisted.
export interface PersistedState {
  version: number;
  template: string;
  data: string;
  dataFormat: DataFormat;
  renderMode: RenderMode;
  options: RenderOptions;
  autoRender: boolean;
  panelViews: PanelViews;
}

export { SCHEMA_VERSION };

interface WorkbenchState {
  template: string;
  data: string;
  dataFormat: DataFormat;
  renderMode: RenderMode;
  options: RenderOptions;
  status: Status;
  lastSuccess: RenderSuccess | null;
  lastError: RenderFailure | null;
  autoRender: boolean;
  panelViews: PanelViews;

  setTemplate: (v: string) => void;
  setData: (v: string) => void;
  setDataFormat: (v: DataFormat) => void;
  setRenderMode: (v: RenderMode) => void;
  setOption: (key: keyof RenderOptions, value: boolean) => void;
  setAutoRender: (v: boolean) => void;
  setPanelView: (panel: PanelId, key: keyof PanelView, value: boolean) => void;
  loadExample: (template: string, data: string, mode: RenderMode, fmt: DataFormat) => void;
  clearPanel: (panel: PanelId) => void;
  render: () => Promise<void>;
  exportState: () => PersistedState;
  importState: (parsed: unknown) => boolean;
}

function hasStorage(): boolean {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

function mergePanelViews(raw: unknown): PanelViews {
  const result: PanelViews = {
    template: { ...DEFAULT_PANEL_VIEWS.template },
    data: { ...DEFAULT_PANEL_VIEWS.data },
    output: { ...DEFAULT_PANEL_VIEWS.output },
  };
  if (!raw || typeof raw !== "object") return result;
  const obj = raw as Record<string, unknown>;
  for (const panel of ["template", "data", "output"] as PanelId[]) {
    const v = obj[panel];
    if (v && typeof v === "object") {
      const pv = v as Record<string, unknown>;
      if (typeof pv.showLines === "boolean") result[panel].showLines = pv.showLines;
      if (typeof pv.showWhitespaces === "boolean")
        result[panel].showWhitespaces = pv.showWhitespaces;
    }
  }
  return result;
}

// Validate and coerce an already-parsed object into a partial workbench state.
// Returns null when the object is missing or its schema version is incompatible.
// Used both for localStorage restore and for importing workspace files, so the
// two paths can never drift apart.
export function validatePersisted(parsed: unknown): Partial<WorkbenchState> | null {
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Partial<PersistedState>;
  if (p.version !== SCHEMA_VERSION) return null;

  const restored: Partial<WorkbenchState> = {};
  if (typeof p.template === "string") restored.template = p.template;
  if (typeof p.data === "string") restored.data = p.data;
  if (p.dataFormat === "auto" || p.dataFormat === "yaml" || p.dataFormat === "json")
    restored.dataFormat = p.dataFormat;
  if (p.renderMode === "base" || p.renderMode === "ansible" || p.renderMode === "salt")
    restored.renderMode = p.renderMode;
  if (p.options && typeof p.options === "object") {
    restored.options = {
      trim: !!p.options.trim,
      lstrip: !!p.options.lstrip,
      strict: !!p.options.strict,
    };
  }
  if (typeof p.autoRender === "boolean") restored.autoRender = p.autoRender;
  restored.panelViews = mergePanelViews(p.panelViews);
  return restored;
}

// Read persisted state at startup. Corrupt/incompatible state is ignored (and
// cleared) so a bad record never breaks the app.
function loadPersisted(): Partial<WorkbenchState> | null {
  if (!hasStorage()) return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const restored = validatePersisted(JSON.parse(raw));
    if (!restored) {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      return null;
    }
    return restored;
  } catch {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
}

function toPersisted(s: WorkbenchState): PersistedState {
  return {
    version: SCHEMA_VERSION,
    template: s.template,
    data: s.data,
    dataFormat: s.dataFormat,
    renderMode: s.renderMode,
    options: s.options,
    autoRender: s.autoRender,
    panelViews: s.panelViews,
  };
}

// QuotaExceededError / private-mode unavailability must never break the app.
function writePersisted(s: WorkbenchState): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersisted(s)));
  } catch {
    /* ignore quota / unavailable storage */
  }
}

const persistedDefaults = loadPersisted();

export const useStore = create<WorkbenchState>((set, get) => ({
  template: DEFAULT_TEMPLATE,
  data: DEFAULT_DATA,
  dataFormat: "auto",
  renderMode: "base",
  options: { trim: true, lstrip: false, strict: true },
  status: "idle",
  lastSuccess: null,
  lastError: null,
  autoRender: AUTO_RENDER_DEFAULT,
  panelViews: DEFAULT_PANEL_VIEWS,
  ...persistedDefaults,

  setTemplate: (v) => set({ template: v }),
  setData: (v) => set({ data: v }),
  setDataFormat: (v) => set({ dataFormat: v }),
  setRenderMode: (v) => set({ renderMode: v }),
  setOption: (key, value) =>
    set((s) => ({ options: { ...s.options, [key]: value } })),
  setAutoRender: (v) => set({ autoRender: v }),
  setPanelView: (panel, key, value) =>
    set((s) => ({
      panelViews: { ...s.panelViews, [panel]: { ...s.panelViews[panel], [key]: value } },
    })),
  loadExample: (template, data, mode, fmt) =>
    set({ template, data, renderMode: mode, dataFormat: fmt }),
  clearPanel: (panel) => {
    if (panel === "template") set({ template: "" });
    else if (panel === "data") set({ data: "" });
    else set({ lastSuccess: null, lastError: null, status: "idle" });
  },

  // Snapshot of the persistable workspace (same shape as localStorage). Never
  // includes the rendered output / server response.
  exportState: () => toPersisted(get()),

  // Apply an imported workspace object. Returns false (leaving current state
  // untouched) when the object fails schema validation, so a bad file can never
  // corrupt the in-memory workspace. On success the new state is also persisted.
  importState: (parsed) => {
    const restored = validatePersisted(parsed);
    if (!restored) return false;
    set(restored);
    writePersisted(get());
    return true;
  },

  render: async () => {
    const { template, data, dataFormat, renderMode, options } = get();
    set({ status: "loading" });
    try {
      const result = await renderTemplate({
        template,
        data,
        data_format: dataFormat,
        render_mode: renderMode,
        options,
      });
      if (result.success) {
        // Keep last successful render visible; only clear prior error.
        set({ status: "success", lastSuccess: result, lastError: null });
      } else {
        set({ status: "error", lastError: result });
      }
    } catch (e) {
      set({
        status: "error",
        lastError: {
          success: false,
          error: {
            type: "internal_error",
            message: e instanceof Error ? e.message : "Network error",
            line: null,
            column: null,
            details: {},
          },
          meta: { duration_ms: 0 },
        },
      });
    }
  },
}));

// --- Persistence wiring -----------------------------------------------------
// Debounced autosave on any change to persisted fields, plus flush on tab hide
// / unload so the last edits are never lost outside the debounce window.
if (hasStorage()) {
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    writePersisted(useStore.getState());
  };

  let prev = toPersisted(useStore.getState());
  useStore.subscribe((state) => {
    const next = toPersisted(state);
    // Only schedule a write when a persisted field actually changed.
    if (JSON.stringify(next) === JSON.stringify(prev)) return;
    prev = next;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      writePersisted(useStore.getState());
    }, SAVE_DEBOUNCE_MS);
  });

  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("beforeunload", flush);
}
