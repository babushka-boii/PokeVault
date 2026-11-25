/** The new-user guide (Iteration 9A): three steps computed by the server from the user's own data. */
export type Guide = { has_copy: boolean; has_stored: boolean; has_favorite: boolean; dismissed: boolean };
export class HomeError extends Error {
  constructor(public readonly status: number) { super("Home request failed"); }
}

const url = `${(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "")}/api/v1/home/guide`;
const keys = ["has_copy", "has_stored", "has_favorite", "dismissed"];

async function call(signal: AbortSignal, options: RequestInit = {}): Promise<Guide> {
  const response = await fetch(url, { credentials: "include", cache: "no-store", signal, ...options,
    headers: { Accept: "application/json", ...(options.headers ?? {}) } });
  if (!response.ok) throw new HomeError(response.status);
  const v: unknown = await response.json();
  if (typeof v !== "object" || v === null || Array.isArray(v) || Object.keys(v).length !== keys.length
    || !keys.every((key) => typeof (v as Record<string, unknown>)[key] === "boolean")) throw new HomeError(0);
  return v as Guide;
}

export const fetchGuide = (signal: AbortSignal) => call(signal);
export const closeGuide = (csrf: string, signal: AbortSignal) =>
  call(signal, { method: "PUT", body: JSON.stringify({ dismissed: true }), headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf } });
