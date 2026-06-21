interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** English explanation shown as a native hover tooltip. */
  title?: string;
}

export function Toggle({ label, checked, onChange, title }: ToggleProps) {
  return (
    <label className="switch" title={title}>
      <input
        type="checkbox"
        className="switch-input"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
      <span className="switch-label">{label}</span>
    </label>
  );
}
