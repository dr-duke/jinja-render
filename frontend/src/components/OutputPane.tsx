import { useState } from "react";
import { useStore } from "../app/store";

export function OutputPane() {
  const { lastSuccess, lastError, options } = useStore();
  const [copied, setCopied] = useState(false);

  const raw = lastSuccess?.rendered ?? "";
  const displayed =
    options.show_whitespaces && lastSuccess
      ? lastSuccess.rendered_visualized
      : raw;

  const copy = async () => {
    // Copy always copies the raw rendered text, never the visualized form.
    await navigator.clipboard.writeText(raw);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="output">
      <div className="output-header">
        <span className="editor-label">Rendered output</span>
        <button
          className="btn btn-small"
          onClick={() => void copy()}
          disabled={!lastSuccess}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
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

      <pre className="output-pre" data-testid="output">
        {displayed}
      </pre>

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
