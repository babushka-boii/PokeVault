import { withUnauthenticatedSession } from "../test/authSession";
import { withPokemonDetails } from "../test/pokemonDetails";
import { act, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "../app/App";

const entry = (id: number) => ({ national_dex_number: id, name: `pokemon-${id}`, types: ["grass"], sprite_url: null });
const response = (start = 1, count = 30) => new Response(JSON.stringify({ results: Array.from({ length: count }, (_, i) => entry(start + i)) }));
afterEach(() => vi.unstubAllGlobals());

test("renders 30 slots, selects with keyboard, switches boxes and translates", async () => {
  const request = vi.fn().mockImplementation((url: string) => Promise.resolve(response(url.includes("offset=30") ? 31 : 1)));
  vi.stubGlobal("fetch", withUnauthenticatedSession(withPokemonDetails(request)));
  const user = userEvent.setup();
  render(<App initialEntries={["/boxes"]} />);
  expect(screen.getByRole("status")).toBeVisible();
  const grid = await screen.findByRole("grid");
  await screen.findByRole("button", { name: /#001/ });
  expect(within(grid).getAllByRole("gridcell")).toHaveLength(30);
  expect(screen.getByRole("button", { name: "Caja anterior" })).toBeDisabled();
  const first = within(grid).getByRole("button", { name: /#001/ });
  first.focus();
  await user.keyboard("{ArrowDown}");
  expect(screen.getByRole("heading", { name: "Pokemon-7" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Caja siguiente" }));
  expect(await screen.findByRole("heading", { name: "Pokemon-31" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Caja anterior" }));
  expect(await screen.findByRole("heading", { name: "Pokemon-1" })).toBeVisible();
  expect(request).toHaveBeenCalledTimes(2);
  await user.click(screen.getByRole("button", { name: "English" }));
  expect(screen.getByText("Catalog preview · No owned cards")).toBeVisible();
});

test("retries failures and shows empty slots", async () => {
  vi.stubGlobal("fetch", withUnauthenticatedSession(vi.fn().mockRejectedValueOnce(new Error("private")).mockResolvedValueOnce(response(1, 0))));
  const user = userEvent.setup();
  render(<App initialEntries={["/boxes"]} />);
  expect(await screen.findByRole("alert")).not.toHaveTextContent("private");
  await user.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(await screen.findByText("No hay Pokémon disponibles.")).toBeVisible();
  expect(screen.getAllByRole("gridcell")).toHaveLength(30);
});

test("persists sound preferences and handles unsupported audio", async () => {
  vi.stubGlobal("AudioContext", undefined);
  vi.stubGlobal("fetch", withUnauthenticatedSession(withPokemonDetails(vi.fn().mockResolvedValue(response()))));
  const user = userEvent.setup();
  render(<App initialEntries={["/boxes"]} />);
  const toggle = screen.getByRole("checkbox", { name: "Sonido" });
  expect(toggle).not.toBeChecked();
  await user.click(toggle);
  expect(toggle).toBeChecked();
  expect(JSON.parse(localStorage.getItem("pokevault.audio")!).enabled).toBe(true);
  const volume = screen.getByRole("slider", { name: "Volumen" });
  expect(volume).toHaveValue("15");
  fireEvent.change(volume, { target: { value: "25" } });
  expect(JSON.parse(localStorage.getItem("pokevault.audio")!).volume).toBe(.25);
  await user.click(await screen.findByRole("button", { name: /#002/ }));
  expect(screen.getByRole("heading", { name: "Pokemon-2" })).toBeVisible();
  await waitFor(() => expect(screen.getByText("Audio no disponible en este navegador.")).toBeVisible());
});

test("late responses cannot replace the current box", async () => {
  let resolveFirst!: (value: Response) => void;
  vi.stubGlobal("fetch", withUnauthenticatedSession(withPokemonDetails(vi.fn().mockImplementation((url: string) => url.includes("offset=0&")
    ? new Promise<Response>((resolve) => { resolveFirst = resolve; }) : Promise.resolve(response(31))))));
  const user = userEvent.setup();
  render(<App initialEntries={["/boxes"]} />);
  await user.click(screen.getByRole("button", { name: "Caja siguiente" }));
  expect(await screen.findByRole("heading", { name: "Pokemon-31" })).toBeVisible();
  await act(async () => { resolveFirst(response()); });
  await waitFor(() => expect(screen.getByRole("heading", { name: "Pokemon-31" })).toBeVisible());
  expect(screen.queryByRole("heading", { name: "Pokemon-1" })).not.toBeInTheDocument();
});

test("final box has five species and navigation ends there", async () => {
  vi.stubGlobal("fetch", withUnauthenticatedSession(withPokemonDetails(vi.fn().mockImplementation((url: string) => {
    const offset = Number(new URL(url).searchParams.get("offset"));
    return Promise.resolve(response(offset + 1, Math.min(30, 1025 - offset)));
  }))));
  const user = userEvent.setup();
  render(<App initialEntries={["/boxes"]} />);
  for (let i = 0; i < 34; i++) await user.click(screen.getByRole("button", { name: "Caja siguiente" }));
  await screen.findByRole("button", { name: /#1021/ });
  expect(screen.getByRole("button", { name: "Caja siguiente" })).toBeDisabled();
  expect(within(screen.getByRole("grid")).getAllByRole("button")).toHaveLength(5);
  expect(within(screen.getByRole("grid")).getAllByRole("gridcell")).toHaveLength(30);
});

test("menu icon mode changes without resetting selection, reloading catalog or playing audio", async () => {
  const request = vi.fn().mockResolvedValue(response());
  vi.stubGlobal("fetch", withUnauthenticatedSession(withPokemonDetails(request)));
  const audio = vi.fn();
  vi.stubGlobal("AudioContext", audio);
  const user = userEvent.setup();
  render(<App initialEntries={["/boxes"]} />);
  const first = await screen.findByRole("button", { name: /#001/ });
  expect(first.querySelector('img')?.getAttribute('src')).toContain('/generation-v/icons/1.png');
  expect(screen.getByRole('button', { name: 'Clásico' })).toHaveAttribute('aria-pressed', 'true');
  await user.click(screen.getByRole('button', { name: /#002/ }));
  await user.click(screen.getByRole('checkbox', { name: 'Sonido' }));
  await user.click(screen.getByRole('radio', { name: 'Animados' }));
  expect(first.querySelector('img')?.getAttribute('src')).toContain('/generation-v/icons/animated/1.png');
  expect(audio).not.toHaveBeenCalled();
  const animatedNode = first.querySelector('img');
  await user.click(screen.getByRole('button', { name: /#003/ }));
  // A different selection does not replace unchanged APNG nodes.
  expect(first.querySelector('img')).toBe(animatedNode);
  await user.click(screen.getByRole('radio', { name: 'Estáticos' }));
  expect(screen.getByRole('heading', { name: 'Pokemon-3' })).toBeVisible();
  expect(first.querySelector('img')?.getAttribute('src')).toContain('/generation-v/icons/1.png');
  expect(request).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem('pokevault.spriteMode')).toBe('static');
});
