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

  setTemplate: (v: string) => void;
  setData: (v: string) => void;
  setDataFormat: (v: DataFormat) => void;
  setRenderMode: (v: RenderMode) => void;
  setOption: (key: keyof RenderOptions, value: boolean) => void;
  setAutoRender: (v: boolean) => void;
  loadExample: (template: string, data: string, mode: RenderMode, fmt: DataFormat) => void;
  clearOutput: () => void;
  render: () => Promise<void>;
}

export const useStore = create<WorkbenchState>((set, get) => ({
  template: DEFAULT_TEMPLATE,
  data: DEFAULT_DATA,
  dataFormat: "auto",
  renderMode: "base",
  options: { trim: true, lstrip: false, strict: true, show_whitespaces: false },
  status: "idle",
  lastSuccess: null,
  lastError: null,
  autoRender: AUTO_RENDER_DEFAULT,

  setTemplate: (v) => set({ template: v }),
  setData: (v) => set({ data: v }),
  setDataFormat: (v) => set({ dataFormat: v }),
  setRenderMode: (v) => set({ renderMode: v }),
  setOption: (key, value) =>
    set((s) => ({ options: { ...s.options, [key]: value } })),
  setAutoRender: (v) => set({ autoRender: v }),
  loadExample: (template, data, mode, fmt) =>
    set({ template, data, renderMode: mode, dataFormat: fmt }),
  clearOutput: () =>
    set({ lastSuccess: null, lastError: null, status: "idle" }),

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
