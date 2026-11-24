import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { App } from "../app/App";
import { callsTo, homeCards, homeValuation, physicalCopy, ratesDown, stubHome, userA, userB } from "../test/homeFixtures";
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
    expect(callsTo(request, "/api/v1/boxes")).toHaveLength(1);
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

describe("Mi PC", () => {
  test("renders the 6×5 grid with the first card selected and follows the keyboard", async () => {
    stubHome({ unassigned: 3 });
    const user = userEvent.setup();
    render(<App initialEntries={["/"]} />);
    const pc = await screen.findByRole("region", { name: "Mi PC" });
    const grid = await within(pc).findByRole("grid");
    expect(within(grid).getAllByRole("gridcell")).toHaveLength(30);
    expect(within(grid).getAllByRole("gridcell")[2]).toHaveAttribute("aria-selected", "true");
    const panel = within(await within(pc).findByRole("complementary", { name: "Copia seleccionada" }));
    expect(await panel.findByRole("heading", { name: "Card 1" })).toBeVisible();
    expect(panel.getByRole("link", { name: "Ver copia" })).toHaveAttribute("href", `/collection/${copyId(100)}`);
    expect(panel.getByText("Holográfica")).toBeVisible();
    within(grid).getAllByRole("button")[2].focus();
    await user.keyboard("{ArrowRight}");
    expect(within(grid).getAllByRole("gridcell")[3]).toHaveAttribute("aria-selected", "true");
    expect(await panel.findByRole("heading", { name: "Card 2" })).toBeVisible();
    await user.keyboard("{ArrowRight}");
    expect(panel.getByRole("heading", { name: "Espacio vacío 5" })).toBeVisible();
    expect(within(pc).getByRole("link", { name: "3 cartas sin caja · ordenar" })).toHaveAttribute("href", "/boxes?mode=personal");
    expect(within(pc).getByRole("link", { name: "+ Nueva caja" })).toHaveAttribute("href", "/boxes?mode=personal");
    expect(within(pc).getByRole("link", { name: "Abrir Mi PC" })).toHaveAttribute("href", "/boxes?mode=personal");
  });

  test("hides the unassigned shortcut when every card has a box and is read-only", async () => {
    const request = stubHome({ unassigned: 0 });
    render(<App initialEntries={["/"]} />);
    const pc = await screen.findByRole("region", { name: "Mi PC" });
    await within(pc).findByRole("grid");
    expect(within(pc).queryByRole("link", { name: /sin caja/ })).not.toBeInTheDocument();
    expect(request.mock.calls.every(([, options]) => !(options as RequestInit | undefined)?.method || (options as RequestInit).method === "GET")).toBe(true);
  });

  test("invites the first box when none exists", async () => {
    stubHome({ boxes: [] });
    render(<App initialEntries={["/"]} />);
    const pc = await screen.findByRole("region", { name: "Mi PC" });
    expect(await within(pc).findByRole("heading", { name: "Tu primera caja te espera" })).toBeVisible();
    expect(within(pc).getByRole("link", { name: "+ Nueva caja" })).toHaveAttribute("href", "/boxes?mode=personal");
    expect(within(pc).queryByRole("grid")).not.toBeInTheDocument();
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
    expect(await main().findByRole("heading", { name: "Tu primera caja te espera" })).toBeVisible();
    expect(main().getByText("Escanea o busca una carta para empezar tu colección.")).toBeVisible();
    expect(main().getByRole("link", { name: "Buscar en expansiones" })).toHaveAttribute("href", "/sets");
    expect(main().getAllByRole("link", { name: "Escanear carta" }).length).toBeGreaterThan(0);
    expect(main().queryByRole("region", { name: "Tus cartas más valiosas" })).not.toBeInTheDocument();
    expect(main().queryByRole("region", { name: "Mi PC" })).not.toBeInTheDocument();
  });
});

describe("failures and sessions", () => {
  test("a price outage leaves Mi PC and expansions working and retries only prices", async () => {
    let fail = true;
    const request = stubHome({ valuation: () => fail ? json({}, 503) : json(homeValuation()) });
    const user = userEvent.setup();
    render(<App initialEntries={["/"]} />);
    expect(await main().findByText("No se pudo cargar el valor de tu colección.")).toBeVisible();
    expect(await screen.findByRole("grid")).toBeVisible();
    expect(await screen.findByRole("region", { name: "Expansiones" })).toBeVisible();
    expect(main().getByRole("region", { name: "Tus cartas más valiosas" })).toBeVisible();
    fail = false;
    await user.click(main().getByRole("button", { name: "Reintentar" }));
    expect(await main().findByText(/1\.112/)).toBeVisible();
    expect(callsTo(request, "/api/v1/prices/collection")).toHaveLength(2);
    expect(callsTo(request, "/api/v1/boxes")).toHaveLength(1);
  });

  test("a PC failure leaves the value and expansions working", async () => {
    stubHome({ override: (url) => url.pathname === "/api/v1/boxes" ? json({}, 500) : undefined });
    render(<App initialEntries={["/"]} />);
    expect(await main().findByText("No se pudo cargar tu PC.")).toBeVisible();
    expect(await main().findByText(/1\.112/)).toBeVisible();
    expect(await screen.findByRole("region", { name: "Expansiones" })).toBeVisible();
  });

  test("a 401 re-checks the session and a different account never sees the previous data", async () => {
    let me = 0; let expire = true;
    const request = stubHome({ override: (url) => {
      if (url.pathname === "/api/v1/auth/me") { me += 1; return json({ user: me === 1 ? userA : userB, csrf_token: "csrf" }); }
      if (url.pathname === "/api/v1/boxes" && expire) { expire = false; return json({}, 401); }
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
