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
        <Toggle
          label="Trim"
          checked={options.trim}
          onChange={(v) => setOption("trim", v)}
          title="Remove the first newline after template blocks."
        />
        <Toggle
          label="Lstrip"
          checked={options.lstrip}
          onChange={(v) => setOption("lstrip", v)}
          title="Strip leading spaces and tabs before template blocks."
        />
        <Toggle
          label="Strict check"
          checked={options.strict}
          onChange={(v) => setOption("strict", v)}
          title="Fail rendering when a variable is missing."
        />
        <Toggle
          label="Auto-render"
          checked={autoRender}
          onChange={setAutoRender}
          title="Render automatically after edits or focus changes."
        />
      </div>

      <div className="control-group actions">
        <button
          className="btn btn-primary btn-render"
          onClick={() => void render()}
          disabled={status === "loading"}
        >
          {status === "loading" ? "Rendering…" : "Render template"}
        </button>
      </div>
    </div>
  );
}
