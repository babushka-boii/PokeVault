export type HealthResponse = {
  status: "healthy" | "degraded";
  api: "healthy";
  database: "healthy" | "unavailable";
  version: string;
};

export class HealthClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HealthClientError";
  }
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(
  /\/$/,
  "",
);

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/api/v1/health`, {
      headers: { Accept: "application/json" },
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new HealthClientError("PokéVault API is unavailable");
  }

  if (response.status !== 200 && response.status !== 503) {
    throw new HealthClientError("PokéVault API is unavailable");
  }

  try {
    const payload: unknown = await response.json();
    if (!isHealthResponse(payload)) {
      throw new HealthClientError("PokéVault API returned an invalid response");
    }
    return payload;
  } catch (error) {
    if (error instanceof HealthClientError) {
      throw error;
    }
    throw new HealthClientError("PokéVault API returned an invalid response");
  }
}

function isHealthResponse(value: unknown): value is HealthResponse {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    (record.status === "healthy" || record.status === "degraded") &&
    record.api === "healthy" &&
    (record.database === "healthy" || record.database === "unavailable") &&
    typeof record.version === "string"
  );
}
