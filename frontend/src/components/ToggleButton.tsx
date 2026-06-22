interface ToggleButtonProps {
  label: string;
  /** Pressed (aria-pressed=true) means the feature is enabled. */
  pressed: boolean;
  onChange: (pressed: boolean) => void;
  /** English explanation shown as a native hover tooltip. */
  title?: string;
}

// A feature toggle rendered as a button with a fixed pressed/unpressed state
// (aria-pressed). Pressed = feature on, unpressed = off. Replaces the previous
// sliding switch for the render options / hints row.
export function ToggleButton({ label, pressed, onChange, title }: ToggleButtonProps) {
  return (
    <button
      type="button"
      className={`btn btn-toggle${pressed ? " is-active" : ""}`}
      aria-pressed={pressed}
      title={title}
      onClick={() => onChange(!pressed)}
    >
      {label}
    </button>
  );
}
