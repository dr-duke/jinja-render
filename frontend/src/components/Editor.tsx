interface EditorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  ariaLabel?: string;
}

export function Editor({ label, value, onChange, onBlur, ariaLabel }: EditorProps) {
  return (
    <div className="editor">
      <div className="editor-label">{label}</div>
      <textarea
        className="editor-textarea"
        aria-label={ariaLabel ?? label}
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
    </div>
  );
}
