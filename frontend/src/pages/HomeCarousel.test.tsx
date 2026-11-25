import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "../app/App";
import { advance, DRIFT_PX_PER_SECOND, needsLoop } from "../components/home/drift";
import { callsTo, homeCards, homeValuation, noFavorites, stubHome } from "../test/homeFixtures";
import { stubMedia } from "../test/media";
import { copyId, quote } from "../test/priceFixtures";
import { jsonResponse as json } from "../test/tcgFixtures";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const section = async () => within(await screen.findByRole("region", { name: "Tus cartas" }));
const names = (root: ReturnType<typeof within>) => root.getAllByRole("heading", { level: 3 }).map((heading: HTMLElement) => heading.textContent);
const star = (id: string, amount: string | null) => ({ card_id: id, favorited_at: "2026-11-25T12:00:00Z", price: amount ? quote(amount, "CLP", "1.00") : null, reason: amount ? null : "no_market_data" });

describe("drift maths", () => {
  test("moves about 28 px per second and wraps by exactly one copy", () => {
    expect(DRIFT_PX_PER_SECOND).toBe(28);
    expect(advance(0, 1000, 1000)).toBeCloseTo(28, 6);
    expect(advance(0, 500, 1000)).toBeCloseTo(14, 6);
    expect(advance(990, 1000, 1000)).toBeCloseTo(18, 6);          // 990 + 28 = 1018 → 18: back by one copy
    expect(advance(10, 0, 1000)).toBe(10);
    expect(advance(5, 1000, 0)).toBeCloseTo(33, 6);               // no loop width yet: no wrap
  });
  test("loops only when the cards are wider than their viewport", () => {
    expect(needsLoop(1200, 800)).toBe(true);
    expect(needsLoop(800, 800)).toBe(false);
    expect(needsLoop(500, 800)).toBe(false);
    expect(needsLoop(500, 0)).toBe(false);
  });
});

describe("tabs and sources", () => {
  test("shows three tabs, starts on the most valuable, and cards carry only image, name and gold price", async () => {
    const request = stubHome();
    render(<App initialEntries={["/"]} />);
    const cards = await section();
    const tabs = cards.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Más valiosas", "Favoritas", "Recientes"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(names(cards)).toEqual(["Card 1", "Card 2", "Card 3", "Card 4", "Card 5"]));
    const first = cards.getAllByRole("listitem")[0];
    expect(within(first).getByRole("link", { name: "Card 1" })).toHaveAttribute("href", `/collection/${copyId(100)}`);
    expect(first.querySelector(".price-amount")).toHaveTextContent("$5.000");
    // Sober cards: no original currency, no source, no variant, no date.
    const text = cards.getByRole("tabpanel").textContent!;
    for (const forbidden of [/EUR/, /USD/, /Cardmarket/i, /TCGplayer/i, /Original/, /Holográfica/, /Actualizado/, /Fuente/]) expect(text).not.toMatch(forbidden);
    // The valuation is asked once for the hero and the carousel together, with 12 cards.
    const valuations = callsTo(request, "/api/v1/prices/collection");
    expect(valuations).toHaveLength(1);
    expect(new URL(valuations[0][0] as string).searchParams.get("top")).toBe("12");
  });

  test("favourites and recent are requested only when first selected, and kept afterwards", async () => {
    const request = stubHome({ favorites: { results: [star("sv2-2", "9000"), star("sv1-1", null)] } });
    const user = userEvent.setup();
    render(<App initialEntries={["/"]} />);
    const cards = await section();
    await waitFor(() => expect(names(cards)).toHaveLength(5));
    expect(callsTo(request, "/api/v1/favorites/cards")).toHaveLength(0);
    expect(callsTo(request, "/api/v1/binders/views/added")).toHaveLength(0);
    await user.click(cards.getByRole("tab", { name: "Favoritas" }));
    await waitFor(() => expect(names(cards)).toEqual(["Card 2", "Card 1"]));
    const items = cards.getAllByRole("listitem");
    expect(within(items[0]).getByRole("link", { name: "Card 2" })).toHaveAttribute("href", "/cards/sv2-2");   // to the card, not a copy
    expect(items[0].querySelector(".price-amount")).toHaveTextContent("$9.000");
    expect(within(items[1]).getByText("Sin precio")).toBeVisible();
    await user.click(cards.getByRole("tab", { name: "Recientes" }));
    await waitFor(() => expect(names(cards)).toEqual(["Card 1", "Card 2"]));
    expect(cards.getAllByRole("listitem")[0].querySelector(".price-amount")).toHaveTextContent("$2.500");
    expect(within(cards.getAllByRole("listitem")[0]).getByRole("link", { name: "Card 1" })).toHaveAttribute("href", `/collection/${copyId(100)}`);
    // Back and forth: nothing is requested twice.
    await user.click(cards.getByRole("tab", { name: "Favoritas" }));
    await user.click(cards.getByRole("tab", { name: "Más valiosas" }));
    await user.click(cards.getByRole("tab", { name: "Recientes" }));
    expect(callsTo(request, "/api/v1/favorites/cards")).toHaveLength(1);
    expect(callsTo(request, "/api/v1/binders/views/added")).toHaveLength(1);
    expect(callsTo(request, "/api/v1/prices/copies")).toHaveLength(1);
    expect(callsTo(request, "/api/v1/prices/collection")).toHaveLength(1);
  });

  test("tabs follow arrow keys, Home and End", async () => {
    stubHome({ favorites: { results: [star("sv2-2", "9000")] } });
    const user = userEvent.setup();
    render(<App initialEntries={["/"]} />);
    const cards = await section();
    const [valuable, favorites, added] = cards.getAllByRole("tab");
    valuable.focus();
    await user.keyboard("{ArrowRight}");
    expect(favorites).toHaveFocus(); expect(favorites).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{End}");
    expect(added).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(valuable).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(added).toHaveFocus();
    await user.keyboard("{Home}");
    expect(valuable).toHaveFocus();
    expect(valuable).toHaveAttribute("tabindex", "0"); expect(favorites).toHaveAttribute("tabindex", "-1");
    expect(cards.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", valuable.id);
  });

  test("each view has its own empty state", async () => {
    stubHome({ valuation: homeValuation({ top: [] }), favorites: noFavorites, added: [] });
    const user = userEvent.setup();
    render(<App initialEntries={["/"]} />);
    const cards = await section();
    expect(await cards.findByText("Aún no hay copias con precio para mostrar.")).toBeVisible();
    await user.click(cards.getByRole("tab", { name: "Favoritas" }));
    expect(await cards.findByText("Marca cartas con ★ para verlas aquí")).toBeVisible();
    await user.click(cards.getByRole("tab", { name: "Recientes" }));
    expect(await cards.findByText("Agrega tu primera carta")).toBeVisible();
    expect(cards.getByRole("link", { name: "Escanear carta" })).toHaveAttribute("href", "/scanner");
  });

  test("a failing view retries by itself and leaves the others working", async () => {
    let fail = true;
    const request = stubHome({ favorites: () => (fail ? json({}, 500) : json({ currency: "CLP", total: 1, rates: { available: true, stale: false, updated_at: null, provider: "exchangerate-api", attribution_url: "https://www.exchangerate-api.com" }, results: [star("sv2-2", "9000")] })) });
    const user = userEvent.setup();
    render(<App initialEntries={["/"]} />);
    const cards = await section();
    await user.click(cards.getByRole("tab", { name: "Favoritas" }));
    expect(await cards.findByText("No se pudieron cargar tus favoritas.")).toBeVisible();
    await user.click(cards.getByRole("tab", { name: "Más valiosas" }));
    await waitFor(() => expect(names(cards)).toHaveLength(5));
    await user.click(cards.getByRole("tab", { name: "Favoritas" }));
    fail = false;
    await user.click(await cards.findByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(names(cards)).toEqual(["Card 2"]));
    expect(callsTo(request, "/api/v1/favorites/cards")).toHaveLength(2);
  });

  test("recent cards still show when their prices fail", async () => {
    stubHome({ override: (url) => (url.pathname === "/api/v1/prices/copies" ? json({}, 503) : undefined) });
    const user = userEvent.setup();
    render(<App initialEntries={["/"]} />);
    const cards = await section();
    await user.click(cards.getByRole("tab", { name: "Recientes" }));
    await waitFor(() => expect(names(cards)).toEqual(["Card 1", "Card 2"]));
    expect(cards.getAllByText("Sin precio")).toHaveLength(2);
  });

  test("a card without catalog data falls back to its id, never a UUID", async () => {
    stubHome({ valuation: homeValuation({ top: [{ ...homeValuation().top[0], card_id: "zz9-99" }] }) });
    render(<App initialEntries={["/"]} />);
    const cards = await section();
    expect(await cards.findByRole("link", { name: "zz9-99" })).toBeVisible();
    expect(cards.getByRole("tabpanel").textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
    for (const element of cards.getByRole("tabpanel").querySelectorAll("[aria-label],[title],[alt]")) expect(element.getAttribute("aria-label") ?? "").not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
  });

  test("is in English", async () => {
    stubHome();
    const user = userEvent.setup();
    render(<App initialEntries={["/"]} />);
    await user.click(await screen.findByRole("button", { name: "English" }));
    const cards = within(await screen.findByRole("region", { name: "Your cards" }));
    expect(cards.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Most valuable", "Favourites", "Recent"]);
  });
});

describe("skeleton and reduced motion", () => {
  test("shows skeletons with a status text while loading", async () => {
    stubHome({ valuation: () => new Promise<Response>(() => undefined) });
    render(<App initialEntries={["/"]} />);
    const cards = await section();
    expect((await cards.findByText("Cargando tus cartas…")).parentElement).toHaveAttribute("aria-busy", "true");
  });

  test("drops card tilt and glare under reduced motion", async () => {
    stubMedia({ reducedMotion: true });
    stubHome();
    render(<App initialEntries={["/"]} />);
    const cards = await section();
    await waitFor(() => expect(names(cards)).toHaveLength(5));
    expect(cards.queryByRole("button", { name: "Inclinar carta" })).not.toBeInTheDocument();
    expect(document.querySelector(".tcg-card-glare")).toBeNull();
  });
});

/** Geometry for jsdom: 12 cards 176 px wide with 16 px gaps; the viewport shows 800 px. */
function stubGeometry(viewport = 800, list = 2304) {
  const width = (element: HTMLElement) => (element.classList.contains("pv-reel__viewport") ? viewport : element.classList.contains("pv-reel__list") ? list : 176);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) { return width(this); });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) { return width(this); });
  vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function (this: HTMLElement) { return this.classList.contains("pv-reel__loop") ? list : 0; });
}
/** A manual animation clock: callbacks run when the test says so. */
function stubFrames() {
  let now = 0; let nextId = 1; const queue = new Map<number, FrameRequestCallback>();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { const id = nextId++; queue.set(id, callback); return id; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => { queue.delete(id); });
  return {
    pending: () => queue.size,
    /** Advances the clock by `ms` in one frame. */
    frame(ms: number) { now += ms; const callbacks = [...queue.values()]; queue.clear(); act(() => callbacks.forEach((callback) => callback(now))); },
    /** One second in sixty-ish frames. */
    run(ms: number) { for (let elapsed = 0; elapsed < ms; elapsed += 100) this.frame(Math.min(100, ms - elapsed)); },
  };
}

describe("the drifting loop", () => {
  let frames: ReturnType<typeof stubFrames>;
  beforeEach(() => { stubGeometry(); frames = stubFrames(); });
  const viewport = () => document.querySelector(".pv-reel__viewport") as HTMLDivElement;
  const ready = async () => {
    await screen.findByRole("tablist");
    await waitFor(() => expect(document.querySelector(".pv-reel__loop")).not.toBeNull());
    await waitFor(() => expect(screen.getAllByText("Card 1").length).toBeGreaterThan(0));   // names loaded, so queries by name are stable
  };

  async function open(options: Parameters<typeof stubHome>[0] = {}) {
    stubHome({ valuation: homeValuation({ top: Array.from({ length: 12 }, (_, index) => ({ ...homeValuation().top[0], copy_id: copyId(300 + index), card_id: homeCards[index % 8].id })) }), ...options });
    const view = render(<App initialEntries={["/"]} />);
    await ready();
    return view;
  }

  test("drifts about 28 px per second and loops back by exactly one copy", async () => {
    await open();
    frames.frame(0);
    frames.run(1000);
    expect(viewport().scrollLeft).toBe(28);
    frames.run(9000);
    expect(viewport().scrollLeft).toBe(280);
    // 2304 px is one copy: reaching it wraps to the start, with no cut.
    const wide = 2304 / 28 * 1000;
    frames.run(wide - 10000 + 2000);
    expect(viewport().scrollLeft).toBe(56);
  });

  test("the duplicate copy is hidden from assistive technology and unfocusable", async () => {
    await open();
    const duplicate = document.querySelector(".pv-reel__loop") as HTMLElement;
    expect(duplicate).toHaveAttribute("aria-hidden", "true");
    expect(duplicate.hasAttribute("inert")).toBe(true);
    // Assistive technology and the accessibility tree see each card once: only the original copy counts.
    const accessible = within(screen.getByRole("main")).getAllByRole("link", { name: "Card 1" });
    expect(accessible.every((link) => !duplicate.contains(link))).toBe(true);
    expect(duplicate.querySelectorAll("a").length).toBeGreaterThan(0);
  });

  test("pauses on hover and resumes on leave", async () => {
    await open();
    frames.frame(0); frames.run(1000);
    const before = viewport().scrollLeft;
    fireEvent.mouseEnter(viewport());
    frames.run(2000);
    expect(viewport().scrollLeft).toBe(before);
    expect(frames.pending()).toBe(0);                       // no frame is even requested while paused
    fireEvent.mouseLeave(viewport());
    frames.frame(0); frames.run(1000);
    expect(viewport().scrollLeft).toBeGreaterThan(before);
  });

  test("pauses while focus is inside and resumes when it leaves", async () => {
    await open();
    frames.frame(0); frames.run(1000);
    const link = within(document.querySelector(".pv-reel__list:not(.pv-reel__loop)") as HTMLElement).getAllByRole("link", { name: "Card 1" })[0];
    act(() => link.focus());
    const before = viewport().scrollLeft;
    frames.run(2000);
    expect(viewport().scrollLeft).toBe(before);
    act(() => link.blur());
    frames.frame(0); frames.run(1000);
    expect(viewport().scrollLeft).toBeGreaterThan(before);
  });

  test("a visible Pause button keeps the user's choice and can resume", async () => {
    await open();
    const user = userEvent.setup();
    frames.frame(0); frames.run(1000);
    const pause = screen.getByRole("button", { name: "Pausar" });
    expect(pause).toHaveAttribute("aria-pressed", "false");
    await user.click(pause);
    const before = viewport().scrollLeft;
    frames.run(3000);
    expect(viewport().scrollLeft).toBe(before);
    fireEvent.mouseEnter(viewport()); fireEvent.mouseLeave(viewport());      // hovering does not undo the choice
    frames.run(3000);
    expect(viewport().scrollLeft).toBe(before);
    await user.click(screen.getByRole("button", { name: "Reanudar" }));
    frames.frame(0); frames.run(1000);
    expect(viewport().scrollLeft).toBeGreaterThan(before);
  });

  test("pauses during a touch and waits three seconds after the finger lifts", async () => {
    await open();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });   // only after the page is ready: findBy needs real timers
    try {
      frames.frame(0); frames.run(1000);
      fireEvent.pointerDown(viewport(), { pointerType: "touch", pointerId: 1 });
      const before = viewport().scrollLeft;
      frames.run(2000);
      expect(viewport().scrollLeft).toBe(before);
      fireEvent.pointerUp(viewport(), { pointerType: "touch", pointerId: 1 });
      act(() => { vi.advanceTimersByTime(2900); });
      frames.run(1000);
      expect(viewport().scrollLeft).toBe(before);
      act(() => { vi.advanceTimersByTime(200); });
      frames.frame(0); frames.run(1000);
      expect(viewport().scrollLeft).toBeGreaterThan(before);
    } finally { vi.useRealTimers(); }
  });

  test("pauses while the tab is hidden", async () => {
    await open();
    frames.frame(0); frames.run(1000);
    const before = viewport().scrollLeft;
    const state = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    frames.run(2000);
    expect(viewport().scrollLeft).toBe(before);
    state.mockReturnValue("visible");
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    // Coming back also re-checks the session, which rebuilds the page: wait for it, then it drifts again.
    await ready();
    frames.frame(0); frames.run(1000);
    expect(viewport().scrollLeft).toBeGreaterThan(0);
  });

  test("pauses while the row is off screen", async () => {
    let report!: (entries: { isIntersecting: boolean }[]) => void;
    // Lazy artwork also observes; only the reel's own observer matters here.
    vi.stubGlobal("IntersectionObserver", class {
      constructor(private callback: (entries: { isIntersecting: boolean }[]) => void) {}
      observe(element: Element) { if (element.classList.contains("pv-reel__viewport")) report = this.callback; else this.callback([{ isIntersecting: true }]); }
      disconnect() {}
    });
    await open();
    act(() => report([{ isIntersecting: true }]));
    frames.frame(0); frames.run(1000);
    const before = viewport().scrollLeft;
    act(() => report([{ isIntersecting: false }]));
    frames.run(2000);
    expect(viewport().scrollLeft).toBe(before);
    act(() => report([{ isIntersecting: true }]));
    frames.frame(0); frames.run(1000);
    expect(viewport().scrollLeft).toBeGreaterThan(before);
  });

  test("the arrows move by one card and keep the loop seamless", async () => {
    await open();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Cartas siguientes" }));
    expect(viewport().scrollLeft).toBe(192);                 // one 176 px card and a 16 px gap
    await user.click(screen.getByRole("button", { name: "Cartas anteriores" }));
    expect(viewport().scrollLeft).toBe(0);
    await user.click(screen.getByRole("button", { name: "Cartas anteriores" }));
    expect(viewport().scrollLeft).toBe(2304 - 192);          // wraps backwards through the duplicate
  });

  test("a manual scroll is followed, not fought", async () => {
    await open();
    frames.frame(0); frames.run(1000);
    viewport().scrollLeft = 500;
    fireEvent.scroll(viewport());
    frames.frame(0); frames.run(1000);
    expect(viewport().scrollLeft).toBe(528);
  });

  test("switching tabs starts the new row from the beginning", async () => {
    await open({ favorites: { results: Array.from({ length: 12 }, (_, index) => star(homeCards[index % 8].id.replace(/-\d+$/, `-${index + 1}`), "1000")) } });
    const user = userEvent.setup();
    frames.frame(0); frames.run(5000);
    expect(viewport().scrollLeft).toBeGreaterThan(100);
    await user.click(screen.getByRole("tab", { name: "Favoritas" }));
    await waitFor(() => expect(viewport().scrollLeft).toBe(0));
  });
});

describe("the row without enough cards or with reduced motion", () => {
  test("a short row never loops: no duplicate, no pause button, no frames", async () => {
    stubGeometry(800, 500);
    const frames = stubFrames();
    stubHome();
    render(<App initialEntries={["/"]} />);
    await screen.findByRole("tablist");
    await waitFor(() => expect(document.querySelectorAll(".pv-reel__item").length).toBe(5));
    expect(document.querySelector(".pv-reel__loop")).toBeNull();
    expect(screen.queryByRole("button", { name: "Pausar" })).not.toBeInTheDocument();
    expect(frames.pending()).toBe(0);
    expect(screen.getByRole("button", { name: "Cartas siguientes" })).toBeVisible();   // manual control still there
  });

  test("with reduced motion nothing drifts, there is no duplicate or pause button, and the arrows still work", async () => {
    stubMedia({ reducedMotion: true });
    stubGeometry();
    const frames = stubFrames();
    stubHome();
    const user = userEvent.setup();
    render(<App initialEntries={["/"]} />);
    await screen.findByRole("tablist");
    await waitFor(() => expect(document.querySelectorAll(".pv-reel__item").length).toBe(5));
    frames.run(3000);
    expect(frames.pending()).toBe(0);
    expect(document.querySelector(".pv-reel__loop")).toBeNull();
    expect(screen.queryByRole("button", { name: "Pausar" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cartas siguientes" }));
    expect((document.querySelector(".pv-reel__viewport") as HTMLElement).scrollLeft).toBe(192);
  });
});

describe("guests and recent copies", () => {
  test("a guest never requests any carousel data", async () => {
    const request = stubHome({ guest: true });
    render(<App initialEntries={["/"]} />);
    await screen.findByText("TU BÓVEDA TCG");
    expect(callsTo(request, "/api/v1/favorites/cards")).toHaveLength(0);
    expect(callsTo(request, "/api/v1/binders/views/added")).toHaveLength(0);
  });
});
