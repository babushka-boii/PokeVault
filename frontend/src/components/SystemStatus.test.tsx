import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { LocaleProvider } from "../i18n/LocaleProvider";
import { HealthClientError, fetchHealth, type HealthResponse } from "../services/health";
import { SystemStatus } from "./SystemStatus";


const healthy: HealthResponse = {
  status: "healthy",
  api: "healthy",
  database: "healthy",
  version: "0.1.0",
};

afterEach(() => vi.unstubAllGlobals());

describe("health client", () => {
  test("requests the exact versioned endpoint and accepts HTTP 200", async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(healthy), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", request);

    await expect(fetchHealth()).resolves.toEqual(healthy);
    expect(request).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/health",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
  });

  test("accepts the stable degraded schema from HTTP 503", async () => {
    const degraded: HealthResponse = {
      ...healthy,
      status: "degraded",
      database: "unavailable",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(degraded), { status: 503 })),
    );

    await expect(fetchHealth()).resolves.toEqual(degraded);
  });

  test("rejects malformed responses without exposing their body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response('{"password":"do-not-render"}', { status: 500 }),
      ),
    );

    const error = await fetchHealth().catch((reason: unknown) => reason);

    expect(error).toEqual(new HealthClientError("PokéVault API is unavailable"));
    expect(String(error)).not.toContain("do-not-render");
  });
});

describe("SystemStatus", () => {
  test("renders loading then separate healthy API and database states", async () => {
    renderStatus(vi.fn().mockResolvedValue(healthy));

    expect(screen.getByText("Comprobando conexiones…")).toBeInTheDocument();
    expect(await screen.findByText("API disponible")).toBeInTheDocument();
    expect(screen.getByText("PostgreSQL disponible")).toBeInTheDocument();
  });

  test("renders an unreachable state and retries", async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new HealthClientError("offline"))
      .mockResolvedValueOnce(healthy);
    const user = userEvent.setup();
    renderStatus(load);

    await user.click(await screen.findByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("PostgreSQL disponible")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  test("renders the API separately when PostgreSQL is degraded", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({
        ...healthy,
        status: "degraded",
        database: "unavailable",
      })
      .mockResolvedValueOnce(healthy);
    const user = userEvent.setup();
    renderStatus(load);

    expect(await screen.findByText("API disponible")).toBeInTheDocument();
    expect(screen.getByText("PostgreSQL no disponible")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("PostgreSQL disponible")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  test("aborts the active request when unmounted", async () => {
    let observedSignal: AbortSignal | undefined;
    const load = vi.fn((signal?: AbortSignal) => {
      observedSignal = signal;
      return new Promise<HealthResponse>(() => undefined);
    });
    const view = renderStatus(load);

    view.unmount();

    await waitFor(() => expect(observedSignal?.aborted).toBe(true));
  });
});

function renderStatus(loadHealth: (signal?: AbortSignal) => Promise<HealthResponse>) {
  return render(
    <LocaleProvider>
      <SystemStatus loadHealth={loadHealth} />
    </LocaleProvider>,
  );
}
