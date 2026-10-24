import { withUnauthenticatedSession } from "../test/authSession";
import { fireEvent, render, screen } from "@testing-library/react";
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
  expect(request).toHaveBeenCalledWith("http://localhost:8000/api/v1/pokemon", expect.objectContaining({ signal: expect.any(AbortSignal) }));
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
