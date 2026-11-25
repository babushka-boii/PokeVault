import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "../app/App";
import { callsTo, stubDex } from "../test/dexFixtures";
import { stubMedia } from "../test/media";
import { jsonResponse as json } from "../test/tcgFixtures";

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.unstubAllGlobals());
const main = () => within(screen.getByRole("main"));
const tiles = () => document.querySelectorAll(".pv-tile");
const names = () => [...document.querySelectorAll(".pv-tile__name")].map((n) => n.textContent);
const open = async (url = "/pokedex") => { render(<App initialEntries={[url]} />); await main().findByRole("list"); };

describe("progress and tiles", () => {
  test("a signed-in collector sees the gold progress and lit or dimmed species", async () => {
    stubDex({ counts: { 25: 3, 4: 1 } });
    await open("/pokedex");
    await waitFor(() => expect(main().getByText("2 de 1025 especies con al menos una carta")).toBeVisible());
    expect(main().getByRole("progressbar", { name: "Avance de tu Pokédex" })).toHaveAttribute("aria-valuenow", "2");
    expect(main().getByRole("heading", { level: 1, name: "Tu Pokédex" })).toBeVisible();
    const charmander = main().getByRole("link", { name: "#004 Charmander, Fuego, 1 carta" });
    expect(charmander.closest("li")).toHaveAttribute("data-state", "owned");
    expect(charmander).toHaveTextContent("1 carta");
    expect(main().getByRole("link", { name: "#001 Bulbasaur, Planta, Veneno, sin cartas" }).closest("li")).toHaveAttribute("data-state", "missing");
    expect(charmander.getAttribute("href")).toBe("/pokemon/4?returnTo=%2Fpokedex");
  });

  test("a guest sees every species in colour, no labels, a sign-in hint and disabled owned filters", async () => {
    const request = stubDex({ guest: true });
    await open("/pokedex");
    expect(main().getByRole("link", { name: "Inicia sesión para ver qué especies tienes" })).toHaveAttribute("href", "/login");
    expect([...tiles()].every((tile) => tile.getAttribute("data-state") === "plain")).toBe(true);
    expect(main().getByRole("radio", { name: "Tengo" })).toBeDisabled();
    expect(main().getByRole("radio", { name: "Me faltan" })).toBeDisabled();
    expect(callsTo(request, "/api/v1/collection/species")).toHaveLength(0);
    expect(main().queryByRole("progressbar")).not.toBeInTheDocument();
  });

  test("makes one request for the index and one for ownership, and no UUID shows", async () => {
    const request = stubDex({ counts: { 25: 3 } });
    await open();
    await waitFor(() => expect(main().getByRole("progressbar")).toBeVisible());
    expect(callsTo(request, "/api/v1/pokemon/index")).toHaveLength(1);
    expect(callsTo(request, "/api/v1/collection/species")).toHaveLength(1);
    expect(screen.getByRole("main").textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
  });

  test("shows 60 tiles, then more by the button, and counts what is left", async () => {
    stubDex({ guest: true });
    await open("/pokedex");
    expect(tiles()).toHaveLength(60);
    const user = userEvent.setup();
    await user.click(main().getByRole("button", { name: "Ver más (91 restantes)" }));
    expect(tiles()).toHaveLength(120);
    await user.click(main().getByRole("button", { name: "Ver más (31 restantes)" }));
    expect(tiles()).toHaveLength(151);
    expect(main().queryByRole("button", { name: /Ver más/ })).not.toBeInTheDocument();
  });

  test("the animated sprite only runs for an owned, visible tile and never with reduced motion", async () => {
    const reports: ((entries: { isIntersecting: boolean }[]) => void)[] = [];
    vi.stubGlobal("IntersectionObserver", class { constructor(cb: (e: { isIntersecting: boolean }[]) => void) { reports.push(cb); } observe() {} disconnect() {} });
    stubDex({ counts: { 25: 1 } });
    await open("/pokedex");
    await waitFor(() => expect(main().getByRole("progressbar")).toBeVisible());
    const pikachuImage = () => main().getByRole("link", { name: /^#025/ }).querySelector("img")!;
    expect(pikachuImage().getAttribute("src")).toMatch(/pokemon\/25\.png$/);        // not visible yet: static
    await act(async () => { reports.forEach((cb) => cb([{ isIntersecting: true }])); });
    expect(pikachuImage().getAttribute("src")).toMatch(/black-white\/animated\/25\.gif$/);
    const dim = main().getByRole("link", { name: /^#001/ }).querySelector("img")!;
    expect(dim.getAttribute("src")).toMatch(/pokemon\/1\.png$/);                     // not owned: never animated
  });

  test("with reduced motion the sprite stays static", async () => {
    stubMedia({ reducedMotion: true });
    const reports: ((entries: { isIntersecting: boolean }[]) => void)[] = [];
    vi.stubGlobal("IntersectionObserver", class { constructor(cb: (e: { isIntersecting: boolean }[]) => void) { reports.push(cb); } observe() {} disconnect() {} });
    stubDex({ counts: { 25: 1 } });
    await open("/pokedex");
    await waitFor(() => expect(main().getByRole("progressbar")).toBeVisible());
    await act(async () => { reports.forEach((cb) => cb([{ isIntersecting: true }])); });
    expect(main().getByRole("link", { name: /^#025/ }).querySelector("img")!.getAttribute("src")).toMatch(/pokemon\/25\.png$/);
  });

  test("species above #649 have no animated sprite even when owned and visible", async () => {
    const reports: ((entries: { isIntersecting: boolean }[]) => void)[] = [];
    vi.stubGlobal("IntersectionObserver", class { constructor(cb: (e: { isIntersecting: boolean }[]) => void) { reports.push(cb); } observe() {} disconnect() {} });
    stubDex({ counts: { 650: 2 } });
    await open("/pokedex?gen=6");
    await waitFor(() => expect(main().getByRole("progressbar")).toBeVisible());
    await act(async () => { reports.forEach((cb) => cb([{ isIntersecting: true }])); });
    expect(main().getByRole("link", { name: /^#650/ }).querySelector("img")!.getAttribute("src")).toMatch(/pokemon\/650\.png$/);
  });
});

describe("generations and filters live in the URL", () => {
  test("tabs switch generation, with arrow keys, and the first generation is the default", async () => {
    stubDex({ guest: true });
    await open("/pokedex");
    expect(names()[0]).toBe("Bulbasaur");
    const user = userEvent.setup();
    const tabs = main().getAllByRole("tab");
    expect(tabs).toHaveLength(9);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    await user.click(tabs[1]);
    expect(names()[0]).toBe("Chikorita");
    expect(main().getByRole("list", { name: "Especies de Johto" })).toBeVisible();
    tabs[1].focus();
    await user.keyboard("{ArrowRight}");
    expect(main().getAllByRole("tab")[2]).toHaveFocus();
    expect(main().getAllByRole("tab")[2]).toHaveAttribute("aria-selected", "true");
  });

  test("an address with gen, type and show opens in that state; bad values become defaults", async () => {
    stubDex({ counts: { 4: 1, 6: 2, 152: 1 } });
    await open("/pokedex?gen=1&type=fire&show=owned");
    await waitFor(() => expect(names()).toEqual(["Charmander", "Charizard"]));
    expect(main().getByRole("button", { name: "Fuego" })).toHaveAttribute("aria-pressed", "true");
    expect(main().getByRole("radio", { name: "Tengo" })).toHaveAttribute("aria-checked", "true");
  });

  test("invalid values fall back to the defaults", async () => {
    stubDex({ guest: true });
    render(<App initialEntries={["/pokedex?gen=99&type=shadow&show=everything&q=" + "x".repeat(60)]} />);
    // the 40-character limit applies; nothing matches, so the page says so
    expect(await screen.findByText("No encontramos ese Pokémon")).toBeVisible();
    expect(main().getByRole("radio", { name: "Todas" })).toHaveAttribute("aria-checked", "true");
  });

  test("a type chip filters, toggles off, and combines with owned or missing", async () => {
    stubDex({ counts: { 4: 1 } });
    await open("/pokedex");
    await waitFor(() => expect(main().getByRole("progressbar")).toBeVisible());
    const user = userEvent.setup();
    await user.click(main().getByRole("button", { name: "Fuego" }));
    expect(names()).toEqual(["Charmander", "Charizard"]);
    await user.click(main().getByRole("radio", { name: "Me faltan" }));
    expect(names()).toEqual(["Charizard"]);
    await user.click(main().getByRole("radio", { name: "Tengo" }));
    expect(names()).toEqual(["Charmander"]);
    await user.click(main().getByRole("button", { name: "Fuego" }));
    expect(names()).toHaveLength(1);                                                   // still "Tengo" in generation I
  });

  test("search finds by name or number across generations and shows sprites and types", async () => {
    stubDex({ guest: true });
    await open("/pokedex");
    const user = userEvent.setup();
    await user.type(main().getByRole("searchbox", { name: "Buscar por nombre o número" }), "scrag");
    expect(names()).toEqual(["Scraggy"]);
    expect(main().getByRole("list", { name: "Resultados de la búsqueda" })).toBeVisible();
    expect(main().getByRole("link", { name: "#559 Scraggy, Siniestro, Lucha" })).toBeVisible();
    await user.clear(main().getByRole("searchbox"));
    await user.type(main().getByRole("searchbox"), "#25");
    expect(names()).toEqual(["Pikachu"]);
    await user.clear(main().getByRole("searchbox"));
    await user.type(main().getByRole("searchbox"), "zzzz");
    expect(await main().findByText("No encontramos ese Pokémon")).toBeVisible();
  });

  test("no matches for the filters explain it and clear them", async () => {
    stubDex({ counts: {} });
    render(<App initialEntries={["/pokedex?type=ice&show=owned"]} />);
    expect(await screen.findByText("Ningún Pokémon con esos filtros")).toBeVisible();
    await userEvent.setup().click(main().getByRole("button", { name: "Quitar filtros" }));
    await waitFor(() => expect(tiles()).toHaveLength(60));
  });

  test("tab counts show how many you own in each generation", async () => {
    stubDex({ counts: { 4: 1, 6: 1, 152: 1 } });
    await open("/pokedex");
    await waitFor(() => expect(main().getAllByRole("tab")[0]).toHaveTextContent("2/151"));
    expect(main().getAllByRole("tab")[1]).toHaveTextContent("1/100");
  });

  test("going back restores how many tiles were showing", async () => {
    stubDex({ guest: true });
    sessionStorage.setItem("pv-pokedex:", JSON.stringify({ count: 120, y: 0 }));
    await open("/pokedex");
    expect(tiles()).toHaveLength(120);
    const user = userEvent.setup();
    await user.click(main().getByRole("link", { name: /^#001/ }));          // leaving remembers the state
    expect(sessionStorage.getItem("pv-pokedex:")).toContain('"count":120');
  });
});

describe("states", () => {
  test("loading shows a skeleton grid with a status", async () => {
    stubDex({ override: (url) => (url.pathname === "/api/v1/pokemon/index" ? (new Promise<Response>(() => undefined) as never) : undefined) });
    render(<App initialEntries={["/pokedex"]} />);
    expect(await screen.findByText("Cargando Pokémon…")).toBeInTheDocument();
    expect(document.querySelector(".pv-dex__skeleton")).not.toBeNull();
  });

  test("an index failure is a calm note with a retry that works", async () => {
    let fail = true;
    const request = stubDex({ guest: true, override: (url) => (url.pathname === "/api/v1/pokemon/index" && fail ? json({}, 500) : undefined) });
    render(<App initialEntries={["/pokedex"]} />);
    const note = (await main().findByText("No pudimos cargar la Pokédex por ahora.")).closest(".pv-inline-error")!;
    expect(note).toHaveAttribute("role", "status");
    fail = false;
    await userEvent.setup().click(within(note as HTMLElement).getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(tiles()).toHaveLength(60));
    expect(callsTo(request, "/api/v1/pokemon/index")).toHaveLength(2);
  });

  test("an ownership failure leaves the grid usable, with the owned filters off", async () => {
    stubDex({ countsFail: true });
    await open("/pokedex");
    expect(await main().findByText("No pudimos revisar qué especies tienes por ahora.")).toBeVisible();
    expect(tiles()).toHaveLength(60);
    expect(main().getByRole("radio", { name: "Tengo" })).toBeDisabled();
  });

  test("cards not resolved yet are announced and re-checked", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      let pending = 3;
      const request = stubDex({ override: (url) => (url.pathname === "/api/v1/collection/species" ? json({ counts: { "25": 1 }, species_owned: 1, pending }) : undefined) });
      render(<App initialEntries={["/pokedex"]} />);
      for (let step = 0; step < 30 && !screen.queryByText("Revisando tus cartas… (3 por revisar)"); step++) await act(async () => { await vi.advanceTimersByTimeAsync(100); });
      expect(main().getByText("Revisando tus cartas… (3 por revisar)")).toBeVisible();
      pending = 0;
      await act(async () => { await vi.advanceTimersByTimeAsync(5100); });
      expect(callsTo(request, "/api/v1/collection/species")).toHaveLength(2);
      expect(main().queryByText(/por revisar/)).not.toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });

  test("is in English", async () => {
    stubDex({ guest: true });
    await open("/pokedex");
    await userEvent.setup().click(screen.getByRole("button", { name: "English" }));
    expect(await main().findByRole("heading", { level: 1, name: "Your Pokédex" })).toBeVisible();
    expect(main().getByRole("link", { name: "#004 Charmander, Fire" })).toBeVisible();
  });
});
