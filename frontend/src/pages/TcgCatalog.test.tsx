import { withUnauthenticatedSession } from "../test/authSession";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";

import { App } from "../app/App";
import { bulbasaurCard, jsonResponse, pikachuCard, scraggyCard, speciesDetails, tcgPage } from "../test/tcgFixtures";

afterEach(() => vi.unstubAllGlobals());

function serveGallery(results: unknown[] = [pikachuCard], options: Record<string, unknown> = {}) {
  const request = vi.fn((input: string) => Promise.resolve(
    input.includes("/cards?") ? jsonResponse(tcgPage(results, { ...options, page: Number(new URL(input).searchParams.get("page")) })) : jsonResponse(speciesDetails()),
  ));
  vi.stubGlobal("fetch", withUnauthenticatedSession(request));
  return request;
}

test("loads real card-shaped JSON with species context, full card preview, and content fallback", async () => {
  const request = serveGallery();
  render(<App initialEntries={["/pokemon/25/cards?returnTo=%2Fboxes%3Fbox%3D19%26pokemon%3D559%26wallpaper%3Docean"]} />);
  expect(screen.getByText("Cargando cartas…")).toBeVisible();
  expect(await screen.findByRole("heading", { name: "Pikachu & Zekrom-GX" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Pikachu" })).toBeVisible();
  expect(screen.getByText("Eléctrico")).toBeVisible();
  const artwork = screen.getByRole("img", { name: "Pikachu & Zekrom-GX" });
  expect(artwork).toHaveAttribute("src", "https://assets.tcgdex.net/en/sm/sm9/33/low.webp");
  expect(artwork).toHaveAttribute("loading", "lazy");
  expect(screen.getByText("Contenido de la carta disponible en inglés.")).toBeVisible();
  expect(screen.getByRole("link", { name: "Volver" })).toHaveAttribute("href", "/boxes?box=19&pokemon=559&wallpaper=ocean");
  expect(screen.getByText(/Catálogo inglés de TCGdex/)).toBeVisible();
  expect(request).toHaveBeenCalledWith("http://localhost:8000/api/v1/pokemon/25/cards?language=es&page=1&page_size=12&sort=name", expect.objectContaining({ signal: expect.any(AbortSignal) }));
});

test("keeps gallery available when independent species details fail", async () => {
  vi.stubGlobal("fetch", withUnauthenticatedSession(vi.fn((input: string) => Promise.resolve(
    input.includes("/cards?") ? jsonResponse(tcgPage()) : jsonResponse({ secret: "private" }, 503),
  ))));
  render(<App initialEntries={["/pokemon/25/cards"]} />);
  expect(await screen.findByRole("heading", { name: "Pikachu & Zekrom-GX" })).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar los detalles.");
  expect(screen.getByRole("button", { name: "Reintentar detalles" })).toBeEnabled();
});

test("applies expansion and sort, resets pagination, and preserves the full gallery link on detail return", async () => {
  const request = serveGallery([pikachuCard], { page: 3, has_more: true });
  const user = userEvent.setup();
  render(<App initialEntries={["/pokemon/25/cards?page=3&returnTo=%2Fboxes%3Fbox%3D1%26pokemon%3D25"]} />);
  await screen.findByRole("heading", { name: "Pikachu & Zekrom-GX" });
  expect(screen.getByRole("link", { name: "Página siguiente" })).toHaveAttribute("href", expect.stringContaining("page=4"));
  await user.click(screen.getByRole("button", { name: /Expansión/ }));
  await user.click(screen.getByRole("button", { name: "Team Up" }));
  await screen.findByRole("heading", { name: "Pikachu & Zekrom-GX" });
  await user.selectOptions(screen.getByRole("combobox", { name: "Ordenar por" }), "id");
  await waitFor(() => expect(request).toHaveBeenCalledWith("http://localhost:8000/api/v1/pokemon/25/cards?language=es&page=1&page_size=12&sort=id&set_id=sm9", expect.anything()));
  const cardLink = screen.getByRole("link", { name: /Pikachu & Zekrom-GX/ });
  const gallery = new URL(cardLink.getAttribute("href")!, "http://localhost").searchParams.get("returnTo");
  expect(gallery).toContain("sort=id");
  expect(gallery).toContain("set_id=sm9");
  expect(gallery).toContain("returnTo=%2Fboxes%3Fbox%3D1%26pokemon%3D25");
  request.mockImplementation((input: string) => Promise.resolve(input.includes("/api/v1/cards/") ? jsonResponse(pikachuCard) : input.includes("/cards?") ? jsonResponse(tcgPage()) : jsonResponse(speciesDetails())));
  await user.click(cardLink);
  expect(await screen.findByRole("heading", { level: 1, name: "Pikachu & Zekrom-GX" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Volver a la galería" })).toHaveAttribute("href", gallery);
});

test("renders empty cards, retryable sanitized failures, and successful retry", async () => {
  let attempt = 0;
  vi.stubGlobal("fetch", withUnauthenticatedSession(vi.fn((input: string) => Promise.resolve(
    input.includes("/cards?") ? ++attempt === 1 ? jsonResponse({ secret: "internal exception" }, 503) : jsonResponse(tcgPage([])) : jsonResponse(speciesDetails()),
  ))));
  const user = userEvent.setup();
  render(<App initialEntries={["/pokemon/25/cards"]} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar las cartas.");
  expect(screen.queryByText(/internal exception/)).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Reintentar cartas" }));
  expect(await screen.findByText("No hay cartas para estos filtros.")).toBeVisible();
});

test("provides missing artwork fallback and fetches new language without stale Spanish results", async () => {
  let finishSpanish: ((response: Response) => void) | undefined;
  vi.stubGlobal("fetch", withUnauthenticatedSession(vi.fn((input: string) => {
    if (!input.includes("/cards?")) return Promise.resolve(jsonResponse(speciesDetails(559)));
    if (input.includes("language=es")) return new Promise<Response>((resolve) => { finishSpanish = resolve; });
    return Promise.resolve(jsonResponse(tcgPage([scraggyCard])));
  })));
  const user = userEvent.setup();
  render(<App initialEntries={["/pokemon/559/cards"]} />);
  await user.click(screen.getByRole("button", { name: "English" }));
  expect(await screen.findByRole("heading", { name: "Scraggy", level: 2 })).toBeVisible();
  expect(screen.getByText("Card image unavailable")).toBeVisible();
  await act(async () => { finishSpanish?.(jsonResponse(tcgPage([{ ...scraggyCard, name: "Viejo" }]))); });
  expect(screen.queryByText("Viejo")).not.toBeInTheDocument();
  expect(screen.queryByText("Card content available in English.")).not.toBeInTheDocument();
});

test("renders detailed card fields from TCG content and full resolution artwork", async () => {
  vi.stubGlobal("fetch", withUnauthenticatedSession(vi.fn().mockResolvedValue(jsonResponse({ ...pikachuCard,
    abilities: [{ name: "TCG Ability", type: "Ability", effect: "Only the card's own effect." }],
    variants: [{ id: "first", type: "holo", subtype: "reverse", stamps: ["Promo"] }],
  }))));
  render(<App initialEntries={["/cards/sm9-33"]} />);
  expect(await screen.findByRole("heading", { level: 1, name: "Pikachu & Zekrom-GX" })).toBeVisible();
  expect(screen.getByRole("img", { name: "Pikachu & Zekrom-GX" })).toHaveAttribute("src", "https://assets.tcgdex.net/en/sm/sm9/33/high.webp");
  expect(screen.getByText("Mitsuhiro Arita")).toBeVisible();
  expect(screen.getByText("240")).toBeVisible();
  expect(screen.getByText("Lightning")).toBeVisible();
  expect(screen.getByRole("heading", { name: "Full Blitz" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "TCG Ability" })).toBeVisible();
  expect(screen.getByText("Only the card's own effect.")).toBeVisible();
  expect(screen.getByText(/Promo/)).toBeVisible();
  expect(screen.getByText(/Idiomas verificados en esta respuesta/)).toBeVisible();
  expect(screen.getByRole("link", { name: "Volver" })).toHaveAttribute("href", "/pokedex");
  for (let attempt = 0; attempt < 6; attempt += 1) fireEvent.error(screen.getByRole("img", { name: "Pikachu & Zekrom-GX" }));
  expect(screen.getByText("Imagen de carta no disponible")).toBeVisible();
});

test.each(["0", "1026", "-1", "abc", "1.5"])("rejects invalid species route %s without fetch", (number) => {
  const request = vi.fn(); vi.stubGlobal("fetch", withUnauthenticatedSession(request));
  render(<App initialEntries={[`/pokemon/${number}/cards`]} />);
  expect(screen.getByRole("alert")).toHaveTextContent("El número de Pokémon no es válido.");
  expect(request).not.toHaveBeenCalled();
});

test("allows dot identifiers and ignores external return destinations", async () => {
  const request = vi.fn().mockResolvedValue(jsonResponse({ ...bulbasaurCard, id: "sv03.5-001" }));
  vi.stubGlobal("fetch", withUnauthenticatedSession(request));
  render(<App initialEntries={["/cards/sv03.5-001?returnTo=https%3A%2F%2Fevil.example"]} />);
  expect(await screen.findByRole("heading", { level: 1, name: "Bulbasaur" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Volver" })).toHaveAttribute("href", "/pokedex");
  expect(request).toHaveBeenCalledWith("http://localhost:8000/api/v1/cards/sv03.5-001?language=es", expect.anything());
});

test("distinguishes missing card from transient failures", async () => {
  vi.stubGlobal("fetch", withUnauthenticatedSession(vi.fn().mockResolvedValue(jsonResponse({}, 404))));
  render(<App initialEntries={["/cards/base1-44"]} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("No se encontró esta carta.");
});

test.each([
  { ...pikachuCard, image_url: "javascript:alert(1)" },
  { ...pikachuCard, dex_ids: [0] },
  { ...pikachuCard, attacks: null },
])("rejects malformed card responses", async (card) => {
  serveGallery([card]);
  render(<App initialEntries={["/pokemon/25/cards"]} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar las cartas.");
});

test("bounds direct gallery pagination to the API limit and hides the next-page link", async () => {
  const request = serveGallery([pikachuCard], { has_more: true });
  render(<App initialEntries={["/pokemon/25/cards?page=999999"]} />);
  expect(await screen.findByRole("heading", { name: "Pikachu & Zekrom-GX" })).toBeVisible();
  expect(request).toHaveBeenCalledWith("http://localhost:8000/api/v1/pokemon/25/cards?language=es&page=500&page_size=12&sort=name", expect.anything());
  expect(screen.queryByRole("link", { name: "Página siguiente" })).not.toBeInTheDocument();
});
