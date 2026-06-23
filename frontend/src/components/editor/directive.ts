import type { RenderOptions } from "../../types/api";

// Builds the Ansible-style magic comment that pins the active whitespace options
// on the first line of the template. Frontend-only: it is NOT sent to the backend
// and does not affect rendering by itself (the backend still renders using the
// options). It exists so a debugged template can be copied verbatim into an
// Ansible project, where `#jinja2:` overrides are honored.
//
// Examples:
//   { trim: true,  lstrip: false } -> "#jinja2: trim_blocks: True"
//   { trim: false, lstrip: true  } -> "#jinja2: lstrip_blocks: True"
//   { trim: true,  lstrip: true  } -> "#jinja2: trim_blocks: True, lstrip_blocks: True"
//   { trim: false, lstrip: false } -> ""  (no directive)
export function jinjaDirective(options: RenderOptions): string {
  const parts: string[] = [];
  if (options.trim) parts.push("trim_blocks: True");
  if (options.lstrip) parts.push("lstrip_blocks: True");
  return parts.length > 0 ? `#jinja2: ${parts.join(", ")}` : "";
}
