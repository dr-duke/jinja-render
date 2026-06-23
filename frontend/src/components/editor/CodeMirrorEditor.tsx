import { useEffect, useRef } from "react";
import {
  EditorState,
  type Extension,
  Compartment,
  Transaction,
} from "@codemirror/state";
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
  /**
   * A protected, non-editable first line prepended to the document (e.g. the
   * `#jinja2:` directive). It is part of the document — so it is selectable and
   * included when copying — but the user cannot edit or delete it. It is NOT part
   * of `value`: onChange always reports the text after the prefix, so callers
   * keep a clean value. Empty string means no prefix.
   */
  readOnlyPrefix?: string;
  /** Accessible name; also used by tests via getByLabelText. */
  ariaLabel?: string;
  /** Forwarded to the editable content node for test queries. */
  testId?: string;
}

// Compose the editor document from an optional protected prefix line and the
// editable value.
function composeDoc(prefix: string, value: string): string {
  return prefix ? `${prefix}\n${value}` : value;
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
  readOnlyPrefix = "",
  ariaLabel,
  testId,
}: CodeMirrorEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Length of the protected region (prefix + its trailing newline). Read by the
  // transaction filter and the change listener; kept in a ref so they always see
  // the current value without recreating the view.
  const protectedLenRef = useRef(readOnlyPrefix ? readOnlyPrefix.length + 1 : 0);

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
      if (u.docChanged) {
        const doc = u.state.doc.toString();
        const plen = protectedLenRef.current;
        // Report only the editable text after the protected prefix.
        onChangeRef.current?.(plen ? doc.slice(plen) : doc);
      }
      if (u.focusChanged && !u.view.hasFocus) onBlurRef.current?.();
    });

    // Block user edits that touch the protected prefix region. Programmatic
    // syncs (our value/prefix updates) carry no userEvent annotation and pass
    // through, so they can rebuild the prefix freely.
    const protectPrefix = EditorState.transactionFilter.of((tr) => {
      const plen = protectedLenRef.current;
      if (plen === 0 || !tr.docChanged) return tr;
      if (tr.annotation(Transaction.userEvent) === undefined) return tr;
      let blocked = false;
      tr.changes.iterChangedRanges((fromA) => {
        if (fromA < plen) blocked = true;
      });
      return blocked ? [] : tr;
    });

    const state = EditorState.create({
      doc: composeDoc(readOnlyPrefix, value),
      extensions: [
        history(),
        protectPrefix,
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

  // Sync external value/prefix -> editor (e.g. Clear, loadExample, store resets,
  // or toggling trim/lstrip which changes the prefix). The dispatch carries no
  // userEvent annotation, so the prefix-protection filter lets it rebuild the
  // protected line.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    protectedLenRef.current = readOnlyPrefix ? readOnlyPrefix.length + 1 : 0;
    const wantDoc = composeDoc(readOnlyPrefix, value);
    const current = view.state.doc.toString();
    if (current !== wantDoc) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: wantDoc } });
    }
  }, [value, readOnlyPrefix]);

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
