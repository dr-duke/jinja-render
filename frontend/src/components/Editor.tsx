import { useMemo } from "react";
import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import { useStore } from "../app/store";
import type { PanelId } from "../app/store";
import { PanelActions } from "./PanelActions";
import { CodeMirrorEditor } from "./editor/CodeMirrorEditor";
import { jinja } from "./editor/jinja";
import { jinjaAutocomplete } from "./editor/complete";

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
  const dataFormat = useStore((s) => s.dataFormat);
  const autocompleteEnabled = useStore((s) => s.autocompleteEnabled);

  // Template panel highlights Jinja2; data panel highlights JSON when the format
  // is explicitly json, otherwise YAML (covers "yaml" and "auto").
  const language = useMemo(() => {
    if (panel === "template") return jinja();
    return dataFormat === "json" ? json() : yaml();
  }, [panel, dataFormat]);

  // Autocomplete is only attached to the template panel, and only when the user
  // has enabled it (off by default). The completion env reads live store state
  // lazily, so the extension is stable; toggling the switch reconfigures the
  // editor's compartment (connect/disconnect) without recreating the view.
  const extraExtensions = useMemo(() => {
    if (panel !== "template" || !autocompleteEnabled) return undefined;
    return jinjaAutocomplete({
      getData: () => useStore.getState().data,
      getDataFormat: () => useStore.getState().dataFormat,
      getRenderMode: () => useStore.getState().renderMode,
    });
  }, [panel, autocompleteEnabled]);

  return (
    <div className="editor">
      <div className="panel-header">
        <span className="editor-label">{label}</span>
        <PanelActions panel={panel} getRawText={() => value} canCopy={value.length > 0} />
      </div>
      <div className="editor-body">
        <CodeMirrorEditor
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          language={language}
          extraExtensions={extraExtensions}
          showLines={view.showLines}
          showWhitespaces={view.showWhitespaces}
          ariaLabel={ariaLabel ?? label}
        />
      </div>
    </div>
  );
}
