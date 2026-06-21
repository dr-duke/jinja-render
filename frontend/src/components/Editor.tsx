import { useRef } from "react";
import { useStore } from "../app/store";
import type { PanelId } from "../app/store";
import { PanelActions } from "./PanelActions";
import { LineNumbers, decorateWhitespace } from "./decorate";

interface EditorProps {
  label: string;
  panel: Extract<PanelId, "template" | "data">;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  ariaLabel?: string;
}

export function Editor({ label, panel, value, onChange, onBlur, ariaLabel }: EditorProps) {
  const view = useStore((s) => s.panelViews[panel]);
  const overlayRef = useRef<HTMLPreElement>(null);

  const showLines = view.showLines;
  const showWs = view.showWhitespaces;

  // Keep the decorative overlay scroll in sync with the textarea so markers line
  // up with the underlying (transparent) text the user is editing.
  const onScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (!overlayRef.current) return;
    overlayRef.current.scrollTop = e.currentTarget.scrollTop;
    overlayRef.current.scrollLeft = e.currentTarget.scrollLeft;
  };

  return (
    <div className="editor">
      <div className="panel-header">
        <span className="editor-label">{label}</span>
        <PanelActions panel={panel} getRawText={() => value} canCopy={value.length > 0} />
      </div>
      <div className={`editor-body${showLines ? " with-lines" : ""}`}>
        {showLines && <LineNumbers text={value} />}
        <div className="editor-area">
          {showWs && (
            <pre className="ws-overlay" aria-hidden="true" ref={overlayRef}>
              {decorateWhitespace(value)}
            </pre>
          )}
          <textarea
            className={`editor-textarea${showWs ? " text-transparent" : ""}`}
            aria-label={ariaLabel ?? label}
            spellCheck={false}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            onScroll={onScroll}
          />
        </div>
      </div>
    </div>
  );
}
