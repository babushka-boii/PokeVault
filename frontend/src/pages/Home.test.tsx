import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { App } from "../app/App";

const profile = { id: "4f6a3fab-002c-44e1-b3e8-0247badc013c", display_name: "Ash Ketchum", email: "ash@example.test", email_verified: true, picture_url: null };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

/** Routes every request by path; unknown paths fail loudly so unplanned requests are caught. */
function stubApi({ signedIn = false, pendingSession = false } = {}) {
  const request = vi.fn((input: string) => {
    const path = new URL(input).pathname;
    if (path === "/api/v1/auth/me") return pendingSession ? new Promise<Response>(() => undefined) : Promise.resolve(signedIn ? json({ user: profile, csrf_token: "csrf" }) : json({}, 401));
    if (path === "/api/v1/me/settings") return Promise.resolve(json({ preferred_currency: "CLP" }));
    if (path === "/api/v1/health") return Promise.resolve(json({ status: "healthy", api: "healthy", database: "healthy", version: "test" }));
    return Promise.reject(new Error(`Unexpected request ${path}`));
  });
  vi.stubGlobal("fetch", request);
  return request;
}
const paths = (request: ReturnType<typeof stubApi>) => request.mock.calls.map(([input]) => new URL(input as string).pathname);

afterEach(() => vi.unstubAllGlobals());

describe("Home as a guest", () => {
  test("invites sign-in, links to the public catalog and makes no private requests", async () => {
    const request = stubApi();
    render(<App initialEntries={["/"]} />);
    expect(await screen.findByText("TU BÓVEDA TCG")).toBeVisible();
    expect(screen.getByRole("heading", { level: 1, name: "Inicio" })).toHaveClass("pv-sr-only");
    expect(screen.getByRole("heading", { level: 2, name: "Tu colección, ordenada y valorizada" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Iniciar sesión" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Explorar Pokédex" })).toHaveAttribute("href", "/pokedex");
    expect(screen.getByRole("link", { name: "Explorar expansiones" })).toHaveAttribute("href", "/sets");
    const main = within(screen.getByRole("main"));
    expect(main.getByRole("link", { name: "Escanear carta" })).toHaveAttribute("href", "/scanner");
    expect(main.getByText("ESCÁNER")).toBeVisible();
    expect(main.getByText("Fotografía una carta y la reconocemos. Tú confirmas antes de guardar.")).toBeVisible();
    expect(screen.queryByText("Estado del sistema")).not.toBeInTheDocument();
    expect(paths(request).every((path) => path === "/api/v1/auth/me")).toBe(true);
  });

  test("shows only skeletons while the session is being restored and sends no private requests", () => {
    const request = stubApi({ pendingSession: true });
    render(<App initialEntries={["/"]} />);
    expect(screen.queryByText("TU BÓVEDA TCG")).not.toBeInTheDocument();
    const busy = screen.getByRole("main").querySelector("[aria-busy='true']");
    expect(busy).not.toBeNull();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(paths(request)).toEqual(["/api/v1/auth/me"]);
  });

  test("is fully available in English", async () => {
    stubApi();
    const user = userEvent.setup();
    render(<App initialEntries={["/"]} />);
    await user.click(await screen.findByRole("button", { name: "English" }));
    expect(screen.getByText("YOUR TCG VAULT")).toBeVisible();
    expect(screen.getByRole("heading", { level: 1, name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Scan card" })).toHaveAttribute("href", "/scanner");
    expect(screen.getByText("Photograph a card and we recognize it. You confirm before saving.")).toBeVisible();
  });
});

describe("Home signed in", () => {
  test("shows the scanner card and a system status footer that is closed by default", async () => {
    const request = stubApi({ signedIn: true });
    render(<App initialEntries={["/"]} />);
    const main = within(screen.getByRole("main"));
    expect(await main.findByRole("link", { name: "Escanear carta" })).toHaveAttribute("href", "/scanner");
    expect(main.queryByText("TU BÓVEDA TCG")).not.toBeInTheDocument();
    const summary = main.getByText("Estado del sistema");
    expect(summary.closest("details")).not.toHaveAttribute("open");
    expect(paths(request)).not.toContain("/api/v1/health");
    expect(main.queryByText("API disponible")).not.toBeInTheDocument();
  });

  test("opening the status footer checks the API once and closing it unmounts the check", async () => {
    const request = stubApi({ signedIn: true });
    const user = userEvent.setup();
    render(<App initialEntries={["/"]} />);
    const summary = await screen.findByText("Estado del sistema");
    await user.click(summary);
    expect(await screen.findByText("API disponible")).toBeVisible();
    expect(paths(request).filter((path) => path === "/api/v1/health")).toHaveLength(1);
    await user.click(summary);
    expect(screen.queryByText("API disponible")).not.toBeInTheDocument();
  });
});
