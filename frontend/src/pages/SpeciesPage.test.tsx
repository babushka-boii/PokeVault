import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "../app/App";
import { callsTo, stubDex } from "../test/dexFixtures";
import { valuation } from "../test/priceFixtures";
import { jsonResponse as json, pikachuCard, speciesDetails, tcgPage } from "../test/tcgFixtures";

afterEach(() => vi.unstubAllGlobals());

const other = { ...pikachuCard, id: "base1-58", name: "Pikachu", set: { ...pikachuCard.set, id: "base1", name: "Base Set" } };
const owned = (extra: Record<string, unknown> = {}) => ({
  national_dex_number: 25, copies: 2, distinct_cards: 1, owned_card_ids: [pikachuCard.id], catalog_total: null, pending: 0,
  value: valuation({ copy_count: 2, priced_count: 2, unpriced_count: 0, unpriced_by_reason: {} }), ...extra,
});

function sheet(options: { guest?: boolean; collection?: Record<string, unknown>; starred?: string[]; write?: Response } = {}) {
  return stubDex({
    guest: options.guest,
    override: (url) => {
      const path = url.pathname;
      if (path === "/api/v1/pokemon/25") return json(speciesDetails());
      if (path === "/api/v1/pokemon/25/cards") return json(tcgPage([pikachuCard, other]));
      if (path === "/api/v1/collection/species/25") return json(owned(options.collection));
      if (path === "/api/v1/collection/species/25/cards") return json({ ...tcgPage([pikachuCard, other]), owned_ids: [pikachuCard.id] });
      if (path === "/api/v1/favorites/status") return json({ card_ids: options.starred ?? [] });
      if (path.startsWith("/api/v1/favorites/")) return options.write ?? json({ card_id: pikachuCard.id }, 200);
      return undefined;
    },
  });
}

test("the old gallery address opens the sheet and keeps its filters", async () => {
  const request = sheet();
  render(<App initialEntries={["/pokemon/25/cards?sort=id&show=owned"]} />);
  expect(await screen.findByRole("heading", { level: 1, name: "Pikachu" })).toBeVisible();
  await waitFor(() => expect(callsTo(request, "/api/v1/collection/species/25/cards").length).toBe(1));
  expect(String(callsTo(request, "/api/v1/collection/species/25/cards")[0][0])).toContain("sort=id&show=owned");
});

test.each(["0", "1026", "abc"])("an invalid number %s explains itself and fetches nothing", (value) => {
  const request = sheet();
  render(<App initialEntries={[`/pokemon/${value}`]} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Ese número no está en la Pokédex Nacional.");
  expect(callsTo(request, "/api/v1/pokemon/index")).toHaveLength(0);
});

test("shows the hero, neighbours with names and a single navigation landmark", async () => {
  sheet();
  render(<App initialEntries={["/pokemon/25"]} />);
  expect(await screen.findByRole("heading", { level: 1, name: "Pikachu" })).toBeVisible();
  expect(await screen.findByRole("link", { name: /anterior.*#024/i })).toBeVisible();
  expect(screen.getByRole("link", { name: /siguiente.*#026/i })).toBeVisible();
  expect(screen.getByRole("link", { name: /Volver a la Pokédex/ })).toHaveAttribute("href", "/pokedex");
  await screen.findByText(/Cartas de Pikachu/);
  expect(screen.getAllByRole("navigation")).toHaveLength(1);
  expect(screen.getByRole("group", { name: "Páginas de cartas" })).toBeVisible();
});

test("signed in: your collection, TENGO on owned cards, and one status request", async () => {
  const request = sheet();
  render(<App initialEntries={["/pokemon/25"]} />);
  const box = await screen.findByRole("region", { name: "Tu colección" });
  expect(await within(box).findByText(/2 copias/)).toBeVisible();
  expect(within(box).queryByText(/de \d+ en el catálogo/)).not.toBeInTheDocument();
  expect(await screen.findAllByText("TENGO")).toHaveLength(1);
  await waitFor(() => expect(callsTo(request, "/api/v1/favorites/status")).toHaveLength(1));
  expect(document.body.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
});

test("shows the catalog total only when the server verified it", async () => {
  sheet({ collection: { catalog_total: 30 } });
  render(<App initialEntries={["/pokemon/25"]} />);
  expect(await screen.findByText(/30/, { selector: "p" })).toBeVisible();
});

test("'Ver solo las que me faltan' puts show=missing in the request", async () => {
  const request = sheet();
  const user = userEvent.setup();
  render(<App initialEntries={["/pokemon/25"]} />);
  await user.click(await screen.findByRole("button", { name: "Ver solo las que me faltan" }));
  await waitFor(() => expect(callsTo(request, "/api/v1/collection/species/25/cards").some(([input]) => String(input).includes("show=missing"))).toBe(true));
  expect(screen.getByRole("radio", { name: "Me faltan" })).toHaveAttribute("aria-checked", "true");
});

test("the star flips at once and goes back with a notice when the server refuses", async () => {
  sheet({ write: json({}, 500) });
  const user = userEvent.setup();
  render(<App initialEntries={["/pokemon/25"]} />);
  const star = await screen.findByRole("button", { name: /Marcar Pikachu & Zekrom-GX como favorita/ });
  await waitFor(() => expect(star).toBeEnabled());
  await user.click(star);
  await waitFor(() => expect(screen.getByRole("button", { name: /Marcar Pikachu & Zekrom-GX como favorita/ })).toHaveAttribute("aria-pressed", "false"));
  expect(await screen.findByRole("status", { name: "" })).toBeDefined();
});

test("a guest sees the public cards, no TENGO and disabled owned filters", async () => {
  const request = sheet({ guest: true });
  render(<App initialEntries={["/pokemon/25"]} />);
  expect(await screen.findByRole("link", { name: /Inicia sesión para ver tus cartas de Pikachu/ })).toBeVisible();
  await screen.findAllByRole("heading", { level: 3, name: /Pikachu/ });
  expect(screen.queryByText("TENGO")).not.toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Tengo" })).toBeDisabled();
  expect(callsTo(request, "/api/v1/collection/species/25")).toHaveLength(0);
  expect(callsTo(request, "/api/v1/favorites/status")).toHaveLength(0);
});

test("a failing collection box is calm and retryable while the cards still show", async () => {
  stubDex({ override: (url) => {
    if (url.pathname === "/api/v1/pokemon/25") return json(speciesDetails());
    if (url.pathname === "/api/v1/collection/species/25") return json({}, 500);
    if (url.pathname === "/api/v1/collection/species/25/cards") return json({ ...tcgPage([pikachuCard]), owned_ids: [] });
    if (url.pathname === "/api/v1/favorites/status") return json({ card_ids: [] });
    return undefined;
  } });
  render(<App initialEntries={["/pokemon/25"]} />);
  const box = await screen.findByRole("region", { name: "Tu colección" });
  expect(await within(box).findByText("No pudimos revisar tus cartas de Pikachu por ahora.")).toBeVisible();
  expect(screen.getAllByRole("heading", { level: 3, name: /Pikachu/ }).length).toBeGreaterThan(0);
});

test("English labels", async () => {
  sheet();
  const user = userEvent.setup();
  render(<App initialEntries={["/pokemon/25"]} />);
  await screen.findByRole("heading", { level: 1, name: "Pikachu" });
  await user.click(screen.getByRole("button", { name: "English" }));
  expect(await screen.findByRole("region", { name: "Your collection" })).toBeVisible();
  expect(screen.getByRole("link", { name: /Back to the Pokédex/ })).toBeVisible();
});
