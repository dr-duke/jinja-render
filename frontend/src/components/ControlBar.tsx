import { useRef, useState } from "react";
import { useStore } from "../app/store";
import type { RenderMode } from "../types/api";
import {
  defaultWorkspaceFilename,
  downloadJsonFile,
  readFileAsText,
} from "../app/workspaceFile";
import { Toggle } from "./Toggle";

const MODES: RenderMode[] = ["base", "ansible", "salt"];

function SaveIcon() {
  // Schematic floppy-disk glyph. Decorative.
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h8" />
    </svg>
  );
}

function LoadIcon() {
  // Schematic upload/import glyph (tray with an up arrow). Decorative.
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M12 3v12" />
      <path d="M7 8l5-5 5 5" />
    </svg>
  );
}

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
    exportState,
    importState,
  } = useStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [ioError, setIoError] = useState<string | null>(null);

  const onSave = () => {
    setIoError(null);
    try {
      const json = JSON.stringify(exportState(), null, 2);
      downloadJsonFile(defaultWorkspaceFilename(), json);
    } catch {
      setIoError("Could not save the workspace file.");
    }
  };

  const onLoadClick = () => {
    setIoError(null);
    fileInputRef.current?.click();
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    // Reset the input value so selecting the same file again re-fires change.
    input.value = "";
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const parsed = JSON.parse(text);
      if (!importState(parsed)) {
        setIoError("Unsupported or corrupt workspace file.");
        return;
      }
      setIoError(null);
    } catch {
      setIoError("Could not read the workspace file (invalid JSON).");
    }
  };

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
        {ioError && (
          <span className="controlbar-error" role="alert">
            {ioError}
          </span>
        )}
        <button
          type="button"
          className="btn btn-icon"
          onClick={onSave}
          title="Save workspace to a file"
          aria-label="Save workspace to a file"
        >
          <SaveIcon />
        </button>
        <button
          type="button"
          className="btn btn-icon"
          onClick={onLoadClick}
          title="Load workspace from a file"
          aria-label="Load workspace from a file"
        >
          <LoadIcon />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => void onFileChange(e)}
        />
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
