import { load as loadYaml } from "js-yaml";
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

// Parse the Data panel and return sorted dotted variable paths. JSON is parsed
// strictly; yaml/auto go through js-yaml (a real YAML parser — JSON is a YAML
// subset, so it is covered too). Any parse error yields [] so the editor never
// breaks on partially-typed data.
export function extractVariablePaths(data: string, format: DataFormat): string[] {
  const text = data ?? "";
  if (text.trim() === "") return [];

  let parsed: unknown;
  try {
    parsed = format === "json" ? JSON.parse(text) : loadYaml(text);
  } catch {
    return [];
  }

  if (!isPlainObject(parsed) && !Array.isArray(parsed)) return [];

  const out = new Set<string>();
  walk(parsed, "", out, 0);
  return Array.from(out).sort();
}
