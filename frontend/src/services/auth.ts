export type AuthUser = {
  id: string;
  display_name: string;
  email: string | null;
  email_verified: boolean;
  picture_url: string | null;
};

export type AuthSession = { user: AuthUser; csrf_token: string };
export type AuthErrorCode =
  | "configuration" | "cancelled" | "invalid_state" | "invalid_token"
  | "provider_unavailable" | "database_unavailable"
  | "session_unavailable" | "logout_failed" | "unknown";

const callbackCodes = new Set<string>([
  "configuration", "cancelled", "invalid_state", "invalid_token",
  "provider_unavailable", "database_unavailable",
]);

export function callbackErrorCode(value: unknown): AuthErrorCode {
  return typeof value === "string" && callbackCodes.has(value) ? value as AuthErrorCode : "unknown";
}

export class AuthClientError extends Error {
  constructor(public readonly code: AuthErrorCode) {
    super(code);
    this.name = "AuthClientError";
  }
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");
const endpoint = (path: string) => `${apiBaseUrl}/api/v1/auth/${path}`;
const headers = { Accept: "application/json" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isSession(value: unknown): value is AuthSession {
  if (!isRecord(value) || !isRecord(value.user)) return false;
  const user = value.user;
  return typeof value.csrf_token === "string" && value.csrf_token.length > 0
    && typeof user.id === "string" && user.id.length > 0
    && typeof user.display_name === "string"
    && (user.email === null || typeof user.email === "string")
    && typeof user.email_verified === "boolean"
    && (user.picture_url === null || (typeof user.picture_url === "string" && isHttpsUrl(user.picture_url)));
}

export async function fetchSession(signal?: AbortSignal): Promise<AuthSession | null> {
  try {
    const response = await fetch(endpoint("me"), { credentials: "include", headers, signal, cache: "no-store" });
    if (response.status === 401) return null;
    if (!response.ok) throw new AuthClientError("session_unavailable");
    const payload: unknown = await response.json();
    if (!isSession(payload)) throw new AuthClientError("session_unavailable");
    return payload;
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new AuthClientError("session_unavailable");
  }
}

export async function requestGoogleLogin(signal?: AbortSignal): Promise<string> {
  try {
    const response = await fetch(endpoint("google/login"), { credentials: "include", headers, signal, cache: "no-store" });
    const payload: unknown = await response.json();
    if (!response.ok) {
      throw new AuthClientError(isRecord(payload) ? callbackErrorCode(payload.error ?? payload.detail) : "unknown");
    }
    if (!isRecord(payload) || typeof payload.authorization_url !== "string" || !isHttpsUrl(payload.authorization_url)) {
      throw new AuthClientError("unknown");
    }
    const url = new URL(payload.authorization_url);
    if (url.hostname !== "accounts.google.com" || url.port || url.hash || url.pathname !== "/o/oauth2/v2/auth") {
      throw new AuthClientError("unknown");
    }
    return payload.authorization_url;
  } catch (error) {
    if (signal?.aborted || error instanceof AuthClientError) throw error;
    throw new AuthClientError("unknown");
  }
}

export async function endSession(csrfToken: string, signal?: AbortSignal): Promise<void> {
  try {
    const response = await fetch(endpoint("logout"), {
      method: "POST", credentials: "include", signal,
      headers: { ...headers, "X-CSRF-Token": csrfToken },
    });
    if (response.status !== 204 && response.status !== 401) throw new AuthClientError("logout_failed");
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new AuthClientError("logout_failed");
  }
}
