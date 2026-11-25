import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "../app/App";
import { callsTo, stubDex } from "../test/dexFixtures";
import { quote, rates, valuation } from "../test/priceFixtures";
import { jsonResponse as json, pikachuCard } from "../test/tcgFixtures";

afterEach(() => vi.unstubAllGlobals());
const BINDER = "10000000-0000-4000-8000-000000000001";
const stamp = "2026-11-24T12:00:00Z";
type Options = { team?: number[]; trainer?: string; points?: { day: string; total: string }[]; favorites?: unknown[]; putStatus?: number };
const putBody = (request: ReturnType<typeof stubDex>) => {
  const calls = request.mock.calls as unknown as [string, RequestInit | undefined][];
  const put = calls.find(([input, init]) => new URL(input).pathname === "/api/v1/me/profile" && init?.method === "PUT");
  return put ? JSON.parse(put[1]!.body as string) : undefined;
};
const day = (n: number) => `2026-11-${String(n).padStart(2, "0")}`;

function profileApp(options: Options = {}) {
  let saved = { trainer_id: options.trainer ?? "mateo", team: options.team ?? [559, 25, 6], member_since: "2026-11-02" };
  const request = stubDex({ override: (url) => {
    const path = url.pathname;
    if (path === "/api/v1/me/profile") {
      if (url.searchParams.has("__put")) return undefined;
      return json(saved);
    }
    if (path === "/api/v1/prices/collection") return json(valuation({ copy_count: 7, priced_count: 5, unpriced_count: 2, unpriced_by_reason: { variant_unknown: 2 } }));
    if (path === "/api/v1/collection/history") return json({ currency: "CLP", range: url.searchParams.get("range"), started_on: options.points?.[0]?.day ?? null, points: options.points ?? [], baseline: null });
    if (path === "/api/v1/favorites/cards") return json({ currency: "CLP", total: (options.favorites ?? []).length, results: options.favorites ?? [], rates });
    if (path === "/api/v1/prices/sets") return json({ currency: "CLP", rates, results: [
      { set_id: "me02.5", total: "1038", original_totals: { EUR: "0.83" }, copy_count: 5, priced_count: 5, pending_count: 0, stale_count: 0 },
      { set_id: "me05", total: "78", original_totals: { EUR: "0.06" }, copy_count: 2, priced_count: 2, pending_count: 0, stale_count: 0 }] });
    if (path === "/api/v1/prices/binders") return json({ currency: "CLP", rates, results: [{ binder_id: BINDER, total: "1116", original_totals: { EUR: "0.89" }, copy_count: 7, priced_count: 5, pending_count: 0, stale_count: 0 }] });
    if (path === "/api/v1/binders") return json({ total: 1, results: [{ id: BINDER, name: "Tesoros", display_order: 0, cover: "noir", stickers: [], copy_count: 7, page_count: 2, last_placed_at: null, created_at: stamp, updated_at: stamp }] });
    if (path.startsWith("/api/v1/cards/")) return json(pikachuCard);
    return undefined;
  } });
  const base = request.getMockImplementation()!;
  request.mockImplementation((input: string, init?: RequestInit) => {
    if (new URL(input).pathname === "/api/v1/me/profile" && init?.method === "PUT") {
      if (options.putStatus) return Promise.resolve(json({}, options.putStatus));
      saved = { ...saved, ...JSON.parse(init.body as string) };
      return Promise.resolve(json(saved));
    }
    return base(input);
  });
  return request;
}

test("the band names the trainer, since when, the team and its free slots", async () => {
  profileApp();
  render(<App initialEntries={["/profile"]} />);
  expect(await screen.findByRole("heading", { level: 1, name: "Ash Ketchum" })).toBeVisible();
  expect(await screen.findByText("Entrenador desde nov 2026")).toBeVisible();
  expect(screen.getByRole("img", { name: "Tu entrenador" })).toBeVisible();
  const team = screen.getByRole("list", { name: "Equipo" });
  const scraggy = (await within(team).findByText("Scraggy")).closest("li")!.querySelector("img")!;
  expect(scraggy).toHaveAttribute("src", expect.stringContaining("/559.png"));
  expect(scraggy).toHaveAttribute("width", "108");
  expect(within(team).getAllByRole("img", { name: "Espacio libre en el equipo" })).toHaveLength(2);
  expect(screen.getByRole("button", { name: "Cambiar entrenador" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Editar equipo (3/5)" })).toBeEnabled();
});

test("changing the trainer saves one of the four and closes the dialog", async () => {
  const request = profileApp();
  const user = userEvent.setup();
  render(<App initialEntries={["/profile"]} />);
  await user.click(await screen.findByRole("button", { name: "Cambiar entrenador" }));
  const group = screen.getByRole("radiogroup", { name: "Elige tu entrenador" });
  expect(within(group).getAllByRole("radio").map((radio) => radio.textContent)).toEqual(["Mateo", "Diego", "Valentina", "Camila"]);
  expect(within(group).getByRole("radio", { name: "Mateo" })).toBeChecked();
  await user.click(within(group).getByRole("radio", { name: "Diego" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(putBody(request)).toEqual({ trainer_id: "diego", team: [559, 25, 6] });
  expect(screen.getByRole("button", { name: "Cambiar entrenador" })).toHaveFocus();
});

test("a failed save keeps the dialog open with a message, and Escape closes it", async () => {
  profileApp({ putStatus: 500 });
  const user = userEvent.setup();
  render(<App initialEntries={["/profile"]} />);
  await user.click(await screen.findByRole("button", { name: "Cambiar entrenador" }));
  await user.click(screen.getByRole("radio", { name: "Camila" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos guardar los cambios.");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("the team editor removes, searches, adds up to five and saves", async () => {
  const request = profileApp({ team: [559, 6] });
  const user = userEvent.setup();
  render(<App initialEntries={["/profile"]} />);
  await user.click(await screen.findByRole("button", { name: "Editar equipo (2/5)" }));
  const dialog = screen.getByRole("dialog", { name: "Tu equipo" });
  await user.click(within(dialog).getByRole("button", { name: "Quitar a Charizard del equipo" }));
  await user.type(within(dialog).getByRole("searchbox", { name: "Buscar Pokémon" }), "pika");
  await user.click(within(dialog).getByRole("button", { name: "Agregar a Pikachu al equipo" }));
  await user.clear(within(dialog).getByRole("searchbox"));
  for (const name of ["Bulbasaur", "Charmander", "Chikorita"]) {
    await user.type(within(dialog).getByRole("searchbox"), name);
    await user.click(within(dialog).getByRole("button", { name: `Agregar a ${name} al equipo` }));
    await user.clear(within(dialog).getByRole("searchbox"));
  }
  expect(within(dialog).getByText("Tu equipo ya tiene 5 Pokémon.")).toBeVisible();
  await user.type(within(dialog).getByRole("searchbox"), "Chespin");
  expect(within(dialog).getByRole("button", { name: "Agregar a Chespin al equipo" })).toBeDisabled();
  await user.click(within(dialog).getByRole("button", { name: "Guardar" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(putBody(request).team).toEqual([559, 25, 1, 4, 152]);
  expect(screen.getByRole("button", { name: "Editar equipo (5/5)" })).toBeVisible();
});

test("the chart is empty with fewer than two records and draws the recorded days otherwise", async () => {
  profileApp({ points: [{ day: day(20), total: "1000" }] });
  render(<App initialEntries={["/profile"]} />);
  expect(await screen.findByText(/Aún no hay suficientes registros/)).toBeVisible();
  expect(screen.queryByRole("img", { name: /Gráfico del valor/ })).not.toBeInTheDocument();
  expect(screen.queryByText(/ejemplo/i)).not.toBeInTheDocument();
});

test("two records draw the area and the range chips ask for each range", async () => {
  const request = profileApp({ points: [{ day: day(20), total: "1000" }, { day: day(25), total: "1112" }] });
  const user = userEvent.setup();
  render(<App initialEntries={["/profile"]} />);
  expect(await screen.findByRole("img", { name: "Gráfico del valor de tu colección en 30 d" })).toBeVisible();
  expect(screen.getByRole("button", { name: "30 d" })).toHaveAttribute("aria-pressed", "true");
  await user.click(screen.getByRole("button", { name: "7 d" }));
  expect(await screen.findByRole("img", { name: "Gráfico del valor de tu colección en 7 d" })).toBeVisible();
  expect(callsTo(request, "/api/v1/collection/history").map(([input]) => new URL(input as string).searchParams.get("range"))).toEqual(["30d", "7d"]);
});

test("favourites show the card, its star and price, and open the card detail", async () => {
  profileApp({ favorites: [
    { card_id: "sm9-33", favorited_at: stamp, price: quote("1038", "CLP", "0.83"), reason: null },
    { card_id: "me05-044", favorited_at: stamp, price: null, reason: "no_market_data" },
  ] });
  render(<App initialEntries={["/profile"]} />);
  const section = (await screen.findByRole("heading", { name: "Tus favoritas" })).closest("section")!;
  const link = await within(section).findByRole("link", { name: /Pikachu & Zekrom-GX/ });
  expect(link).toHaveAttribute("href", `/cards/sm9-33?returnTo=${encodeURIComponent("/profile")}`);
  expect(within(link).getByText("$1.038")).toBeVisible();
  expect(within(link).getByRole("img", { name: "Favorita" })).toBeVisible();
  expect(within(section).getAllByText("sin precio")).toHaveLength(1);
  expect(within(section).getByRole("link", { name: "Ver todas →" })).toBeVisible();
  expect(within(screen.getByRole("list", { name: "Resumen de tu colección" })).getByText("favoritas").previousElementSibling).toHaveTextContent("2");
});

test("the breakdowns show value per binder and per expansion with share bars", async () => {
  profileApp();
  render(<App initialEntries={["/profile"]} />);
  const binders = (await screen.findByText("VALOR POR CARPETA")).closest("section")!;
  expect(await within(binders).findByText("Tesoros")).toBeVisible();
  expect(within(binders).getByText("$1.116")).toBeVisible();
  const sets = screen.getByText("VALOR POR EXPANSIÓN").closest("section")!;
  expect(await within(sets).findByText("ME02.5")).toBeVisible();
  expect(within(sets).getByText("$1.038")).toBeVisible();
  expect(sets.querySelectorAll(".pv-break__bar > div")[0]).toHaveStyle({ width: "93%" });
  expect(sets.querySelectorAll(".pv-break__bar > div")[1]).toHaveStyle({ width: "7%" });
});

test("the page never shows a UUID and keeps the touch targets as buttons or links", async () => {
  profileApp();
  render(<App initialEntries={["/profile"]} />);
  await screen.findByText("Tesoros");
  expect(document.body.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  expect(document.querySelector("[aria-label*='-4000-']")).toBeNull();
});

test("English labels", async () => {
  profileApp();
  const user = userEvent.setup();
  render(<App initialEntries={["/profile"]} />);
  await screen.findByRole("button", { name: "Editar equipo (3/5)" });
  await user.click(screen.getByRole("button", { name: "English" }));
  expect(await screen.findByText("Trainer since Nov 2026")).toBeVisible();
  expect(screen.getByRole("button", { name: "Change trainer" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Edit team (3/5)" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Your favourites" })).toBeVisible();
});
