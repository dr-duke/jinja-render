import { useMemo } from "react";
import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import { useStore } from "../app/store";
import type { PanelId } from "../app/store";
import { PanelActions } from "./PanelActions";
import { CodeMirrorEditor } from "./editor/CodeMirrorEditor";
import { jinja } from "./editor/jinja";
import { jinjaAutocomplete } from "./editor/complete";
import { jinjaVariableHighlight } from "./editor/highlightVars";
import { jinjaDirective } from "./editor/directive";

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
  const options = useStore((s) => s.options);
  // Variable highlighting reacts to these: re-derive the extension when the Data
  // panel, format, mode, or server capabilities change so known/unknown updates.
  const data = useStore((s) => s.data);
  const renderMode = useStore((s) => s.renderMode);
  const capabilities = useStore((s) => s.capabilities);

  // On the template panel, pin the active whitespace options as a read-only
  // `#jinja2:` first line. It's frontend-only (not part of `value`, never sent to
  // the backend) and exists so the debugged template can be copied with the
  // directive. Empty when both options are off, or on the data panel.
  const directive = panel === "template" ? jinjaDirective(options) : "";
  // Copy yields the directive together with the editable text (what you'd paste
  // into an Ansible template).
  const copyText = () => (directive ? `${directive}\n${value}` : value);

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
      getCapabilities: () => useStore.getState().capabilities,
    });
  }, [panel, autocompleteEnabled]);

  // Always-on semantic variable highlighting on the template panel. The env reads
  // live store state lazily; deps trigger a recompute when known names may change.
  const variableHighlight = useMemo(() => {
    if (panel !== "template") return undefined;
    return jinjaVariableHighlight({
      getData: () => useStore.getState().data,
      getDataFormat: () => useStore.getState().dataFormat,
      getRenderMode: () => useStore.getState().renderMode,
      getCapabilities: () => useStore.getState().capabilities,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, data, dataFormat, renderMode, capabilities]);

  return (
    <div className="editor">
      <div className="panel-header">
        <span className="editor-label">{label}</span>
        <PanelActions
          panel={panel}
          getRawText={copyText}
          canCopy={value.length > 0 || directive.length > 0}
        />
      </div>
      <div className="editor-body">
        <CodeMirrorEditor
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          language={language}
          extraExtensions={extraExtensions}
          variableHighlight={variableHighlight}
          showLines={view.showLines}
          showWhitespaces={view.showWhitespaces}
          readOnlyPrefix={directive}
          ariaLabel={ariaLabel ?? label}
        />
      </div>
    </div>
  );
}
