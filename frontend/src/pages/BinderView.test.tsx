import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { App } from "../app/App";
import { binderId, binderWorld, physical, pocketOf } from "../test/binderFixtures";
import { stubMedia } from "../test/media";
import { jsonResponse as json } from "../test/tcgFixtures";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
afterEach(() => vi.unstubAllGlobals());
const live = () => document.querySelector(".pv-binder__status")!;
const grid = (page: number) => screen.getByRole("grid", { name: `Página ${page}` });
const findGrid = (page: number) => screen.findByRole("grid", { name: `Página ${page}` });

function expectNoUuid(root: Element) {
  expect(root.textContent).not.toMatch(UUID);
  for (const element of root.querySelectorAll("[aria-label]")) expect(element.getAttribute("aria-label")).not.toMatch(UUID);
}

describe("spread and pockets", () => {
  test("shows two pages on desktop with named pockets, images, names and prices", async () => {
    binderWorld({ binders: [{ name: "Kanto", pockets: [pocketOf(1, 1, physical(0)), pocketOf(2, 5, physical(1))] }] });
    render(<App initialEntries={[`/binders/${binderId(1)}`]} />);
    expect(await screen.findByRole("heading", { level: 1, name: "Kanto" })).toBeVisible();
    expect(screen.getAllByRole("grid")).toHaveLength(2);
    const pocket = await within(await findGrid(1)).findByRole("button", { name: "Página 1, bolsillo 1: Card 1 · Expansion 1; Holográfica, Casi impecable" });
    expect(within(pocket).getByText("Card 1")).toBeInTheDocument();
    expect(await within(pocket).findByText("$1.500")).toBeInTheDocument();
    expect(within(grid(2)).getByRole("button", { name: "Página 2, bolsillo 4: vacío" })).toBeInTheDocument();
    expect(within(grid(2)).getAllByRole("gridcell")).toHaveLength(9);
    expect(screen.getByText("pág. 1–2 de 4")).toBeVisible();
    expectNoUuid(screen.getByRole("main"));
  });

  test("shows one page at a time on a phone and turns pages with buttons and Page Down", async () => {
    stubMedia({ mobile: true });
    binderWorld({ binders: [{ name: "Kanto", pockets: [pocketOf(1, 1, physical(0)), pocketOf(3, 2, physical(1))] }] });
    const user = userEvent.setup();
    render(<App initialEntries={[`/binders/${binderId(1)}`]} />);
    await screen.findByRole("heading", { level: 1, name: "Kanto" });
    expect(screen.getAllByRole("grid")).toHaveLength(1);
    expect(screen.getByText("pág. 1 de 4")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Página siguiente ›" }));
    expect(screen.getByRole("grid", { name: "Página 2" })).toBeInTheDocument();
    const spread = document.querySelector(".pv-spread")!;
    expect(spread).toHaveAttribute("data-turn", "next");
    await waitFor(() => expect(spread).not.toHaveAttribute("data-turn"), { timeout: 1500 });
    within(grid(2)).getAllByRole("button")[0].focus();
    await user.keyboard("{PageDown}");
    expect(await within(await findGrid(3)).findByRole("button", { name: /^Página 3, bolsillo 2: Card 2/ })).toBeInTheDocument();
    expect(within(grid(3)).getAllByRole("button")[0]).toHaveFocus();
  });

  test("arrow keys move the selection inside a page and the panel follows", async () => {
    binderWorld({ binders: [{ name: "Kanto", pockets: [pocketOf(1, 1, physical(0)), pocketOf(1, 2, physical(1))] }] });
    const user = userEvent.setup();
    render(<App initialEntries={[`/binders/${binderId(1)}`]} />);
    const first = await within(await findGrid(1)).findByRole("button", { name: /^Página 1, bolsillo 1:/ });
    await user.click(first);
    const panel = screen.getByRole("complementary", { name: "Bolsillo seleccionado" });
    expect(within(panel).getByRole("heading", { name: "Pág. 1 · bolsillo 1" })).toBeVisible();
    await user.keyboard("{ArrowRight}");
    expect(within(grid(1)).getAllByRole("button")[1]).toHaveFocus();
    expect(await within(panel).findByText("Card 2 · Expansion 2")).toBeVisible();
    await user.keyboard("{ArrowDown}");
    expect(within(panel).getByRole("heading", { name: "Pág. 1 · bolsillo 5" })).toBeVisible();
    expect(within(panel).getByRole("button", { name: "Elegir de la bandeja" })).toBeVisible();
  });

  test("a deep link opens the spread of the page and focuses the pocket", async () => {
    binderWorld({ binders: [{ name: "Kanto", pockets: [pocketOf(3, 5, physical(0))] }] });
    render(<App initialEntries={[`/binders/${binderId(1)}?page=3&pocket=5`]} />);
    const pocket = await screen.findByRole("button", { name: /^Página 3, bolsillo 5: Card 1/ });
    await waitFor(() => expect(pocket).toHaveFocus());
    expect(screen.getByText("pág. 3–4 de 4")).toBeVisible();
  });
});

describe("tray and actions", () => {
  test("tapping a tray card stores it in the next free pocket and announces where", async () => {
    const world = binderWorld({ binders: [{ name: "Tesoros", pockets: [pocketOf(1, 1, physical(0))] }], tray: [physical(1)] });
    const user = userEvent.setup();
    render(<App initialEntries={[`/binders/${binderId(1)}`]} />);
    const tray = await screen.findByRole("region", { name: "Sin carpeta" });
    await user.click(await within(tray).findByRole("button", { name: "Guardar Card 2 · Expansion 2 en esta carpeta" }));
    await waitFor(() => expect(live()).toHaveTextContent("Guardada en Tesoros · pág. 1 · bolsillo 2"));
    expect(world.mutations()).toEqual([{ method: "POST", path: `/api/v1/binders/${binderId(1)}/pockets`, body: { copy_id: physical(1).id } }]);
    const stored = within(grid(1)).getByRole("button", { name: /^Página 1, bolsillo 2: Card 2/ });
    // The arrival plays after the (here unsupported, so instant) flight.
    await waitFor(() => expect(stored).toHaveAttribute("data-arrived", "true"));
    await waitFor(() => expect(stored).toHaveFocus());
    // The arrival mark clears just after its 600 ms animation.
    await waitFor(() => expect(stored).not.toHaveAttribute("data-arrived"), { timeout: 1500 });
    expect(await within(tray).findByText("Todas tus cartas están en carpetas.")).toBeVisible();
  });

  test("a copy from another binder announces where it moved from", async () => {
    binderWorld({ binders: [{ name: "Tesoros", pockets: [] }, { name: "Repetidas", pockets: [pocketOf(1, 4, physical(0))] }] });
    const user = userEvent.setup();
    render(<App initialEntries={[`/binders/${binderId(2)}`]} />);
    await user.click(await within(await findGrid(1)).findByRole("button", { name: /^Página 1, bolsillo 4:/ }));
    await user.click(screen.getByRole("button", { name: "Mover" }));
    const panel = screen.getByRole("complementary", { name: "Bolsillo seleccionado" });
    const select = await within(panel).findByLabelText("Carpeta de destino");
    await waitFor(() => expect(within(select).getAllByRole("option")).toHaveLength(2));
    await user.selectOptions(select, binderId(1));
    await user.click(within(panel).getByRole("button", { name: "Siguiente bolsillo libre" }));
    await waitFor(() => expect(live()).toHaveTextContent("Movida desde Repetidas a Tesoros · pág. 1 · bolsillo 1"));
    expect(within(grid(1)).getByRole("button", { name: "Página 1, bolsillo 4: vacío" })).toBeInTheDocument();
  });

  test("moves within the binder by choosing an empty pocket in the spread", async () => {
    const world = binderWorld({ binders: [{ name: "Tesoros", pockets: [pocketOf(1, 1, physical(0))] }] });
    const user = userEvent.setup();
    render(<App initialEntries={[`/binders/${binderId(1)}`]} />);
    await user.click(await within(await findGrid(1)).findByRole("button", { name: /^Página 1, bolsillo 1:/ }));
    await user.click(screen.getByRole("button", { name: "Mover" }));
    await user.click(within(grid(2)).getByRole("button", { name: "Página 2, bolsillo 9: vacío" }));
    await waitFor(() => expect(live()).toHaveTextContent("Movida a pág. 2 · bolsillo 9"));
    expect(world.mutations()).toEqual([{ method: "PUT", path: `/api/v1/binders/${binderId(1)}/pockets/2/9`, body: { copy_id: physical(0).id } }]);
  });

  test("an empty pocket can be filled from the tray, and taking a card out returns it", async () => {
    const world = binderWorld({ binders: [{ name: "Tesoros", pockets: [] }], tray: [physical(0)] });
    const user = userEvent.setup();
    render(<App initialEntries={[`/binders/${binderId(1)}`]} />);
    await user.click(await within(await findGrid(2)).findByRole("button", { name: "Página 2, bolsillo 5: vacío" }));
    await user.click(screen.getByRole("button", { name: "Elegir de la bandeja" }));
    const tray = screen.getByRole("region", { name: "Sin carpeta" });
    expect(within(tray).getByText("Toca una carta para guardarla en la página 2, bolsillo 5.")).toBeVisible();
    await user.click(await within(tray).findByRole("button", { name: "Guardar Card 1 · Expansion 1 en página 2, bolsillo 5" }));
    await waitFor(() => expect(live()).toHaveTextContent("Guardada en Tesoros · pág. 2 · bolsillo 5"));
    await user.click(screen.getByRole("button", { name: "Sacar de la carpeta" }));
    await waitFor(() => expect(live()).toHaveTextContent("Devuelta a la bandeja"));
    expect(within(grid(2)).getByRole("button", { name: "Página 2, bolsillo 5: vacío" })).toBeInTheDocument();
    expect(world.mutations().map((c) => `${c.method} ${c.path}`)).toEqual([
      `PUT /api/v1/binders/${binderId(1)}/pockets/2/5`,
      `DELETE /api/v1/binders/${binderId(1)}/pockets/2/5`,
    ]);
    expect(world.request.mock.calls.some(([input]) => String(input).includes(`pockets/2/5?copy_id=${physical(0).id}`))).toBe(true);
    expect(await within(tray).findByRole("button", { name: /^Guardar Card 1/ })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Sin carpeta" })).toHaveFocus();
  });
});

/** Stubs the Web Animations API (jsdom has none); each flight finishes when released. */
function stubAnimate(onStart: (element: HTMLElement) => void = () => undefined) {
  const flights: { element: HTMLElement; keyframes: Keyframe[]; options: KeyframeAnimationOptions; finish: () => void }[] = [];
  const animate = vi.fn(function (this: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => { finish = resolve; });
    onStart(this);
    flights.push({ element: this, keyframes, options, finish });
    return { finished, cancel: () => finish() } as unknown as Animation;
  });
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, writable: true, value: animate });
  return { animate, flights, restore: () => { delete (HTMLElement.prototype as Partial<HTMLElement>).animate; } };
}

describe("FLIP flight", () => {
  test("a floating clone flies from the tray to the pocket, then is removed and the pocket drops in", async () => {
    const motion = stubAnimate();
    try {
      binderWorld({ binders: [{ name: "Tesoros", pockets: [] }], tray: [physical(0)] });
      const user = userEvent.setup();
      render(<App initialEntries={[`/binders/${binderId(1)}`]} />);
      await user.click(await screen.findByRole("button", { name: /^Guardar Card 1/ }));
      await waitFor(() => expect(motion.flights).toHaveLength(1));
      const clone = document.body.querySelector(".pv-flight") as HTMLElement;
      expect(clone).not.toBeNull();
      expect(clone.parentElement).toBe(document.body);
      expect(clone).toHaveAttribute("aria-hidden", "true");
      expect(clone.style.position).toBe("fixed");
      expect(motion.flights[0].element).toBe(clone);
      expect(motion.flights[0].options.duration).toBe(300);
      expect(motion.flights[0].keyframes).toHaveLength(2);
      const pocket = within(grid(1)).getByRole("button", { name: /^Página 1, bolsillo 1: Card 1/ });
      expect(pocket).toHaveAttribute("data-incoming", "true");
      expect(pocket).not.toHaveAttribute("data-arrived");
      await act(async () => motion.flights[0].finish());
      await waitFor(() => expect(document.body.querySelector(".pv-flight")).toBeNull());
      expect(pocket).not.toHaveAttribute("data-incoming");
      expect(pocket).toHaveAttribute("data-arrived", "true");
    } finally { motion.restore(); }
  });

  test("turns to the destination page before the flight starts", async () => {
    const order: string[] = [];
    const motion = stubAnimate(() => {
      order.push(screen.queryByRole("grid", { name: "Página 3" }) ? "flight-after-page-3" : "flight-before-page-3");
    });
    try {
      const full = Array.from({ length: 18 }, (_, index) => pocketOf(Math.floor(index / 9) + 1, (index % 9) + 1, physical(10 + index)));
      binderWorld({ binders: [{ name: "Tesoros", pockets: full }], tray: [physical(0)] });
      const user = userEvent.setup();
      render(<App initialEntries={[`/binders/${binderId(1)}`]} />);
      await user.click(await screen.findByRole("button", { name: /^Guardar Card 1/ }));
      await waitFor(() => expect(document.querySelector(".pv-spread")).toHaveAttribute("data-turn", "next"));
      order.push("page-turned");
      expect(motion.animate).not.toHaveBeenCalled();
      await waitFor(() => expect(motion.flights).toHaveLength(1));
      expect(order).toEqual(["page-turned", "flight-after-page-3"]);
      await act(async () => motion.flights[0].finish());
      await waitFor(() => expect(within(grid(3)).getByRole("button", { name: /^Página 3, bolsillo 1: Card 1/ })).toHaveAttribute("data-arrived", "true"));
      expect(document.body.querySelector(".pv-flight")).toBeNull();
    } finally { motion.restore(); }
  });

  test("moving between pockets flies from the source pocket", async () => {
    const motion = stubAnimate();
    try {
      binderWorld({ binders: [{ name: "Tesoros", pockets: [pocketOf(1, 1, physical(0))] }] });
      const user = userEvent.setup();
      render(<App initialEntries={[`/binders/${binderId(1)}`]} />);
      await user.click(await within(await findGrid(1)).findByRole("button", { name: /^Página 1, bolsillo 1:/ }));
      await user.click(screen.getByRole("button", { name: "Mover" }));
      await user.click(within(grid(2)).getByRole("button", { name: "Página 2, bolsillo 9: vacío" }));
      await waitFor(() => expect(motion.flights).toHaveLength(1));
      expect(motion.flights[0].element).toHaveClass("pv-pocket__sleeve", "pv-flight");
      await act(async () => motion.flights[0].finish());
      await waitFor(() => expect(document.body.querySelector(".pv-flight")).toBeNull());
    } finally { motion.restore(); }
  });

  test("with reduced motion there is no flight and the card appears directly", async () => {
    stubMedia({ reducedMotion: true });
    const motion = stubAnimate();
    try {
      binderWorld({ binders: [{ name: "Tesoros", pockets: [] }], tray: [physical(0)] });
      const user = userEvent.setup();
      render(<App initialEntries={[`/binders/${binderId(1)}`]} />);
      await user.click(await screen.findByRole("button", { name: /^Guardar Card 1/ }));
      const pocket = await within(grid(1)).findByRole("button", { name: /^Página 1, bolsillo 1: Card 1/ });
      expect(pocket).not.toHaveAttribute("data-incoming");
      expect(motion.animate).not.toHaveBeenCalled();
      expect(document.body.querySelector(".pv-flight")).toBeNull();
    } finally { motion.restore(); }
  });
});

describe("tray paging", () => {
  test("pages the tray 30 cards at a time with bounded offsets", async () => {
    const world = binderWorld({ binders: [{ name: "Tesoros", pockets: [] }], tray: Array.from({ length: 31 }, (_, index) => physical(index)) });
    const base = world.request.getMockImplementation()!;
    world.request.mockImplementation(async (input: string, options?: RequestInit) => {
      const url = new URL(input);
      if (url.pathname === "/api/v1/binders/views/unassigned") {
        const offset = Number(url.searchParams.get("offset"));
        const all = Array.from({ length: 31 }, (_, index) => physical(index));
        return json({ results: all.slice(offset, offset + 30), total: 31, offset, limit: 30 });
      }
      return base(input, options);
    });
    const user = userEvent.setup();
    render(<App initialEntries={[`/binders/${binderId(1)}`]} />);
    const tray = await screen.findByRole("region", { name: "Sin carpeta" });
    expect(await within(tray).findByText("31 sin carpeta")).toBeVisible();
    expect(within(tray).getAllByRole("listitem")).toHaveLength(30);
    expect(within(tray).getByRole("button", { name: "Cartas anteriores" })).toBeDisabled();
    await user.click(within(tray).getByRole("button", { name: "Más cartas" }));
    await waitFor(() => expect(within(tray).getAllByRole("listitem")).toHaveLength(1));
    expect(world.request.mock.calls.some(([input]) => String(input).includes("/views/unassigned?offset=30&limit=30"))).toBe(true);
    expect(within(tray).getByRole("button", { name: "Más cartas" })).toBeDisabled();
  });
});

describe("conflicts, sessions and outages", () => {
  test("an occupied pocket refreshes the binder and explains the conflict", async () => {
    const world = binderWorld({ binders: [{ name: "Tesoros", pockets: [] }], tray: [physical(0)] });
    const user = userEvent.setup();
    render(<App initialEntries={[`/binders/${binderId(1)}`]} />);
    await user.click(await within(await findGrid(1)).findByRole("button", { name: "Página 1, bolsillo 3: vacío" }));
    await user.click(screen.getByRole("button", { name: "Elegir de la bandeja" }));
    world.fail("PUT", `/api/v1/binders/${binderId(1)}/pockets/1/3`, () => json({ detail: "pocket_occupied" }, 409));
    await user.click(await screen.findByRole("button", { name: /^Guardar Card 1/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ese bolsillo ya tiene una carta. Se actualizó la carpeta.");
    await waitFor(() => expect(world.calls.filter((c) => c.method === "GET" && c.path === `/api/v1/binders/${binderId(1)}`)).toHaveLength(2));
  });

  test("a full binder is explained", async () => {
    const world = binderWorld({ binders: [{ name: "Tesoros", pockets: [] }], tray: [physical(0)] });
    world.fail("POST", `/api/v1/binders/${binderId(1)}/pockets`, () => json({ detail: "binder_full" }, 409));
    const user = userEvent.setup();
    render(<App initialEntries={[`/binders/${binderId(1)}`]} />);
    await user.click(await screen.findByRole("button", { name: /^Guardar Card 1/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Esta carpeta está llena (40 páginas, 360 cartas).");
  });

  test("a 401 while storing re-checks the session", async () => {
    const world = binderWorld({ binders: [{ name: "Tesoros", pockets: [] }], tray: [physical(0)] });
    world.fail("POST", `/api/v1/binders/${binderId(1)}/pockets`, () => json({}, 401));
    const user = userEvent.setup();
    render(<App initialEntries={[`/binders/${binderId(1)}`]} />);
    await user.click(await screen.findByRole("button", { name: /^Guardar Card 1/ }));
    await waitFor(() => expect(world.calls.filter((c) => c.path === "/api/v1/auth/me").length).toBeGreaterThanOrEqual(2));
  });

  test("card metadata and price outages keep the binder usable with card-id names", async () => {
    const world = binderWorld({ binders: [{ name: "Tesoros", pockets: [pocketOf(1, 1, physical(0))] }] });
    const base = world.request.getMockImplementation()!;
    world.request.mockImplementation(async (input: string, options?: RequestInit) => {
      const path = new URL(input).pathname;
      if (path.startsWith("/api/v1/cards/")) return json({}, 503);
      if (path === "/api/v1/prices/copies") return json({}, 503);
      return base(input, options);
    });
    render(<App initialEntries={[`/binders/${binderId(1)}`]} />);
    const pocket = await within(await screen.findByRole("grid", { name: "Página 1" })).findByRole("button", { name: "Página 1, bolsillo 1: sv1-1; Holográfica, Casi impecable" });
    expect(within(pocket).getAllByText("sv1-1").length).toBeGreaterThan(0);
    expect(within(pocket).queryByText(/\$/)).not.toBeInTheDocument();
    expectNoUuid(screen.getByRole("main"));
  });

  test("session validation aborts a pending store and an account switch ignores its late response", async () => {
    const world = binderWorld({ binders: [{ name: "Tesoros", pockets: [] }], tray: [physical(0)] });
    const base = world.request.getMockImplementation()!;
    let validating = false; let switched = false; let storeSignal: AbortSignal | undefined;
    let finishSession!: (response: Response) => void; let finishStore!: (response: Response) => void;
    world.request.mockImplementation(async (input: string, options?: RequestInit) => {
      const path = new URL(input).pathname;
      if (path === "/api/v1/auth/me" && validating) return new Promise<Response>((resolve) => { finishSession = resolve; });
      if (options?.method === "POST" && path.endsWith("/pockets")) { storeSignal = options.signal as AbortSignal; return new Promise<Response>((resolve) => { finishStore = resolve; }); }
      if (switched && path === `/api/v1/binders/${binderId(1)}`) return json({ detail: "Binder not found" }, 404);
      return base(input, options);
    });
    const user = userEvent.setup();
    render(<App initialEntries={[`/binders/${binderId(1)}`]} />);
    await user.click(await screen.findByRole("button", { name: /^Guardar Card 1/ }));
    await waitFor(() => expect(finishStore).toBeTypeOf("function"));
    validating = true;
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(storeSignal?.aborted).toBe(true);
    expect(screen.queryByRole("heading", { level: 1, name: "Tesoros" })).not.toBeInTheDocument();
    switched = true;
    await act(async () => finishSession(json({ user: { id: "misty", display_name: "Misty", email: null, email_verified: true, picture_url: null }, csrf_token: "c" })));
    expect(await screen.findByText("La carpeta o la carta ya no está disponible. Se actualizaron los datos.")).toBeVisible();
    const before = world.request.mock.calls.length;
    await act(async () => finishStore(json({ page: 1, pocket: 1, moved_from: null, binder: { id: binderId(1) } })));
    expect(document.querySelector(".pv-binder__status")?.textContent ?? "").toBe("");
    expect(screen.queryByRole("heading", { level: 1, name: "Tesoros" })).not.toBeInTheDocument();
    expect(world.request.mock.calls.length).toBe(before);
  });
});
