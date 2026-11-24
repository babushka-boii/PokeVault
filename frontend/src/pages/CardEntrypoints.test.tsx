import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LocaleProvider } from "../i18n/LocaleProvider";
import { PokedexPage } from "./PokedexPage";

afterEach(() => vi.unstubAllGlobals());

function renderRoute(path: string) {
  const request = vi.fn().mockImplementation((url: string) => {
    const offset = Number(new URL(url).searchParams.get("offset"));
    return Promise.resolve(new Response(JSON.stringify({
      results: Array.from({ length: Math.min(30, 1025 - offset) }, (_, index) => ({
        national_dex_number: offset + index + 1, name: `pokemon-${offset + index + 1}`,
        types: ["grass"], sprite_url: null,
      })),
    })));
  });
  vi.stubGlobal("fetch", request);
  render(<LocaleProvider><MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/pokedex" element={<PokedexPage />} />
      <Route path="/pokemon/:number/cards" element={<h1>Test card catalog</h1>} />
    </Routes>
  </MemoryRouter></LocaleProvider>);
  return request;
}

test("Pokedex cards expose a localized TCG link without loading card data eagerly", async () => {
  const request = renderRoute("/pokedex");
  const user = userEvent.setup();
  const links = await screen.findAllByRole("link", { name: "Ver cartas TCG" });
  expect(links[0]).toHaveAttribute("href", "/pokemon/1/cards?returnTo=%2Fpokedex");
  expect(request).toHaveBeenCalledTimes(1);
  await user.click(links[0]);
  await waitFor(() => expect(screen.getByRole("heading", { name: "Test card catalog" })).toBeVisible());
});
