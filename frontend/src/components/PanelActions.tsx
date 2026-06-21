import { useState } from "react";
import { useStore } from "../app/store";
import type { PanelId } from "../app/store";

interface PanelActionsProps {
  panel: PanelId;
  /** Raw text to copy for this panel (never includes decorative markers). */
  getRawText: () => string;
  /** Copy is disabled when there is nothing to copy. */
  canCopy: boolean;
}

function CopyIcon() {
  // Schematic copy glyph (two stacked sheets). Decorative.
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

export function PanelActions({ panel, getRawText, canCopy }: PanelActionsProps) {
  const { panelViews, setPanelView, clearPanel } = useStore();
  const view = panelViews[panel];
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(getRawText());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="panel-actions">
      <button
        type="button"
        className="btn btn-icon"
        onClick={() => void copy()}
        disabled={!canCopy}
        title="Copy raw content"
        aria-label={copied ? "Copied" : "Copy"}
      >
        <CopyIcon />
      </button>
      <button
        type="button"
        className={`btn btn-icon${view.showLines ? " is-active" : ""}`}
        aria-pressed={view.showLines}
        onClick={() => setPanelView(panel, "showLines", !view.showLines)}
        title="Toggle line numbers"
        aria-label="Toggle line numbers"
      >
        #
      </button>
      <button
        type="button"
        className={`btn btn-icon${view.showWhitespaces ? " is-active" : ""}`}
        aria-pressed={view.showWhitespaces}
        onClick={() => setPanelView(panel, "showWhitespaces", !view.showWhitespaces)}
        title="Show whitespace characters"
        aria-label="Show whitespaces"
      >
        ¶
      </button>
      <button
        type="button"
        className="btn btn-icon"
        onClick={() => clearPanel(panel)}
        title="Clear this panel"
        aria-label="Clear"
      >
        ✕
      </button>
    </div>
  );
}
