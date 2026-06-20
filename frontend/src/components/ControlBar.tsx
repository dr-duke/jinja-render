import { useStore } from "../app/store";
import type { RenderMode } from "../types/api";
import { Toggle } from "./Toggle";

const MODES: RenderMode[] = ["base", "ansible", "salt"];

export function ControlBar() {
  const {
    renderMode,
    options,
    status,
    autoRender,
    setRenderMode,
    setOption,
    setAutoRender,
    render,
    clearOutput,
  } = useStore();

  return (
    <div className="controlbar">
      <div className="control-group">
        <label className="mode-label">
          Mode
          <select
            aria-label="Render mode"
            value={renderMode}
            onChange={(e) => setRenderMode(e.target.value as RenderMode)}
          >
            {MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="control-group">
        <Toggle label="Trim" checked={options.trim} onChange={(v) => setOption("trim", v)} />
        <Toggle label="Lstrip" checked={options.lstrip} onChange={(v) => setOption("lstrip", v)} />
        <Toggle label="Strict check" checked={options.strict} onChange={(v) => setOption("strict", v)} />
        <Toggle
          label="Show whitespaces"
          checked={options.show_whitespaces}
          onChange={(v) => setOption("show_whitespaces", v)}
        />
        <Toggle label="Auto-render" checked={autoRender} onChange={setAutoRender} />
      </div>

      <div className="control-group actions">
        <button
          className="btn btn-primary"
          onClick={() => void render()}
          disabled={status === "loading"}
        >
          {status === "loading" ? "Rendering…" : "Render template"}
        </button>
        <button className="btn" onClick={clearOutput}>
          Clear render
        </button>
      </div>
    </div>
  );
}
