import { useEffect, useRef } from "react";
import { EditorState, type Extension, Compartment } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { editorTheme } from "./theme";
import { whitespaceExtension } from "./whitespace";
import { indentKeymap } from "./indent";

interface CodeMirrorEditorProps {
  value: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  /** Language/highlighting extension for this panel. */
  language?: Extension;
  /** Extra panel-specific extensions (e.g. autocomplete on the template panel). */
  extraExtensions?: Extension;
  showLines?: boolean;
  showWhitespaces?: boolean;
  readOnly?: boolean;
  /** Accessible name; also used by tests via getByLabelText. */
  ariaLabel?: string;
  /** Forwarded to the editable content node for test queries. */
  testId?: string;
}

// Reusable CodeMirror 6 editor. Compartments let us reconfigure language and the
// per-panel line-number / whitespace toggles without recreating the view, so the
// document, cursor and undo history are preserved across UI toggles.
export function CodeMirrorEditor({
  value,
  onChange,
  onBlur,
  language,
  extraExtensions,
  showLines = false,
  showWhitespaces = false,
  readOnly = false,
  ariaLabel,
  testId,
}: CodeMirrorEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const langComp = useRef(new Compartment());
  const linesComp = useRef(new Compartment());
  const wsComp = useRef(new Compartment());
  const readOnlyComp = useRef(new Compartment());
  const extraComp = useRef(new Compartment());

  // Keep the latest callbacks in refs so the view's update listener (created
  // once) always calls the current handlers without recreating the editor.
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  onChangeRef.current = onChange;
  onBlurRef.current = onBlur;

  // Create the view once on mount.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const contentAttrs: Record<string, string> = { role: "textbox", "aria-multiline": "true" };
    if (ariaLabel) contentAttrs["aria-label"] = ariaLabel;
    if (testId) contentAttrs["data-testid"] = testId;

    const updateListener = EditorView.updateListener.of((u) => {
      if (u.docChanged) onChangeRef.current?.(u.state.doc.toString());
      if (u.focusChanged && !u.view.hasFocus) onBlurRef.current?.();
    });

    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        // Editable input panels get two-space block indent on Tab / Shift+Tab.
        // This keymap has higher precedence than defaultKeymap so it captures Tab
        // before any default handler. The read-only output panel never gets it,
        // so Tab keeps its native focus-traversal behavior there.
        ...(readOnly ? [] : [indentKeymap()]),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        editorTheme(),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of(contentAttrs),
        langComp.current.of(language ?? []),
        extraComp.current.of(extraExtensions ?? []),
        linesComp.current.of(showLines ? lineNumbers() : []),
        wsComp.current.of(showWhitespaces ? whitespaceExtension() : []),
        readOnlyComp.current.of([
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
        ]),
        updateListener,
      ],
    });

    const view = new EditorView({ state, parent: host });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Intentionally run once: subsequent prop changes are applied via the
    // dedicated effects below (value sync + compartment reconfigure).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value -> editor (e.g. Clear, loadExample, store resets).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: langComp.current.reconfigure(language ?? []),
    });
  }, [language]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: extraComp.current.reconfigure(extraExtensions ?? []),
    });
  }, [extraExtensions]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: linesComp.current.reconfigure(showLines ? lineNumbers() : []),
    });
  }, [showLines]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: wsComp.current.reconfigure(showWhitespaces ? whitespaceExtension() : []),
    });
  }, [showWhitespaces]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readOnlyComp.current.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ]),
    });
  }, [readOnly]);

  return <div className="cm-host" ref={hostRef} />;
}
