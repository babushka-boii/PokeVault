import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { App } from "../app/App";
import { binderId, binderWorld, physical, pocketOf } from "../test/binderFixtures";
import { cardPrices, rates } from "../test/priceFixtures";
import { jsonResponse as json, pikachuCard } from "../test/tcgFixtures";

afterEach(() => vi.unstubAllGlobals());
const session = { user: { id: "ash", display_name: "Ash", email: null, email_verified: true, picture_url: null }, csrf_token: "csrf" };

/** The card detail page with a favourites server; `signedIn: false` is a guest. */
function cardPage({ signedIn = true, starred = false } = {}) {
  let favorite = starred; const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string, options?: RequestInit) => {
    const { pathname } = new URL(input); const method = options?.method ?? "GET";
    calls.push(`${method} ${pathname}`);
    if (pathname === "/api/v1/auth/me") return signedIn ? json(session) : json({}, 401);
    if (pathname === "/api/v1/me/settings") return json({ preferred_currency: "CLP" });
    if (pathname === `/api/v1/cards/${pikachuCard.id}`) return json(pikachuCard);
    if (pathname.startsWith("/api/v1/prices/cards/")) return json({ ...cardPrices("CLP"), card_id: pikachuCard.id, rates });
    if (pathname.startsWith("/api/v1/favorites/")) {
      if (method === "PUT") favorite = true; if (method === "DELETE") favorite = false;
      return json({ card_id: pikachuCard.id, favorite });
    }
    return json({}, 404);
  }));
  return { calls };
}

describe("on the card detail page", () => {
  test("a signed-in user stars and unstars the catalog card", async () => {
    const { calls } = cardPage();
    const user = userEvent.setup();
    render(<App initialEntries={[`/cards/${pikachuCard.id}`]} />);
    const star = await screen.findByRole("button", { name: "Favorita" });
    await waitFor(() => expect(star).toBeEnabled());
    expect(star).toHaveAttribute("aria-pressed", "false");
    // It sits with the card's own details, before adding a physical copy.
    const header = screen.getByRole("heading", { level: 1, name: pikachuCard.name }).closest("header")!;
    expect(header.parentElement!.contains(star)).toBe(true);
    await user.click(star);
    await waitFor(() => expect(star).toHaveAttribute("aria-pressed", "true"));
    expect(calls).toContain(`PUT /api/v1/favorites/${pikachuCard.id}`);
    await user.click(star);
    await waitFor(() => expect(star).toHaveAttribute("aria-pressed", "false"));
    expect(calls).toContain(`DELETE /api/v1/favorites/${pikachuCard.id}`);
  });

  test("an already starred card opens pressed", async () => {
    cardPage({ starred: true });
    render(<App initialEntries={[`/cards/${pikachuCard.id}`]} />);
    const star = await screen.findByRole("button", { name: "Favorita" });
    await waitFor(() => expect(star).toHaveAttribute("aria-pressed", "true"));
  });

  test("a guest sees an invitation to sign in and no favourites request is made", async () => {
    const { calls } = cardPage({ signedIn: false });
    render(<App initialEntries={[`/cards/${pikachuCard.id}`]} />);
    expect(await screen.findByRole("link", { name: "Inicia sesión para marcar favoritas" })).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("button", { name: "Favorita" })).not.toBeInTheDocument();
    expect(calls.some((call) => call.includes("/favorites/"))).toBe(false);
  });

  test("is in English", async () => {
    cardPage();
    const user = userEvent.setup();
    render(<App initialEntries={[`/cards/${pikachuCard.id}`]} />);
    await screen.findByRole("button", { name: "Favorita" });
    await user.click(screen.getByRole("button", { name: "English" }));
    expect(await screen.findByRole("button", { name: "Favourite" })).toBeInTheDocument();
  });
});

describe("in a pocket's menu", () => {
  test("stars the card of the copy in the pocket (not the copy), and the card detail agrees", async () => {
    const world = binderWorld({ binders: [{ name: "Tesoros", pockets: [pocketOf(1, 1, physical(0))] }] });
    const user = userEvent.setup();
    render(<App initialEntries={[`/binders/${binderId(1)}`]} />);
    await user.click(await within(await screen.findByRole("grid", { name: "Página 1" })).findByRole("button", { name: /^Página 1, bolsillo 1: Card 1/ }));
    const menu = await screen.findByRole("dialog", { name: "Card 1 · Expansion 1" });
    const star = await within(menu).findByRole("button", { name: "Favorita" });
    await waitFor(() => expect(star).toBeEnabled());
    await user.click(star);
    await waitFor(() => expect(star).toHaveAttribute("aria-pressed", "true"));
    expect(world.favorites).toEqual(new Set(["sv1-1"]));                       // the catalog card id, never the copy's UUID
    expect(world.calls.filter((call) => call.path.startsWith("/api/v1/favorites/")).map((call) => `${call.method} ${call.path}`))
      .toEqual(["GET /api/v1/favorites/sv1-1", "PUT /api/v1/favorites/sv1-1"]);
    expect(menu.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
    // The star is reachable by keyboard as part of the menu.
    star.focus();
    expect(star).toHaveFocus();
  });

  test("an empty pocket has no star", async () => {
    binderWorld({ binders: [{ name: "Tesoros", pockets: [] }] });
    const user = userEvent.setup();
    render(<App initialEntries={[`/binders/${binderId(1)}`]} />);
    await user.click(await within(await screen.findByRole("grid", { name: "Página 1" })).findByRole("button", { name: "Página 1, bolsillo 1: vacío" }));
    await screen.findByRole("dialog");
    expect(screen.queryByRole("button", { name: "Favorita" })).not.toBeInTheDocument();
  });
});
