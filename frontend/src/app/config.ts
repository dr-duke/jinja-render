// Frontend configuration. Values are read from Vite env vars where present,
// otherwise sensible defaults are used.

function intEnv(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Debounce/interval (ms) between an edit and an auto-render when enabled.
export const AUTO_RENDER_INTERVAL_MS = intEnv(
  import.meta.env.VITE_AUTO_RENDER_INTERVAL_MS,
  1200,
);

// Whether auto-render is on by default.
export const AUTO_RENDER_DEFAULT = true;
