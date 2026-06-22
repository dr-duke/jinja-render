import { useRef, useState } from "react";
import { useStore } from "../app/store";
import type { RenderMode } from "../types/api";
import {
  defaultWorkspaceFilename,
  downloadJsonFile,
  readFileAsText,
} from "../app/workspaceFile";
import { ToggleButton } from "./ToggleButton";
import { strings } from "../i18n/strings";

const t = strings.controlbar;
const f = strings.features;

// Static fallback used until /capabilities loads (or if the request fails).
const FALLBACK_MODES: RenderMode[] = ["base", "ansible", "salt"];

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
    autocompleteEnabled,
    capabilities,
    examples,
    setRenderMode,
    setOption,
    setAutoRender,
    setAutocompleteEnabled,
    loadExample,
    render,
    exportState,
    importState,
  } = useStore();

  const modes = capabilities?.renderModes ?? FALLBACK_MODES;

  const onPickExample = (id: string) => {
    const ex = examples.find((e) => e.id === id);
    if (ex) loadExample(ex.template, ex.data, ex.render_mode, ex.data_format);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [ioError, setIoError] = useState<string | null>(null);

  const onSave = () => {
    setIoError(null);
    try {
      const json = JSON.stringify(exportState(), null, 2);
      downloadJsonFile(defaultWorkspaceFilename(), json);
    } catch {
      setIoError(t.saveError);
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
        setIoError(t.loadCorruptError);
        return;
      }
      setIoError(null);
    } catch {
      setIoError(t.loadReadError);
    }
  };

  return (
    <div className="controlbar">
      <div className="control-group">
        <label className="mode-label">
          {t.modeLabel}
          <select
            aria-label={t.renderModeAria}
            value={renderMode}
            onChange={(e) => setRenderMode(e.target.value as RenderMode)}
          >
            {modes.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        {examples.length > 0 && (
          <label className="mode-label">
            {t.exampleLabel}
            <select
              aria-label={t.loadExampleAria}
              value=""
              onChange={(e) => onPickExample(e.target.value)}
            >
              <option value="" disabled>
                {t.examplePlaceholder}
              </option>
              {examples.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="control-group">
        <ToggleButton
          label={f.hints.label}
          pressed={autocompleteEnabled}
          onChange={setAutocompleteEnabled}
          title={f.hints.title}
        />
        <ToggleButton
          label={f.trim.label}
          pressed={options.trim}
          onChange={(v) => setOption("trim", v)}
          title={f.trim.title}
        />
        <ToggleButton
          label={f.lstrip.label}
          pressed={options.lstrip}
          onChange={(v) => setOption("lstrip", v)}
          title={f.lstrip.title}
        />
        <ToggleButton
          label={f.autoRender.label}
          pressed={autoRender}
          onChange={setAutoRender}
          title={f.autoRender.title}
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
          title={t.saveAria}
          aria-label={t.saveAria}
        >
          <SaveIcon />
        </button>
        <button
          type="button"
          className="btn btn-icon"
          onClick={onLoadClick}
          title={t.loadAria}
          aria-label={t.loadAria}
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
          {status === "loading" ? t.rendering : t.render}
        </button>
      </div>
    </div>
  );
}
