// Browser-side helpers to save the current workspace to a JSON file and to read
// a workspace JSON file back. No backend is involved.

// Build the default download filename: `<hostname>-<YYYYMMDD-HHMM>.json`, using
// the browser's hostname (falling back to "jinja-render") and local time to the
// minute. The hostname is sanitized to characters safe in filenames.
export function defaultWorkspaceFilename(now: Date = new Date()): string {
  let host = "";
  try {
    host = (typeof window !== "undefined" && window.location?.hostname) || "";
  } catch {
    host = "";
  }
  const safeHost = sanitizeForFilename(host) || "jinja-render";

  const y = now.getFullYear();
  const mo = pad2(now.getMonth() + 1);
  const d = pad2(now.getDate());
  const h = pad2(now.getHours());
  const mi = pad2(now.getMinutes());
  return `${safeHost}-${y}${mo}${d}-${h}${mi}.json`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Keep letters, digits, dot, dash and underscore; collapse anything else to a
// dash so the result is safe across common filesystems.
function sanitizeForFilename(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Trigger a browser download of `content` as `filename`. Uses an object URL and
// a transient anchor; both are cleaned up afterwards.
export function downloadJsonFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Read a File as text. Uses FileReader for broad environment support (older
// browsers and jsdom lack File.prototype.text). Rejects on read error.
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.readAsText(file);
  });
}
