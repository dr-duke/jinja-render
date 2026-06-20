import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../../app/store";
import { AUTO_RENDER_INTERVAL_MS } from "../../app/config";
import { ControlBar } from "../../components/ControlBar";
import { Editor } from "../../components/Editor";
import { OutputPane } from "../../components/OutputPane";

const MIN_COL_PCT = 20;
const MIN_ROW_PCT = 15;

export function Workbench() {
  const { template, data, setTemplate, setData, render, autoRender } = useStore();

  // Panel sizes kept in React state (no hidden persistence).
  const [leftColPct, setLeftColPct] = useState(50);
  const [templateRowPct, setTemplateRowPct] = useState(50);

  const mainRef = useRef<HTMLDivElement>(null);
  const leftColRef = useRef<HTMLDivElement>(null);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void render();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [render]);

  // Auto-render on a debounced timer whenever template/data change.
  useEffect(() => {
    if (!autoRender) return;
    if (autoTimer.current) clearTimeout(autoTimer.current);
    autoTimer.current = setTimeout(() => {
      void render();
    }, AUTO_RENDER_INTERVAL_MS);
    return () => {
      if (autoTimer.current) clearTimeout(autoTimer.current);
    };
  }, [template, data, autoRender, render]);

  // Auto-render immediately when an editor loses focus.
  const onEditorBlur = useCallback(() => {
    if (!autoRender) return;
    if (autoTimer.current) clearTimeout(autoTimer.current);
    void render();
  }, [autoRender, render]);

  const startColDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      const el = mainRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setLeftColPct(Math.min(100 - MIN_COL_PCT, Math.max(MIN_COL_PCT, pct)));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  const startRowDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      const el = leftColRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pct = ((ev.clientY - rect.top) / rect.height) * 100;
      setTemplateRowPct(Math.min(100 - MIN_ROW_PCT, Math.max(MIN_ROW_PCT, pct)));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  return (
    <div className="workbench">
      <header className="app-header">
        <h1>jinja-render</h1>
        <span className="subtitle">sandboxed Jinja2 playground</span>
      </header>
      <ControlBar />
      <main className="panes" ref={mainRef}>
        <div
          className="column column-left"
          ref={leftColRef}
          style={{ width: `${leftColPct}%` }}
        >
          <div className="pane pane-template" style={{ height: `${templateRowPct}%` }}>
            <Editor
              label="Template (Jinja2)"
              value={template}
              onChange={setTemplate}
              onBlur={onEditorBlur}
              ariaLabel="template"
            />
          </div>
          <div
            className="splitter splitter-horizontal"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize template and data panels"
            onMouseDown={startRowDrag}
          />
          <div className="pane pane-data" style={{ height: `${100 - templateRowPct}%` }}>
            <Editor
              label="Data (YAML / JSON)"
              value={data}
              onChange={setData}
              onBlur={onEditorBlur}
              ariaLabel="data"
            />
          </div>
        </div>
        <div
          className="splitter splitter-vertical"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize editors and output"
          onMouseDown={startColDrag}
        />
        <div className="column column-right" style={{ width: `${100 - leftColPct}%` }}>
          <div className="pane pane-output">
            <OutputPane />
          </div>
        </div>
      </main>
    </div>
  );
}
