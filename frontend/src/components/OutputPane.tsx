import { useStore } from "../app/store";
import { PanelActions } from "./PanelActions";
import { CodeMirrorEditor } from "./editor/CodeMirrorEditor";

export function OutputPane() {
  const { lastSuccess, lastError } = useStore();
  const view = useStore((s) => s.panelViews.output);

  const raw = lastSuccess?.rendered ?? "";

  return (
    <div className="output">
      <div className="panel-header">
        <span className="editor-label">Rendered output</span>
        <PanelActions panel="output" getRawText={() => raw} canCopy={!!lastSuccess} />
      </div>

      {lastError && (
        <div className="error-box" role="alert">
          <div className="error-type">{lastError.error.type}</div>
          <div className="error-message">{lastError.error.message}</div>
          {lastError.error.line != null && (
            <div className="error-loc">
              line {lastError.error.line}
              {lastError.error.column != null ? `, column ${lastError.error.column}` : ""}
            </div>
          )}
        </div>
      )}

      <div className="output-body">
        <CodeMirrorEditor
          value={raw}
          readOnly
          showLines={view.showLines}
          showWhitespaces={view.showWhitespaces}
          ariaLabel="rendered output"
          testId="output"
        />
      </div>

      {lastSuccess && (
        <div className="output-meta">
          format: {lastSuccess.meta.data_format_detected} · mode:{" "}
          {lastSuccess.meta.render_mode_applied} · {lastSuccess.meta.duration_ms} ms
          {lastSuccess.warnings.length > 0 && (
            <span className="warnings"> · {lastSuccess.warnings.join("; ")}</span>
          )}
        </div>
      )}
    </div>
  );
}
