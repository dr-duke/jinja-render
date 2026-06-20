export type DataFormat = "auto" | "yaml" | "json";
export type RenderMode = "base" | "ansible" | "salt";

export interface RenderOptions {
  trim: boolean;
  lstrip: boolean;
  strict: boolean;
  show_whitespaces: boolean;
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
  rendered_visualized: string;
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
