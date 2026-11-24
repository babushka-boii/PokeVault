import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { App } from "../app/App";
import { binder, callsTo, homeCards, homeValuation, physicalCopy, pocketAt, ratesDown, stubHome, userA, userB } from "../test/homeFixtures";
import { stubMedia } from "../test/media";
import { copyId, noRates, valuation } from "../test/priceFixtures";
import { jsonResponse as json } from "../test/tcgFixtures";

afterEach(() => vi.unstubAllGlobals());
const main = () => within(screen.getByRole("main"));

describe("value hero", () => {
  test("shows the total, counts, the variant shortcut, the reference note and the attribution", async () => {
    stubHome();
    render(<App initialEntries={["/"]} />);
    expect(await main().findByText("VALOR DE TU COLECCIÓN")).toBeVisible();
    const hero = within(screen.getByRole("region", { name: "VALOR DE TU COLECCIÓN" }));
    expect(await hero.findByText(/1\.112/)).toBeVisible();
    expect(hero.getByText("5 copias")).toBeVisible();
    expect(hero.getByText("3 con precio")).toBeVisible();
    expect(hero.getByRole("link", { name: "2 sin variante · indicar" })).toHaveAttribute("href", "/collection?variant=unknown");
    expect(hero.getByText(/Precio de referencia del mercado/)).toBeVisible();
    const attribution = hero.getByRole("link", { name: "Rates By Exchange Rate API" });
    expect(attribution).toHaveAttribute("href", "https://www.exchangerate-api.com");
    expect(attribution).toHaveAttribute("target", "_blank");
    expect(attribution).toHaveAttribute("rel", "noopener noreferrer");
  });

  test("uses the singular for one copy and hides the variant chip when every copy has a variant", async () => {
    stubHome({ valuation: homeValuation({ copy_count: 1, priced_count: 1, unpriced_count: 0, unpriced_by_reason: {} }) });
    render(<App initialEntries={["/"]} />);
    expect(await main().findByText("1 copia")).toBeVisible();
    expect(main().queryByText(/sin variante/)).not.toBeInTheDocument();
  });

  test("asks for the selected display currency", async () => {
    const request = stubHome();
    const user = userEvent.setup();
    render(<App initialEntries={["/"]} />);
    await main().findByText(/1\.112/);
    await user.click(within(screen.getByRole("group", { name: "Moneda de visualización" })).getByRole("button", { name: "USD" }));
    await waitFor(() => expect(callsTo(request, "/api/v1/prices/collection").some(([input]) => new URL(input as string).searchParams.get("currency") === "USD")).toBe(true));
  });

  test("falls back to source-currency totals without exchange rates and omits the attribution", async () => {
    stubHome({ valuation: homeValuation({ ...ratesDown, original_totals: { EUR: "0.89" }, priced_count: 3 }) });
    render(<App initialEntries={["/"]} />);
    const hero = within(await screen.findByRole("region", { name: "VALOR DE TU COLECCIÓN" }));
    expect(await hero.findByText(/0,89/)).toBeVisible();
    expect(hero.getByText("Conversión no disponible: se muestra el precio original.")).toBeVisible();
    expect(hero.queryByRole("link", { name: "Rates By Exchange Rate API" })).not.toBeInTheDocument();
    expect(main().getByText("Aún no hay copias con precio para mostrar.")).toBeVisible();
  });

  test("offers a retry for pending prices", async () => {
    const request = stubHome({ valuation: homeValuation({ pending_count: 2 }) });
    const user = userEvent.setup();
    render(<App initialEntries={["/"]} />);
    await user.click(await screen.findByRole("button", { name: "2 precios pendientes · reintentar" }));
    await waitFor(() => expect(callsTo(request, "/api/v1/prices/collection")).toHaveLength(2));
    expect(callsTo(request, "/api/v1/binders")).toHaveLength(1);
  });

  test("shows a skeleton with a status text while loading, never a spinner", async () => {
    stubHome({ valuation: () => new Promise<Response>(() => undefined) });
    render(<App initialEntries={["/"]} />);
    const status = await screen.findByText("Cargando valor…");
    expect(status.parentElement).toHaveAttribute("aria-busy", "true");
    expect(within(status.parentElement!).queryByRole("progressbar")).not.toBeInTheDocument();
  });
});

describe("most valuable cards", () => {
  test("lists the top five in price order with names, prices and copy links", async () => {
    stubHome();
    render(<App initialEntries={["/"]} />);
    const top = await screen.findByRole("region", { name: "Tus cartas más valiosas" });
    const links = await within(top).findAllByRole("link", { name: /^Card \d/ });
    expect(links.map((link) => link.getAttribute("href"))).toEqual([0, 1, 2, 3, 4].map((index) => `/collection/${copyId(100 + index)}`));
    expect(links.map((link) => link.textContent)).toEqual(["Card 1", "Card 2", "Card 3", "Card 4", "Card 5"]);
    expect(within(top).getAllByText(/Holográfica/)).toHaveLength(5);
    expect(within(top).getByRole("link", { name: "Ver mi colección" })).toHaveAttribute("href", "/collection");
  });

  test("drops card tilt and glare under reduced motion", async () => {
    stubMedia({ reducedMotion: true });
    stubHome();
    render(<App initialEntries={["/"]} />);
    const top = await screen.findByRole("region", { name: "Tus cartas más valiosas" });
    await within(top).findAllByRole("link", { name: /^Card \d/ });
    expect(within(top).queryByRole("button", { name: "Inclinar carta" })).not.toBeInTheDocument();
    expect(top.querySelector(".tcg-card-glare")).toBeNull();
  });
});

describe("Mis carpetas", () => {
  test("previews the page of the latest placement in the most recent binder", async () => {
    stubHome({
      unassigned: 3,
      binders: [binder(1, "Kanto", { last_placed_at: "2026-11-01T10:00:00Z" }), binder(2, "Tesoros", { last_placed_at: "2026-11-20T10:00:00Z" })],
      pockets: [pocketAt(1, 1, physicalCopy(0), "2026-11-10T10:00:00Z"), pocketAt(2, 5, physicalCopy(1), "2026-11-20T10:00:00Z")],
    });
    render(<App initialEntries={["/"]} />);
    const section = await screen.findByRole("region", { name: "Mis carpetas" });
    const page = await within(section).findByRole("list", { name: "Vista previa de Tesoros, página 2" });
    expect(within(page).getAllByRole("listitem")).toHaveLength(9);
    expect(await within(page).findByText("Card 2 · Expansion 2")).toBeVisible();
    expect(within(section).getByRole("link", { name: "Abrir carpeta" })).toHaveAttribute("href", `/binders/${copyId(2)}?page=2`);
    expect(within(section).getByRole("link", { name: "3 cartas sin carpeta · guardar" })).toHaveAttribute("href", `/binders/${copyId(2)}?page=2`);
    expect(within(section).getByRole("link", { name: "+ Nueva carpeta" })).toHaveAttribute("href", "/binders");
  });

  test("never shows or announces a copy UUID, never writes, and hides the tray link when empty", async () => {
    const request = stubHome({ unassigned: 0 });
    render(<App initialEntries={["/"]} />);
    const section = await screen.findByRole("region", { name: "Mis carpetas" });
    await within(section).findByText("Card 1 · Expansion 1");
    const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    expect(section.textContent).not.toMatch(uuid);
    for (const element of section.querySelectorAll("[aria-label]")) expect(element.getAttribute("aria-label")).not.toMatch(uuid);
    expect(within(section).queryByRole("link", { name: /sin carpeta/ })).not.toBeInTheDocument();
    expect(within(section).queryAllByRole("button")).toHaveLength(0);
    expect(request.mock.calls.every(([, options]) => !(options as RequestInit | undefined)?.method || (options as RequestInit).method === "GET")).toBe(true);
  });

  test("invites the first binder when none exists", async () => {
    stubHome({ binders: [] });
    render(<App initialEntries={["/"]} />);
    const section = await screen.findByRole("region", { name: "Mis carpetas" });
    expect(await within(section).findByRole("heading", { name: "Tu primera carpeta te espera" })).toBeVisible();
    expect(within(section).getByRole("link", { name: "+ Nueva carpeta" })).toHaveAttribute("href", "/binders");
  });
});

describe("expansions", () => {
  test("derives at most six expansions from recent copies, in order, with one progress request", async () => {
    const request = stubHome({ recent: homeCards.map((_, index) => physicalCopy(index)).concat([physicalCopy(0, { id: copyId(900) })]) });
    render(<App initialEntries={["/"]} />);
    const sets = await screen.findByRole("region", { name: "Expansiones" });
    await waitFor(() => expect(within(sets).getAllByRole("link", { name: /^Expansion \d/ })).toHaveLength(6));
    expect(within(sets).getAllByRole("link", { name: /^Expansion \d/ }).map((link) => link.textContent)).toEqual(["Expansion 1", "Expansion 2", "Expansion 3", "Expansion 4", "Expansion 5", "Expansion 6"]);
    expect(within(sets).getByText("De tus copias más recientes")).toBeVisible();
    expect(within(sets).getAllByRole("progressbar")).toHaveLength(6);
    const progress = callsTo(request, "/api/v1/sets/progress");
    expect(progress).toHaveLength(1);
    expect(new URL(progress[0][0] as string).searchParams.getAll("set_id")).toEqual(["sv1", "sv2", "sv3", "sv4", "sv5", "sv6"]);
    expect(within(sets).getByRole("link", { name: "Ver todas las expansiones" })).toHaveAttribute("href", "/sets");
  });

  test("keeps unverified checklists honest", async () => {
    stubHome({ progress: (ids) => ids.map((id) => ({ set_id: id, checklist_revision: null, status: "unavailable", total: null, owned: null, missing: null, physical_copies: null, percentage: null })) });
    render(<App initialEntries={["/"]} />);
    const sets = await screen.findByRole("region", { name: "Expansiones" });
    expect((await within(sets).findAllByText("Finalización no disponible.")).length).toBeGreaterThan(0);
    expect(within(sets).queryByRole("progressbar")).not.toBeInTheDocument();
  });
});

describe("empty collection", () => {
  test("replaces the data sections with a friendly first step", async () => {
    stubHome({ valuation: valuation({ copy_count: 0, priced_count: 0, unpriced_count: 0, unpriced_by_reason: {}, total: "0", original_totals: {}, top: [], rates: noRates }) });
    render(<App initialEntries={["/"]} />);
    expect(await main().findByRole("heading", { name: "Tu primera carpeta te espera" })).toBeVisible();
    expect(main().getByText("Escanea o busca una carta para empezar tu colección.")).toBeVisible();
    expect(main().getByRole("link", { name: "Buscar en expansiones" })).toHaveAttribute("href", "/sets");
    expect(main().getAllByRole("link", { name: "Escanear carta" }).length).toBeGreaterThan(0);
    expect(main().queryByRole("region", { name: "Tus cartas más valiosas" })).not.toBeInTheDocument();
    expect(main().queryByRole("region", { name: "Mis carpetas" })).not.toBeInTheDocument();
  });
});

describe("failures and sessions", () => {
  test("a price outage leaves the binders and expansions working and retries only prices", async () => {
    let fail = true;
    const request = stubHome({ valuation: () => fail ? json({}, 503) : json(homeValuation()) });
    const user = userEvent.setup();
    render(<App initialEntries={["/"]} />);
    expect(await main().findByText("No se pudo cargar el valor de tu colección.")).toBeVisible();
    expect(await screen.findByRole("list", { name: /^Vista previa de Favoritas/ })).toBeVisible();
    expect(await screen.findByRole("region", { name: "Expansiones" })).toBeVisible();
    expect(main().getByRole("region", { name: "Tus cartas más valiosas" })).toBeVisible();
    fail = false;
    await user.click(main().getByRole("button", { name: "Reintentar" }));
    expect(await main().findByText(/1\.112/)).toBeVisible();
    expect(callsTo(request, "/api/v1/prices/collection")).toHaveLength(2);
    expect(callsTo(request, "/api/v1/binders")).toHaveLength(1);
  });

  test("a binders failure leaves the value and expansions working", async () => {
    stubHome({ override: (url) => url.pathname === "/api/v1/binders" ? json({}, 500) : undefined });
    render(<App initialEntries={["/"]} />);
    expect(await main().findByText("No se pudieron cargar tus carpetas.")).toBeVisible();
    expect(await main().findByText(/1\.112/)).toBeVisible();
    expect(await screen.findByRole("region", { name: "Expansiones" })).toBeVisible();
  });

  test("a 401 re-checks the session and a different account never sees the previous data", async () => {
    let me = 0; let expire = true;
    const request = stubHome({ override: (url) => {
      if (url.pathname === "/api/v1/auth/me") { me += 1; return json({ user: me === 1 ? userA : userB, csrf_token: "csrf" }); }
      if (url.pathname === "/api/v1/binders" && expire) { expire = false; return json({}, 401); }
      if (url.pathname === "/api/v1/prices/collection") return json(homeValuation({ total: me === 1 ? "1112" : "7777" }));
      return undefined;
    } });
    render(<App initialEntries={["/"]} />);
    expect(await main().findByText(/7\.777/)).toBeVisible();
    expect(callsTo(request, "/api/v1/auth/me").length).toBeGreaterThanOrEqual(2);
    expect(main().queryByText(/1\.112/)).not.toBeInTheDocument();
    await act(async () => undefined);
  });
});
