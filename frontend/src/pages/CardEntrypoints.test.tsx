import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { LocaleProvider } from "../i18n/LocaleProvider";
import { BoxesPage } from "./BoxesPage";
import { PokedexPage } from "./PokedexPage";
import { withPokemonDetails } from "../test/pokemonDetails";

afterEach(() => vi.unstubAllGlobals());

function HistoryProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return <>
    <output data-testid="location">{location.pathname}{location.search}</output>
    <button onClick={() => navigate(-1)}>Test history back</button>
  </>;
}

function renderRoute(path: string) {
  const request = vi.fn().mockImplementation((url: string) => {
    if (new URL(url).pathname.endsWith("/pokemon/search")) return Promise.resolve(new Response(JSON.stringify({
      results: [{ national_dex_number: 559, name: "pokemon-559" }],
    })));
    const offset = Number(new URL(url).searchParams.get("offset"));
    return Promise.resolve(new Response(JSON.stringify({
      results: Array.from({ length: Math.min(30, 1025 - offset) }, (_, index) => ({
        national_dex_number: offset + index + 1, name: `pokemon-${offset + index + 1}`,
        types: ["grass"], sprite_url: null,
      })),
    })));
  });
  vi.stubGlobal("fetch", withPokemonDetails(request));
  render(<LocaleProvider><MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/boxes" element={<BoxesPage />} />
      <Route path="/pokedex" element={<PokedexPage />} />
      <Route path="/pokemon/:number/cards" element={<h1>Test card catalog</h1>} />
    </Routes>
    <HistoryProbe />
  </MemoryRouter></LocaleProvider>);
  return request;
}

test("restores box, selected species and wallpaper from the URL and exposes a separate TCG action", async () => {
  renderRoute("/boxes?box=19&pokemon=559&wallpaper=ocean");
  const selected = await screen.findByRole("button", { name: "#559 Pokemon-559" });
  expect(screen.getByRole("heading", { name: "Caja 19" })).toBeVisible();
  expect(selected.closest('[role="gridcell"]')).toHaveAttribute("aria-selected", "true");
  await waitFor(() => expect(selected).toHaveFocus());
  expect(screen.getByRole("region", { name: "Caja 19" })).toHaveClass("pc-wallpaper--ocean");
  const link = screen.getByRole("link", { name: "Ver cartas TCG" });
  const target = new URL(link.getAttribute("href")!, "https://pokevault.test");
  expect(target.pathname).toBe("/pokemon/559/cards");
  expect(target.searchParams.get("returnTo")).toBe("/boxes?box=19&pokemon=559&wallpaper=ocean");
});

test("slot clicks select without opening cards and browser back restores the replaced box entry", async () => {
  renderRoute("/boxes?box=19&pokemon=559&wallpaper=ocean");
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "#560 Pokemon-560" }));
  expect(screen.getByTestId("location")).toHaveTextContent("/boxes?box=19&pokemon=560&wallpaper=ocean");
  expect(screen.queryByRole("heading", { name: "Test card catalog" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("link", { name: "Ver cartas TCG" }));
  expect(screen.getByRole("heading", { name: "Test card catalog" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Test history back" }));
  const restored = await screen.findByRole("button", { name: "#560 Pokemon-560" });
  expect(restored.closest('[role="gridcell"]')).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("region", { name: "Caja 19" })).toHaveClass("pc-wallpaper--ocean");
});

test("box changes replace box and selection together while preserving the wallpaper", async () => {
  renderRoute("/boxes?box=19&pokemon=559&wallpaper=night");
  const user = userEvent.setup();
  await screen.findByRole("button", { name: "#559 Pokemon-559" });
  await user.click(screen.getByRole("button", { name: "Caja siguiente" }));
  expect(await screen.findByRole("button", { name: "#571 Pokemon-571" })).toBeVisible();
  expect(screen.getByTestId("location")).toHaveTextContent("/boxes?box=20&pokemon=571&wallpaper=night");
  await user.click(screen.getByRole("button", { name: "Bosque" }));
  expect(screen.getByTestId("location")).toHaveTextContent("/boxes?box=20&pokemon=571&wallpaper=forest");
});

test("search arrival focuses the selected species after its URL transition and box load", async () => {
  renderRoute("/boxes");
  const user = userEvent.setup();
  await screen.findByRole("button", { name: "#001 Pokemon-1" });
  await user.click(screen.getByRole("button", { name: "Buscar Pokémon" }));
  await user.type(screen.getByRole("combobox"), "559");
  await screen.findByRole("option", { name: "#559 Pokemon-559" });
  await user.keyboard("{ArrowDown}{Enter}");
  const selected = await screen.findByRole("button", { name: "#559 Pokemon-559" });
  await waitFor(() => expect(selected).toHaveFocus());
});

test.each([
  ["box=99&pokemon=1.2&wallpaper=invalid", "Caja 01", "#001 Pokemon-1", "classic", "box=1&pokemon=1&wallpaper=classic", 30],
  ["box=19&pokemon=25&wallpaper=night", "Caja 19", "#541 Pokemon-541", "night", "box=19&pokemon=541&wallpaper=night", 30],
  ["box=35&pokemon=1025&wallpaper=forest", "Caja 35", "#1025 Pokemon-1025", "forest", "box=35&pokemon=1025&wallpaper=forest", 5],
])("validates box query state %s", async (query, box, selected, wallpaper, restoredQuery, count) => {
  renderRoute(`/boxes?${query}`);
  const slot = await screen.findByRole("button", { name: selected });
  expect(slot.closest('[role="gridcell"]')).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("region", { name: box })).toHaveClass(`pc-wallpaper--${wallpaper}`);
  const grid = within(screen.getByRole("grid"));
  expect(grid.getAllByRole("gridcell")).toHaveLength(30);
  expect(grid.getAllByRole("button")).toHaveLength(count);
  const target = new URL(screen.getByRole("link", { name: "Ver cartas TCG" }).getAttribute("href")!, "https://pokevault.test");
  expect(target.searchParams.get("returnTo")).toBe(`/boxes?${restoredQuery}`);
});

test("Pokedex cards expose a localized TCG link without loading card data eagerly", async () => {
  const request = renderRoute("/pokedex");
  const user = userEvent.setup();
  const links = await screen.findAllByRole("link", { name: "Ver cartas TCG" });
  expect(links[0]).toHaveAttribute("href", "/pokemon/1/cards?returnTo=%2Fpokedex");
  expect(request).toHaveBeenCalledTimes(1);
  await user.click(links[0]);
  await waitFor(() => expect(screen.getByRole("heading", { name: "Test card catalog" })).toBeVisible());
});
