import type {
  ExamplesResponse,
  RenderFailure,
  RenderRequest,
  RenderSuccess,
} from "../types/api";

const BASE = "/api/v1";

export async function renderTemplate(
  req: RenderRequest,
): Promise<RenderSuccess | RenderFailure> {
  const resp = await fetch(`${BASE}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  return (await resp.json()) as RenderSuccess | RenderFailure;
}

export async function fetchExamples(): Promise<ExamplesResponse> {
  const resp = await fetch(`${BASE}/examples`);
  return (await resp.json()) as ExamplesResponse;
}
