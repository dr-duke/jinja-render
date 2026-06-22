export type DataFormat = "auto" | "yaml" | "json";
export type RenderMode = "base" | "ansible" | "salt";

export interface RenderOptions {
  trim: boolean;
  lstrip: boolean;
}

export interface RenderRequest {
  template: string;
  data: string;
  data_format: DataFormat;
  render_mode: RenderMode;
  options: RenderOptions;
}

export interface RenderMeta {
  data_format_detected: string;
  render_mode_applied: string;
  filters_enabled: string[];
  duration_ms: number;
}

export interface RenderSuccess {
  success: true;
  rendered: string;
  data_parsed: unknown;
  meta: RenderMeta;
  warnings: string[];
}

export interface ApiError {
  type: string;
  message: string;
  line: number | null;
  column: number | null;
  details: Record<string, unknown>;
}

export interface RenderFailure {
  success: false;
  error: ApiError;
  meta: { duration_ms: number };
}

export interface Example {
  id: string;
  title: string;
  render_mode: RenderMode;
  data_format: DataFormat;
  template: string;
  data: string;
}

export interface ExamplesResponse {
  examples: Example[];
  default: Example;
}

// Raw /capabilities payload (snake_case, as the backend serializes it).
export interface CapabilitiesResponse {
  render_modes: RenderMode[];
  options: string[];
  filters: string[];
  filters_by_mode: Record<string, string[]>;
  filter_descriptions: Record<string, string>;
  ansible_facts: string[];
  data_formats: DataFormat[];
}

// Project metadata from GET /api/v1/info (shown in the info popover).
export interface InfoResponse {
  name: string;
  description: string;
  version: string;
  repository: string;
  license: string;
}

// Normalized capabilities kept in the store and consumed by the UI/autocomplete.
export interface Capabilities {
  renderModes: RenderMode[];
  options: string[];
  filtersByMode: Record<string, string[]>;
  filterDescriptions: Record<string, string>;
  ansibleFacts: string[];
  dataFormats: DataFormat[];
}
