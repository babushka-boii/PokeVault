import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { withUnauthenticatedSession } from "../test/authSession";

import { App } from "./App";


beforeEach(() => {
  vi.stubGlobal("fetch", withUnauthenticatedSession((url) => Promise.resolve(new Response(JSON.stringify(url.endsWith("/health")
    ? { status: "healthy", api: "healthy", database: "healthy", version: "test" }
    : { results: [] })))));
});
afterEach(() => vi.unstubAllGlobals());

describe("PokéVault application shell", () => {
  test.each([
    ["/", "Inicio"],
    ["/boxes", "Cajas"],
    ["/pokedex", "Pokédex"],
    ["/profile", "Perfil"],
    ["/login", "Tu cuenta de PokéVault"],
  ])("renders direct route %s", (path, heading) => {
    render(<App initialEntries={[path]} />);

    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Navegación principal" }),
    ).toBeInTheDocument();
  });

  test("switches navigation to English and persists the locale", async () => {
    const user = userEvent.setup();
    render(<App initialEntries={["/"]} />);

    expect(screen.getByRole("link", { name: "Inicio" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cajas PC" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "English" }));

    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "PC Boxes" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Profile" })).toBeInTheDocument();
    expect(localStorage.getItem("pokevault.locale")).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });

  test("old personal-box links open the binders, and /boxes is the catalog only", async () => {
    const { unmount } = render(<App initialEntries={["/boxes?mode=personal"]} />);
    expect(await screen.findByRole("heading", { level: 1, name: "Mis carpetas" })).toBeInTheDocument();
    unmount();
    render(<App initialEntries={["/boxes"]} />);
    expect(screen.queryByRole("group", { name: "Cajas" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mis cajas" })).not.toBeInTheDocument();
  });

  test("falls back to Spanish for an unsupported persisted locale", () => {
    localStorage.setItem("pokevault.locale", "fr");

    render(<App initialEntries={["/"]} />);

    expect(screen.getByRole("link", { name: "Inicio" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("es");
  });
});
