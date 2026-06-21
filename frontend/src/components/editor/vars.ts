import type { DataFormat } from "../../types/api";

// Extracts dotted variable paths from the Data panel for template autocompletion.
// Frontend-only, best-effort: invalid data yields an empty list (no completions)
// rather than throwing, so the editor never breaks.
//
// Output examples: ["user", "user.name", "server.interfaces.eth0.address"].
// Arrays contribute the array key itself plus, for arrays of objects, the keys
// of the first element (path[].key) so loop bodies get useful suggestions, while
// keeping output non-noisy.

const MAX_DEPTH = 6;
const MAX_PATHS = 500;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function walk(value: unknown, prefix: string, out: Set<string>, depth: number): void {
  if (out.size >= MAX_PATHS || depth > MAX_DEPTH) return;
  if (isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue; // skip non-identifier keys
      const path = prefix ? `${prefix}.${key}` : key;
      out.add(path);
      walk(value[key], path, out, depth + 1);
      if (out.size >= MAX_PATHS) return;
    }
  } else if (Array.isArray(value)) {
    // Suggest keys of the first object element under the array path, useful in
    // `{% for x in items %}{{ x.<key> }}` style loops.
    const first = value[0];
    if (isPlainObject(first)) {
      for (const key of Object.keys(first)) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
        out.add(prefix ? `${prefix}.${key}` : key);
      }
    }
  }
}

// Minimal YAML-subset parser: indentation-based mappings, nested maps, and block
// sequences ("- ") of scalars or maps. Inline JSON-ish flow values are parsed
// leniently. This is intentionally not a full YAML implementation — it only needs
// to recover the key structure for path suggestions. Lines it cannot interpret
// are skipped; the rest of the structure still yields useful paths.
function scalarOf(raw: string): unknown {
  const s = raw.trim();
  if (s === "" || s === "~" || s === "null") return null;
  if (s === "true" || s === "True") return true;
  if (s === "false" || s === "False") return false;
  if (/^-?\d+$/.test(s)) return Number(s);
  if (/^-?\d*\.\d+$/.test(s)) return Number(s);
  if (/^["'].*["']$/.test(s)) return s.slice(1, -1);
  if (s.startsWith("{") || s.startsWith("[")) {
    try {
      return JSON.parse(s);
    } catch {
      return s;
    }
  }
  return s;
}

interface Frame {
  indent: number;
  // The container at this level, plus how to replace it in its parent when a
  // map needs to become a sequence (key:\n  - ...).
  value: Record<string, unknown> | unknown[];
  attach: (next: Record<string, unknown> | unknown[]) => void;
}

function parseYamlSubset(text: string): unknown {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const root: Record<string, unknown> = {};
  const stack: Frame[] = [{ indent: -1, value: root, attach: () => {} }];

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+#.*$/, "");
    const trimmed = line.trim();
    if (trimmed === "" || trimmed === "---" || trimmed === "...") continue;
    if (line.trimStart().startsWith("#")) continue;

    const indent = line.length - line.trimStart().length;

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const top = stack[stack.length - 1];

    if (trimmed.startsWith("- ") || trimmed === "-") {
      // Block sequence item. Promote the current map frame to an array on first
      // item if it is still an empty map.
      if (!Array.isArray(top.value)) {
        if (isPlainObject(top.value) && Object.keys(top.value).length === 0) {
          const arr: unknown[] = [];
          top.attach(arr);
          top.value = arr;
        } else {
          continue; // can't reconcile; skip this line
        }
      }
      const arr = top.value as unknown[];
      const item = trimmed === "-" ? "" : trimmed.slice(2).trim();
      const kvMatch = item.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
      if (kvMatch) {
        const obj: Record<string, unknown> = {};
        const idx = arr.push(obj) - 1;
        const [, k, v] = kvMatch;
        if (v !== "") obj[k] = scalarOf(v);
        // Following sibling keys of this item (deeper indent) attach to obj.
        stack.push({
          indent,
          value: obj,
          attach: (n) => {
            arr[idx] = n;
          },
        });
      } else if (item !== "") {
        arr.push(scalarOf(item));
      }
      continue;
    }

    const kv = trimmed.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    if (Array.isArray(top.value)) continue;
    const map = top.value as Record<string, unknown>;
    const [, key, val] = kv;
    if (val === "") {
      const child: Record<string, unknown> = {};
      map[key] = child;
      stack.push({
        indent,
        value: child,
        attach: (n) => {
          map[key] = n;
        },
      });
    } else {
      map[key] = scalarOf(val);
    }
  }

  return root;
}

export function extractVariablePaths(data: string, format: DataFormat): string[] {
  const text = data ?? "";
  if (text.trim() === "") return [];

  let parsed: unknown = null;
  if (format === "json") {
    try {
      parsed = JSON.parse(text);
    } catch {
      return [];
    }
  } else {
    // yaml or auto: try JSON first (valid JSON is valid for our purpose), then
    // the YAML subset.
    try {
      parsed = JSON.parse(text);
    } catch {
      try {
        parsed = parseYamlSubset(text);
      } catch {
        return [];
      }
    }
  }

  if (!isPlainObject(parsed) && !Array.isArray(parsed)) return [];

  const out = new Set<string>();
  walk(parsed, "", out, 0);
  return Array.from(out).sort();
}
