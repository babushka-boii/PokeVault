import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { App } from "../app/App";
import { stubMedia } from "../test/media";

const profile = { id: "4f6a3fab-002c-44e1-b3e8-0247badc013c", display_name: "Ash Ketchum", email: "ash@example.test", email_verified: true, picture_url: "https://lh3.googleusercontent.com/profile" };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

/** Guest by default; `signedIn` restores a session with a CLP preference. Everything else is empty. */
function stubApi({ signedIn = false } = {}) {
  const request = vi.fn((input: string, options?: RequestInit) => {
    const path = new URL(input).pathname;
    if (path === "/api/v1/auth/me") return Promise.resolve(signedIn ? json({ user: profile, csrf_token: "csrf" }) : json({}, 401));
    if (path === "/api/v1/me/settings") return Promise.resolve(json({ preferred_currency: options?.method === "PUT" ? JSON.parse(String(options.body)).preferred_currency : "CLP" }));
    if (path === "/api/v1/health") return Promise.resolve(json({ status: "healthy", api: "healthy", database: "healthy", version: "test" }));
    return Promise.resolve(json({ results: [], total: 0 }));
  });
  vi.stubGlobal("fetch", request);
  return request;
}

afterEach(() => vi.unstubAllGlobals());

describe("desktop shell", () => {
  test("shows one primary navigation in the approved order, a scan action and the account controls", () => {
    stubApi();
    render(<App initialEntries={["/pokedex"]} />);
    const navigation = screen.getByRole("navigation", { name: "Navegación principal" });
    expect(screen.getAllByRole("navigation")).toHaveLength(1);
    expect(within(navigation).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Inicio", "/"], ["Pokédex", "/pokedex"], ["Expansiones", "/sets"], ["Mis carpetas", "/binders"], ["Mi colección", "/collection"],
    ]);
    expect(within(navigation).getByRole("link", { name: "Pokédex" })).toHaveAttribute("aria-current", "page");
    expect(within(navigation).getByRole("link", { name: "Inicio" })).not.toHaveAttribute("aria-current");
    const banner = screen.getByRole("banner");
    expect(within(banner).getByRole("link", { name: "PokéVault — Inicio" })).toHaveAttribute("href", "/");
    expect(within(banner).getByRole("link", { name: "Escanear" })).toHaveAttribute("href", "/scanner");
    expect(within(banner).getByRole("link", { name: "Perfil" })).toHaveAttribute("href", "/profile");
    expect(within(banner).getByRole("group", { name: "Moneda de visualización" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Explorar" })).not.toBeInTheDocument();
  });

  test("marks nested collection routes as the active section", () => {
    stubApi();
    render(<App initialEntries={["/collection/7d4b4b1e-0000-4000-8000-000000000001"]} />);
    const navigation = screen.getByRole("navigation", { name: "Navegación principal" });
    expect(within(navigation).getByRole("link", { name: "Mi colección" })).toHaveAttribute("aria-current", "page");
  });

  test("switches the display currency through the shared preference", async () => {
    stubApi();
    const user = userEvent.setup();
    render(<App initialEntries={["/pokedex"]} />);
    const group = screen.getByRole("group", { name: "Moneda de visualización" });
    expect(within(group).getByRole("button", { name: "CLP" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(group).getByRole("button", { name: "USD" }));
    expect(within(group).getByRole("button", { name: "USD" })).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getByRole("button", { name: "CLP" })).toHaveAttribute("aria-pressed", "false");
    expect(localStorage.getItem("pokevault.currency")).toBe("USD");
  });

  test("switches every shell label to English and sets the document language", async () => {
    stubApi();
    const user = userEvent.setup();
    render(<App initialEntries={["/pokedex"]} />);
    await user.click(screen.getByRole("button", { name: "English" }));
    const navigation = screen.getByRole("navigation", { name: "Main navigation" });
    expect(within(navigation).getAllByRole("link").map((link) => link.textContent)).toEqual(["Home", "Pokédex", "Expansions", "My binders", "My collection"]);
    expect(screen.getByRole("link", { name: "Scan" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Profile" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Display currency" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Español" })).toHaveAttribute("lang", "es");
    expect(document.documentElement.lang).toBe("en");
  });

  test("shows the signed-in account picture inside the profile link without a referrer", async () => {
    stubApi({ signedIn: true });
    render(<App initialEntries={["/pokedex"]} />);
    const link = within(screen.getByRole("banner")).getByRole("link", { name: "Perfil" });
    const picture = await within(link).findByRole("presentation");
    expect(picture).toHaveAttribute("src", profile.picture_url);
    expect(picture).toHaveAttribute("referrerpolicy", "no-referrer");
  });

  test("offers a skip link as the first stop that moves focus to the main content", async () => {
    stubApi();
    const user = userEvent.setup();
    render(<App initialEntries={["/pokedex"]} />);
    await user.tab();
    const skip = screen.getByRole("link", { name: "Saltar al contenido" });
    expect(skip).toHaveFocus();
    await user.click(skip);
    expect(screen.getByRole("main")).toHaveFocus();
  });
});

describe("mobile shell", () => {
  test("replaces the header navigation with a bottom bar that centers the scan action", () => {
    stubMedia({ mobile: true });
    stubApi();
    render(<App initialEntries={["/binders"]} />);
    expect(screen.getAllByRole("navigation")).toHaveLength(1);
    const navigation = screen.getByRole("navigation", { name: "Navegación principal" });
    const links = within(navigation).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Inicio", "/"], ["Carpetas", "/binders"], ["Escanear", "/scanner"], ["Colección", "/collection"], ["Perfil", "/profile"],
    ]);
    expect(links[2].closest("li")).toHaveClass("pv-tabbar__scan");
    expect(within(navigation).getByRole("link", { name: "Carpetas" })).toHaveAttribute("aria-current", "page");
    // Pages may have their own <header> inside <main>; jsdom also exposes it as a banner. The shell's comes first.
    const banner = screen.getAllByRole("banner")[0];
    expect(banner).toHaveClass("pv-header--mobile");
    expect(within(banner).queryByRole("link", { name: "Pokédex" })).not.toBeInTheDocument();
    expect(within(banner).queryByRole("link", { name: "Perfil" })).not.toBeInTheDocument();
    expect(within(banner).getByRole("link", { name: "PokéVault — Inicio" })).toBeInTheDocument();
    expect(within(banner).getByRole("group", { name: "Moneda de visualización" })).toBeInTheDocument();
    expect(within(banner).getByRole("button", { name: "English" })).toBeInTheDocument();
  });

  test("the explore menu reaches Pokédex and expansions and closes with Escape or a choice", async () => {
    stubMedia({ mobile: true });
    stubApi();
    const user = userEvent.setup();
    render(<App initialEntries={["/"]} />);
    const explore = screen.getByRole("button", { name: "Explorar" });
    expect(explore).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Pokédex" })).not.toBeInTheDocument();
    await user.click(explore);
    expect(explore).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Expansiones" })).toHaveAttribute("href", "/sets");
    expect(screen.queryByRole("link", { name: "Cajas PC" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(explore).toHaveAttribute("aria-expanded", "false");
    expect(explore).toHaveFocus();
    await user.click(explore);
    await user.click(screen.getByRole("link", { name: "Pokédex" }));
    expect(explore).toHaveAttribute("aria-expanded", "false");
    expect(await screen.findByRole("heading", { level: 1, name: "Pokédex" })).toBeInTheDocument();
  });

  test("swaps layouts live when the viewport crosses the breakpoint", () => {
    const media = stubMedia({ mobile: false });
    stubApi();
    render(<App initialEntries={["/pokedex"]} />);
    expect(within(screen.getByRole("navigation")).getByRole("link", { name: "Expansiones" })).toBeInTheDocument();
    act(() => media.set({ mobile: true }));
    expect(screen.getAllByRole("navigation")).toHaveLength(1);
    expect(within(screen.getByRole("navigation")).getByRole("link", { name: "Carpetas" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Expansiones" })).not.toBeInTheDocument();
    act(() => media.set({ mobile: false }));
    expect(within(screen.getByRole("navigation")).getByRole("link", { name: "Expansiones" })).toBeInTheDocument();
  });
});
