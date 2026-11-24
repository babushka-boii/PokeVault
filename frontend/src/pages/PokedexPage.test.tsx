import { withUnauthenticatedSession } from "../test/authSession";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";

import { App } from "../app/App";

const pokemon = {
  national_dex_number: 1, name: "bulbasaur", types: ["grass", "poison"],
  sprite_url: "https://example.org/bulbasaur.png",
};

function respond(results: unknown = [pokemon]) {
  return new Response(JSON.stringify({ results }), { status: 200 });
}

afterEach(() => vi.unstubAllGlobals());

test("loads backend data and translates types without refetching", async () => {
  const request = vi.fn().mockResolvedValue(respond());
  vi.stubGlobal("fetch", withUnauthenticatedSession(request));
  const user = userEvent.setup();
  render(<App initialEntries={["/pokedex"]} />);
  expect(screen.getByRole("status")).toHaveTextContent("Cargando Pokémon");
  expect(await screen.findByRole("heading", { name: "Bulbasaur" })).toBeVisible();
  expect(screen.getByText("#001")).toBeVisible();
  expect(screen.getByText("Planta")).toBeVisible();
  expect(screen.getByText("Veneno")).toBeVisible();
  expect(request).toHaveBeenCalledWith("http://localhost:8000/api/v1/pokemon?offset=0&limit=30", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  await user.click(screen.getByRole("button", { name: "English" }));
  expect(screen.getByText("Grass")).toBeVisible();
  expect(screen.getByText("Poison")).toBeVisible();
  expect(request).toHaveBeenCalledTimes(1);
  fireEvent.error(screen.getByRole("img", { name: "Bulbasaur" }));
  expect(screen.getByText("Sprite unavailable")).toBeVisible();
});

test("shows sanitized error and supports keyboard retry", async () => {
  vi.stubGlobal("fetch", withUnauthenticatedSession(vi.fn().mockResolvedValueOnce(new Response("secret", { status: 503 })).mockResolvedValueOnce(respond())));
  const user = userEvent.setup();
  render(<App initialEntries={["/pokedex"]} />);
  expect(await screen.findByRole("alert")).not.toHaveTextContent("secret");
  const retry = screen.getByRole("button", { name: "Reintentar" });
  retry.focus();
  await user.keyboard("{Enter}");
  expect(await screen.findByRole("heading", { name: "Bulbasaur" })).toBeVisible();
});

test("shows an empty state", async () => {
  vi.stubGlobal("fetch", withUnauthenticatedSession(vi.fn().mockResolvedValue(respond([]))));
  render(<App initialEntries={["/pokedex"]} />);
  expect(await screen.findByText("No hay Pokémon disponibles.")).toBeVisible();
});

test.each([null, [{ ...pokemon, types: null }], [{ ...pokemon, sprite_url: "javascript:alert(1)" }]])("handles malformed data safely: %j", async (results) => {
  vi.stubGlobal("fetch", withUnauthenticatedSession(vi.fn().mockResolvedValue(respond(results))));
  render(<App initialEntries={["/pokedex"]} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar");
});

test("aborts the active request on navigation away", () => {
  let signal: AbortSignal | undefined;
  vi.stubGlobal("fetch", withUnauthenticatedSession(vi.fn((_url, options) => {
    signal = options.signal;
    return new Promise<Response>(() => undefined);
  })));
  const view = render(<App initialEntries={["/pokedex"]} />);
  view.unmount();
  expect(signal?.aborted).toBe(true);
});

// --- 8C.1: the whole National Pokédex is reachable (pagination and search) ---

const species = (number: number) => ({ national_dex_number: number, name: `mon${number}`, types: ["normal"], sprite_url: null });
const requested = (request: ReturnType<typeof vi.fn>) => request.mock.calls.map(([input]) => new URL(String(input)));
const pokemonCalls = (request: ReturnType<typeof vi.fn>) => requested(request).filter((url) => url.pathname === "/api/v1/pokemon");

function catalog(extra?: (url: URL) => Response | Promise<Response> | undefined) {
  const request = vi.fn(async (input: string) => {
    const url = new URL(input);
    const custom = extra?.(url); if (custom) return custom;
    if (url.pathname === "/api/v1/pokemon") {
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const count = Math.min(30, 1025 - offset);
      return respond(Array.from({ length: count }, (_, index) => species(offset + index + 1)));
    }
    return new Response("{}", { status: 404 });
  });
  vi.stubGlobal("fetch", withUnauthenticatedSession(request));
  return request;
}

test("requests 30 species per page by offset and links to the neighbouring pages", async () => {
  const request = catalog();
  const user = userEvent.setup();
  render(<App initialEntries={["/pokedex"]} />);
  const pager = await screen.findByRole("group", { name: "Páginas de la Pokédex" });
  expect(await screen.findByRole("heading", { name: "Mon30" })).toBeVisible();
  expect(within(pager).getByText("Página 1 de 35")).toBeVisible();
  expect(within(pager).queryByRole("link", { name: "Página anterior" })).not.toBeInTheDocument();
  expect(within(pager).getByRole("link", { name: "Página siguiente" })).toHaveAttribute("href", "/pokedex?page=2");
  await user.click(within(pager).getByRole("link", { name: "Página siguiente" }));
  expect(await screen.findByRole("heading", { name: "Mon31" })).toBeVisible();
  expect(pokemonCalls(request).map((url) => url.search)).toEqual(["?offset=0&limit=30", "?offset=30&limit=30"]);
  expect(within(screen.getByRole("group", { name: "Páginas de la Pokédex" })).getByRole("link", { name: "Página anterior" })).toHaveAttribute("href", "/pokedex");
});

test("the last page ends at #1025 and has no next page", async () => {
  const request = catalog();
  render(<App initialEntries={["/pokedex?page=35"]} />);
  expect(await screen.findByRole("heading", { name: "Mon1025" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Mon1021" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Mon1020" })).not.toBeInTheDocument();
  const pager = screen.getByRole("group", { name: "Páginas de la Pokédex" });
  expect(within(pager).getByText("Página 35 de 35")).toBeVisible();
  expect(within(pager).queryByRole("link", { name: "Página siguiente" })).not.toBeInTheDocument();
  expect(within(pager).getByRole("link", { name: "Página anterior" })).toHaveAttribute("href", "/pokedex?page=34");
  expect(pokemonCalls(request)[0].search).toBe("?offset=1020&limit=30");
});

test.each(["0", "36", "-1", "1.5", "abc", "", "99999999"])("an invalid page %j falls back to the first page", async (page) => {
  const request = catalog();
  render(<App initialEntries={[`/pokedex?page=${encodeURIComponent(page)}`]} />);
  expect(await screen.findByRole("heading", { name: "Mon1" })).toBeVisible();
  expect(pokemonCalls(request)[0].search).toBe("?offset=0&limit=30");
});

test("every species card keeps its TCG gallery action", async () => {
  catalog();
  render(<App initialEntries={["/pokedex?page=2"]} />);
  await screen.findByRole("heading", { name: "Mon31" });
  const links = screen.getAllByRole("link", { name: "Ver cartas TCG" });
  expect(links).toHaveLength(30);
  expect(links[0]).toHaveAttribute("href", "/pokemon/31/cards?returnTo=%2Fpokedex");
});

const matches = (...numbers: number[]) => new Response(JSON.stringify({ results: numbers.map((number) => ({ national_dex_number: number, name: `mon${number}` })) }));

test("searches by name or number after a pause and links each result to its gallery", async () => {
  const request = catalog((url) => url.pathname === "/api/v1/pokemon/search" ? matches(559, 560) : undefined);
  const user = userEvent.setup();
  render(<App initialEntries={["/pokedex"]} />);
  await screen.findByRole("heading", { name: "Mon1" });
  await user.type(screen.getByRole("searchbox", { name: "Buscar por nombre o número" }), "scr");
  const results = await screen.findByRole("list", { name: "Resultados de la búsqueda" });
  expect(within(results).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
    ["#559 Mon559", "/pokemon/559/cards?returnTo=%2Fpokedex"], ["#560 Mon560", "/pokemon/560/cards?returnTo=%2Fpokedex"],
  ]);
  const searches = requested(request).filter((url) => url.pathname === "/api/v1/pokemon/search");
  expect(searches).toHaveLength(1);  // typing "scr" sent one debounced request
  expect(searches[0].searchParams.get("q")).toBe("scr");
});

test("shows no results, a sanitized error with retry, and clears the results with the field", async () => {
  let attempt = 0;
  catalog((url) => {
    if (url.pathname !== "/api/v1/pokemon/search") return undefined;
    attempt += 1;
    return attempt === 1 ? matches() : attempt === 2 ? new Response("secret", { status: 503 }) : matches(25);
  });
  const user = userEvent.setup();
  render(<App initialEntries={["/pokedex"]} />);
  const field = await screen.findByRole("searchbox", { name: "Buscar por nombre o número" });
  await user.type(field, "zzz");
  expect(await screen.findByText("No se encontraron Pokémon.")).toBeVisible();
  await user.clear(field); await user.type(field, "pika");
  const alert = await screen.findByRole("alert");
  expect(alert).not.toHaveTextContent("secret");
  await user.click(within(alert.parentElement!).getByRole("button", { name: "Reintentar" }));
  expect(await screen.findByRole("link", { name: "#025 Mon25" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Limpiar búsqueda" }));
  expect(screen.queryByRole("list", { name: "Resultados de la búsqueda" })).not.toBeInTheDocument();
  expect(field).toHaveValue("");
});

test("ignores an obsolete search response", async () => {
  let finishFirst!: (response: Response) => void;
  let first = true;
  catalog((url) => {
    if (url.pathname !== "/api/v1/pokemon/search") return undefined;
    if (first) { first = false; return new Promise<Response>((resolve) => { finishFirst = resolve; }); }
    return matches(150);
  });
  const user = userEvent.setup();
  render(<App initialEntries={["/pokedex"]} />);
  const field = await screen.findByRole("searchbox", { name: "Buscar por nombre o número" });
  await user.type(field, "mew");
  await waitFor(() => expect(finishFirst).toBeTypeOf("function"));
  await user.clear(field); await user.type(field, "mewtwo");
  expect(await screen.findByRole("link", { name: "#150 Mon150" })).toBeVisible();
  await act(async () => finishFirst(matches(151)));
  expect(screen.queryByRole("link", { name: "#151 Mon151" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "#150 Mon150" })).toBeVisible();
});

test("searching does not reload the species grid and search text is limited to 40 characters", async () => {
  const request = catalog((url) => url.pathname === "/api/v1/pokemon/search" ? matches(25) : undefined);
  const user = userEvent.setup();
  render(<App initialEntries={["/pokedex"]} />);
  const field = await screen.findByRole("searchbox", { name: "Buscar por nombre o número" });
  expect(field).toHaveAttribute("maxlength", "40");
  await user.type(field, "25");
  await screen.findByRole("link", { name: "#025 Mon25" });
  expect(pokemonCalls(request)).toHaveLength(1);
});

test("the search and the pager are available in English", async () => {
  catalog();
  const user = userEvent.setup();
  render(<App initialEntries={["/pokedex"]} />);
  await screen.findByRole("heading", { name: "Mon1" });
  await user.click(screen.getByRole("button", { name: "English" }));
  expect(screen.getByRole("searchbox", { name: "Search by name or number" })).toBeVisible();
  expect(within(screen.getByRole("group", { name: "Pokédex pages" })).getByText("Page 1 of 35")).toBeVisible();
});
