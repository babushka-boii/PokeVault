import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { App } from "../app/App";
import { AppRoutes } from "../app/router";
import { AuthProvider } from "../auth/AuthProvider";
import { LocaleProvider } from "../i18n/LocaleProvider";
import { jsonResponse as json, pikachuCard } from "../test/tcgFixtures";
import { setCardPage, setCards, setCollectionPage, setDetail, setPage, setProgress, setSession, setSummary } from "../test/setFixtures";

afterEach(() => vi.unstubAllGlobals());

function setup(override?: (url: URL, options?: RequestInit) => Response | Promise<Response> | undefined, authenticated = false) {
  const request = vi.fn(async (input: string, options?: RequestInit): Promise<Response> => {
    const url = new URL(input);
    const replacement = override?.(url, options);
    if (replacement) return replacement;
    if (url.pathname.endsWith("/auth/me")) return authenticated ? json(setSession) : json({}, 401);
    if (url.pathname === "/api/v1/sets") return json(setPage({ page: Number(url.searchParams.get("page") ?? 1) }));
    if (url.pathname === "/api/v1/sets/progress") return json({ results: [setProgress] });
    if (url.pathname === "/api/v1/sets/sm9/progress") return json(setCollectionPage({ page: Number(url.searchParams.get("page") ?? 1) }));
    if (url.pathname === "/api/v1/sets/sm9/cards") return json(setCardPage({ page: Number(url.searchParams.get("page") ?? 1) }));
    if (url.pathname === "/api/v1/sets/sm9") return json(setDetail);
    if (url.pathname === "/api/v1/cards/sm9-33") return json(pikachuCard);
    if (url.pathname === "/api/v1/pokemon") return json({ results: [] });
    throw new Error(`Unexpected test request ${url.pathname}`);
  });
  vi.stubGlobal("fetch", request);
  return request;
}

test("opens the public expansion explorer from global navigation without reading guest inventory", async () => {
  const request = setup();
  const user = userEvent.setup();
  render(<App initialEntries={["/pokedex"]} />);
  await user.click(screen.getByRole("link", { name: "Expansiones" }));
  expect(await screen.findByRole("link", { name: "Team Up" })).toBeVisible();
  expect(screen.getByText("Catálogo físico en inglés de TCGdex. Se excluyen TCG Pocket y series sin verificar.")).toBeVisible();
  expect(request.mock.calls.some(([input]) => input.includes("/progress"))).toBe(false);
  expect(request.mock.calls.some(([input]) => /\/cards\//.test(input))).toBe(false);
});

test("searches by stable set ID, filters series and sorts across the server catalog before pagination", async () => {
  const request = setup((url) => url.pathname === "/api/v1/sets" ? json(setPage({
    page: Number(url.searchParams.get("page") ?? 1), total: 30,
    results: url.searchParams.get("q") === "sv03.5" ? [{ ...setSummary, id: "sv03.5", name: "151" }] : [setSummary],
  })) : undefined);
  const user = userEvent.setup();
  render(<App initialEntries={["/sets?page=2"]} />);
  await screen.findByRole("link", { name: "Team Up" });
  await user.type(screen.getByRole("searchbox", { name: "Nombre o ID de expansión" }), "sv03.5");
  await user.selectOptions(screen.getByRole("combobox", { name: "Serie" }), "sm");
  await user.selectOptions(screen.getByRole("combobox", { name: "Ordenar por" }), "oldest");
  await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));
  expect(await screen.findByRole("link", { name: "151" })).toBeVisible();
  const url = new URL(request.mock.calls.filter(([input]) => new URL(input).pathname === "/api/v1/sets").at(-1)![0]);
  expect(Object.fromEntries(url.searchParams)).toMatchObject({ q: "sv03.5", series_id: "sm", sort: "oldest", page: "1", page_size: "12" });
  expect(screen.queryByRole("link", { name: "Team Up" })).not.toBeInTheDocument();
});

test("preserves explorer filters through pagination and expansion return links", async () => {
  setup((url) => url.pathname === "/api/v1/sets" ? json(setPage({ page: Number(url.searchParams.get("page") ?? 1), total: 30 })) : undefined);
  const user = userEvent.setup();
  render(<App initialEntries={["/sets?q=team&series_id=sm&sort=oldest"]} />);
  await screen.findByRole("link", { name: "Team Up" });
  await user.click(screen.getByRole("link", { name: "Página siguiente" }));
  await user.click(await screen.findByRole("link", { name: "Team Up" }));
  expect(await screen.findByRole("heading", { name: "Team Up" })).toBeVisible();
  const back = screen.getByRole("link", { name: "Volver a expansiones" });
  expect(back).toHaveAttribute("href", "/sets?q=team&series_id=sm&sort=oldest&page=2");
  expect(screen.getByText("80")).toBeVisible();
  expect(screen.getByText("Total del proveedor").parentElement).toHaveTextContent("100");
  expect(screen.getByText("Entradas en la lista verificada").parentElement).toHaveTextContent("100");
});

test("shows public checklist artwork and returns from card details to the same checklist page", async () => {
  setup();
  const user = userEvent.setup();
  render(<App initialEntries={["/sets/sm9?page=2&q=pika&sort=name"]} />);
  const card = await screen.findByRole("link", { name: "Pikachu & Zekrom-GX" });
  expect(screen.getByRole("img", { name: "Pikachu & Zekrom-GX" })).toHaveAttribute("src", pikachuCard.thumbnail_url);
  await user.click(card);
  expect(await screen.findByRole("heading", { name: "Pikachu & Zekrom-GX" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Volver a la expansión" })).toHaveAttribute("href", "/sets/sm9?page=2&q=pika&sort=name");
  expect(screen.getByRole("link", { name: "Ver expansión" })).toHaveAttribute("href", expect.stringContaining("/sets/sm9"));
  await user.click(screen.getByRole("link", { name: "Volver a la expansión" }));
  expect(await screen.findByRole("link", { name: "Pikachu & Zekrom-GX" })).toBeVisible();
});

test("displays 8% for eight distinct entries and twelve physical copies independently of the page", async () => {
  setup(undefined, true);
  render(<App initialEntries={["/sets/sm9"]} />);
  const progress = await screen.findByRole("progressbar", { name: "Finalización de la expansión" });
  expect(progress).toHaveAttribute("value", "8");
  expect(screen.getByText("8 / 100 · 8%")).toBeVisible();
  expect(screen.getByText("92", { selector: "dd" })).toBeVisible();
  expect(screen.getByText("12", { selector: "dd" })).toBeVisible();
  expect(screen.getByText("3 copias propias")).toBeVisible();
});

test("requests Owned and Missing over the full set and resets checklist pagination", async () => {
  const request = setup((url) => url.pathname.endsWith("/sm9/progress") ? json(setCollectionPage({
    page: Number(url.searchParams.get("page") ?? 1),
    total: url.searchParams.get("ownership") === "missing" ? 92 : url.searchParams.get("ownership") === "owned" ? 8 : 100,
    results: url.searchParams.get("ownership") === "missing" ? [setCards[1]] : [setCards[0]],
    quantities: url.searchParams.get("ownership") === "missing" ? {} : { "sm9-33": 3 },
  })) : undefined, true);
  const user = userEvent.setup();
  render(<App initialEntries={["/sets/sm9?page=2"]} />);
  await screen.findByRole("progressbar");
  await user.selectOptions(screen.getByRole("combobox", { name: "Mi colección" }), "owned");
  await screen.findByText("Resultados: 8");
  expect(screen.getByText("8 / 100 · 8%")).toBeVisible();
  await user.selectOptions(screen.getByRole("combobox", { name: "Mi colección" }), "missing");
  expect(await screen.findByRole("link", { name: "Checklist card 2" })).toBeVisible();
  expect(screen.queryByText("3 copias propias")).not.toBeInTheDocument();
  const url = new URL(request.mock.calls.filter(([input]) => input.includes("/sm9/progress")).at(-1)![0]);
  expect(url.searchParams.get("ownership")).toBe("missing");
  expect(url.searchParams.get("page")).toBe("1");
});

function CurrentLocation() { const location = useLocation(); return <output aria-label="Current location">{location.pathname}{location.search}</output>; }

test("clears checklist search, sort and ownership in one URL update while preserving its return destination", async () => {
  const request = setup((url) => url.pathname.endsWith("/sm9/progress") ? json(setCollectionPage({
    page: Number(url.searchParams.get("page") ?? 1),
    total: url.searchParams.get("ownership") === "missing" ? 92 : 100,
    results: [setCards[0]], quantities: {},
  })) : undefined, true);
  const user = userEvent.setup();
  render(<LocaleProvider><AuthProvider><MemoryRouter initialEntries={["/sets/sm9?ownership=missing&q=33&sort=name&page=2&returnTo=%2Fsets%3Fpage%3D2"]}><AppRoutes /><CurrentLocation /></MemoryRouter></AuthProvider></LocaleProvider>);
  await screen.findByRole("progressbar");
  expect(screen.getByRole("combobox", { name: "Mi colección" })).toHaveValue("missing");
  expect(screen.getByRole("searchbox", { name: "Nombre o número de carta" })).toHaveValue("33");
  expect(screen.getByRole("combobox", { name: "Ordenar por" })).toHaveValue("name");
  const beforeClear = request.mock.calls.filter(([input]) => input.includes("/sm9/progress")).length;
  await user.click(screen.getByRole("button", { name: "Limpiar filtros" }));
  await screen.findByText("Resultados: 100");
  expect(screen.getByRole("combobox", { name: "Mi colección" })).toHaveValue("all");
  expect(screen.getByRole("searchbox", { name: "Nombre o número de carta" })).toHaveValue("");
  expect(screen.getByRole("combobox", { name: "Ordenar por" })).toHaveValue("number");
  const location = new URL(screen.getByLabelText("Current location").textContent!, "https://pokevault.test");
  expect(Object.fromEntries(location.searchParams)).toEqual({ page: "1", returnTo: "/sets?page=2" });
  const changes = request.mock.calls.filter(([input]) => input.includes("/sm9/progress")).slice(beforeClear);
  expect(changes).toHaveLength(1);
  expect(Object.fromEntries(new URL(changes[0][0]).searchParams)).toMatchObject({ ownership: "all", sort: "number", page: "1" });
});

test("never shows the public All checklist under a pending Missing filter", async () => {
  let finish!: (response: Response) => void;
  setup((url) => url.pathname.endsWith("/sm9/progress") ? new Promise<Response>((resolve) => { finish = resolve; }) : undefined, true);
  render(<App initialEntries={["/sets/sm9?ownership=missing"]} />);
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Mi colección" })).toHaveValue("missing"));
  expect(screen.queryByRole("link", { name: pikachuCard.name })).not.toBeInTheDocument();
  expect(screen.queryByText("Resultados: 100")).not.toBeInTheDocument();
  await act(async () => finish(json(setCollectionPage({ results: [setCards[1]], total: 92, quantities: {} }))));
  expect(await screen.findByRole("link", { name: "Checklist card 2" })).toBeVisible();
});

test("paginates and searches the checklist on the server without fetching every card detail", async () => {
  const request = setup((url) => url.pathname.endsWith("/sm9/cards") ? json(setCardPage({
    page: Number(url.searchParams.get("page") ?? 1),
    results: url.searchParams.get("page") === "2" ? [setCards[12]] : setCards.slice(0, 12),
  })) : undefined);
  const user = userEvent.setup();
  render(<App initialEntries={["/sets/sm9"]} />);
  await screen.findByRole("link", { name: pikachuCard.name });
  await user.click(screen.getByRole("link", { name: "Página siguiente" }));
  expect(await screen.findByRole("link", { name: "Checklist card 13" })).toBeVisible();
  expect(screen.queryByRole("link", { name: pikachuCard.name })).not.toBeInTheDocument();
  await user.type(screen.getByRole("searchbox", { name: "Nombre o número de carta" }), "33");
  await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));
  await screen.findByRole("link", { name: pikachuCard.name });
  const url = new URL(request.mock.calls.filter(([input]) => input.includes("/sm9/cards")).at(-1)![0]);
  expect(Object.fromEntries(url.searchParams)).toMatchObject({ page: "1", q: "33", sort: "number" });
  expect(request.mock.calls.some(([input]) => input.includes("/api/v1/cards/"))).toBe(false);
});

test("adds through the existing physical-copy form and refreshes quantity without inflating distinct completion", async () => {
  let quantity = 3;
  setup((url, options) => {
    if (url.pathname.endsWith("/sm9/progress")) return json(setCollectionPage({
      progress: { ...setProgress, physical_copies: 9 + quantity }, quantities: { "sm9-33": quantity }, results: [setCards[0]],
    }));
    if (url.pathname === "/api/v1/inventory" && options?.method === "POST") {
      expect(options.headers).toMatchObject({ "X-CSRF-Token": "csrf-test" });
      quantity += 1;
      return json({ id: "00000000-0000-4000-8000-000000000001", card_id: "sm9-33", ...JSON.parse(options.body as string),
        created_at: "2026-11-09T12:00:00Z", updated_at: "2026-11-09T12:00:00Z" }, 201);
    }
  }, true);
  const user = userEvent.setup();
  render(<App initialEntries={["/sets/sm9"]} />);
  await user.click(await screen.findByRole("button", { name: "Añadir a mi colección" }));
  await user.selectOptions(screen.getByLabelText("Idioma de la copia"), "ja");
  await user.click(screen.getByRole("button", { name: "Guardar copia" }));
  expect(await screen.findByText("4 copias propias")).toBeVisible();
  expect(screen.getByText("8 / 100 · 8%")).toBeVisible();
  expect(screen.getByText("13", { selector: "dd" })).toBeVisible();
});

test("protects an open copy draft from another add, filter or pagination change", async () => {
  setup(undefined, true);
  const user = userEvent.setup();
  render(<App initialEntries={["/sets/sm9"]} />);
  await screen.findByRole("progressbar");
  const rows = within(screen.getByRole("list", { name: "Lista de cartas" })).getAllByRole("listitem");
  await user.click(within(rows[0]).getByRole("button", { name: "Añadir a mi colección" }));
  await user.type(screen.getByLabelText("Notas personales"), "Keep my draft");
  expect(within(rows[1]).getByRole("button", { name: "Añadir a mi colección" })).toBeDisabled();
  expect(screen.getByRole("combobox", { name: "Mi colección" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Aplicar filtros" })).toBeDisabled();
  expect(screen.queryByRole("link", { name: "Página siguiente" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("Notas personales")).toHaveValue("Keep my draft");
  await user.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(within(rows[1]).getByRole("button", { name: "Añadir a mi colección" })).toBeEnabled();
  expect(screen.getByRole("link", { name: "Página siguiente" })).toBeVisible();
});

function HistoryBack() { const navigate = useNavigate(); return <button type="button" onClick={() => navigate(-1)}>History back</button>; }

test("releases the editor lock after browser history restores a different checklist page", async () => {
  setup((url) => url.pathname.endsWith("/sm9/progress") ? json(setCollectionPage({
    page: Number(url.searchParams.get("page") ?? 1), results: url.searchParams.get("page") === "2" ? [setCards[12]] : [setCards[0]], quantities: {},
  })) : undefined, true);
  const user = userEvent.setup();
  render(<LocaleProvider><AuthProvider><MemoryRouter initialEntries={["/sets/sm9"]}><AppRoutes /><HistoryBack /></MemoryRouter></AuthProvider></LocaleProvider>);
  await screen.findByRole("progressbar");
  await user.click(screen.getByRole("link", { name: "Página siguiente" }));
  await screen.findByRole("link", { name: "Checklist card 13" });
  await user.click(screen.getByRole("button", { name: "Añadir a mi colección" }));
  await user.click(screen.getByRole("button", { name: "History back" }));
  await screen.findByRole("link", { name: pikachuCard.name });
  expect(screen.getByRole("button", { name: "Añadir a mi colección" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Aplicar filtros" })).toBeEnabled();
  expect(screen.getByRole("link", { name: "Página siguiente" })).toBeVisible();
});

test("refreshes missing entry and whole-set progress after adding on existing card details and returning", async () => {
  let added = false;
  setup((url, options) => {
    if (url.pathname.endsWith("/sm9/progress")) return json(setCollectionPage({ results: [setCards[0]],
      progress: { ...setProgress, owned: added ? 9 : 8, missing: added ? 91 : 92, physical_copies: added ? 13 : 12, percentage: added ? 9 : 8 },
      quantities: added ? { "sm9-33": 1 } : {},
    }));
    if (url.pathname === "/api/v1/inventory" && options?.method === "POST") {
      added = true;
      return json({ id: "00000000-0000-4000-8000-000000000001", ...JSON.parse(options.body as string),
        created_at: "2026-11-09T12:00:00Z", updated_at: "2026-11-09T12:00:00Z" }, 201);
    }
  }, true);
  const user = userEvent.setup();
  render(<App initialEntries={["/sets/sm9"]} />);
  await user.click(await screen.findByRole("link", { name: pikachuCard.name }));
  await user.click(await screen.findByRole("button", { name: "Añadir a mi colección" }));
  await user.click(screen.getByRole("button", { name: "Guardar copia" }));
  await screen.findByText("Copia añadida a tu colección.");
  await user.click(screen.getByRole("link", { name: "Volver a la expansión" }));
  expect(await screen.findByText("9 / 100 · 9%")).toBeVisible();
  expect(screen.getByText("1 copias propias")).toBeVisible();
});

test("hides and aborts private progress immediately during session validation and ignores the old account response", async () => {
  let validating = false;
  let resolveSession!: (response: Response) => void;
  let finishProgress!: (response: Response) => void;
  let privateSignal: AbortSignal | undefined;
  setup((url, options) => {
    if (url.pathname.endsWith("/auth/me") && validating) return new Promise<Response>((resolve) => { resolveSession = resolve; });
    if (url.pathname.endsWith("/sm9/progress")) {
      privateSignal = options?.signal as AbortSignal;
      return new Promise<Response>((resolve) => { finishProgress = resolve; });
    }
  }, true);
  render(<App initialEntries={["/sets/sm9"]} />);
  await waitFor(() => expect(finishProgress).toBeTypeOf("function"));
  validating = true;
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(privateSignal?.aborted).toBe(true);
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  expect(await screen.findByRole("link", { name: pikachuCard.name })).toBeVisible();
  await act(async () => resolveSession(json({}, 401)));
  await act(async () => finishProgress(json(setCollectionPage())));
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  expect(screen.queryByText("3 copias propias")).not.toBeInTheDocument();
});

test("discards loaded ownership badges while switching accounts and reads fresh progress", async () => {
  let switched = false;
  setup((url) => {
    if (url.pathname.endsWith("/auth/me")) return json(switched ? { ...setSession, user: { ...setSession.user, id: "misty" } } : setSession);
    if (url.pathname.endsWith("/sm9/progress")) return json(setCollectionPage(switched ? {
      progress: { ...setProgress, owned: 0, missing: 100, physical_copies: 0, percentage: 0 }, quantities: {},
    } : {}));
  }, true);
  render(<App initialEntries={["/sets/sm9"]} />);
  await screen.findByText("3 copias propias");
  switched = true;
  fireEvent.focus(window);
  expect(screen.queryByText("3 copias propias")).not.toBeInTheDocument();
  expect(await screen.findByText("0 / 100 · 0%")).toBeVisible();
  expect(screen.queryByText("3 copias propias")).not.toBeInTheDocument();
});

test("aborts a pending physical-copy save and ignores its result after switching accounts", async () => {
  let switched = false;
  let finishSave!: (response: Response) => void;
  let saveSignal: AbortSignal | undefined;
  setup((url, options) => {
    if (url.pathname.endsWith("/auth/me")) return json(switched ? { ...setSession, user: { ...setSession.user, id: "misty" } } : setSession);
    if (url.pathname.endsWith("/sm9/progress")) return json(setCollectionPage({ results: [setCards[0]], ...(switched ? {
      progress: { ...setProgress, owned: 0, missing: 100, physical_copies: 0, percentage: 0 }, quantities: {},
    } : {}) }));
    if (url.pathname === "/api/v1/inventory" && options?.method === "POST") {
      saveSignal = options.signal as AbortSignal;
      return new Promise<Response>((resolve) => { finishSave = resolve; });
    }
  }, true);
  const user = userEvent.setup();
  render(<App initialEntries={["/sets/sm9"]} />);
  await user.click(await screen.findByRole("button", { name: "Añadir a mi colección" }));
  await user.click(screen.getByRole("button", { name: "Guardar copia" }));
  expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled();
  switched = true;
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(saveSignal?.aborted).toBe(true);
  expect(await screen.findByText("0 / 100 · 0%")).toBeVisible();
  await act(async () => finishSave(json({ id: "00000000-0000-4000-8000-000000000001", card_id: "sm9-33", condition: "unknown", language: "en", variant: "unknown", notes: "", acquired_on: null,
    created_at: "2026-11-09T12:00:00Z", updated_at: "2026-11-09T12:00:00Z" }, 201)));
  expect(screen.getByText("0 / 100 · 0%")).toBeVisible();
  expect(screen.queryByText("Copia añadida a tu colección.")).not.toBeInTheDocument();
});

test("reads fresh persistent progress after deleting the last copy in existing inventory and revisiting the expansion", async () => {
  let removed = false;
  const copy = { id: "00000000-0000-4000-8000-000000000001", card_id: "sm9-33", condition: "played", language: "ja", variant: "reverse", acquired_on: null, notes: "Last owned copy",
    created_at: "2026-11-09T12:00:00Z", updated_at: "2026-11-09T12:00:00Z" };
  setup((url, options) => {
    if (url.pathname.endsWith("/sm9/progress")) return json(setCollectionPage({ results: [setCards[0]],
      progress: { ...setProgress, owned: removed ? 0 : 1, missing: removed ? 100 : 99, physical_copies: removed ? 0 : 1, percentage: removed ? 0 : 1 }, quantities: removed ? {} : { "sm9-33": 1 },
    }));
    if (url.pathname.startsWith("/api/v1/inventory") && options?.method === "DELETE") { removed = true; return new Response(null, { status: 204 }); }
    if (url.pathname === "/api/v1/inventory") return json({ results: removed ? [] : [copy], total: removed ? 0 : 1, quantities: removed ? {} : { "sm9-33": 1 }, offset: 0, limit: 24 });
  }, true);
  const user = userEvent.setup();
  const view = render(<App initialEntries={["/sets/sm9"]} />);
  expect(await screen.findByText("1 / 100 · 1%")).toBeVisible();
  await user.click(screen.getByRole("link", { name: "Gestionar mis copias" }));
  const row = (await screen.findByText("Last owned copy")).closest("li")!;
  await user.click(within(row).getByRole("button", { name: "Eliminar copia" }));
  await user.click(screen.getByRole("button", { name: "Confirmar eliminación" }));
  await screen.findByText("Tu colección está vacía. Explora el catálogo y añade tu primera carta.");
  await user.click(screen.getByRole("link", { name: "Expansiones" }));
  await user.click(await screen.findByRole("link", { name: "Team Up" }));
  expect(await screen.findByText("0 / 100 · 0%")).toBeVisible();
  expect(screen.getByText("0 copias propias")).toBeVisible();
  view.unmount();
  render(<App initialEntries={["/sets/sm9"]} />);
  expect(await screen.findByText("0 / 100 · 0%")).toBeVisible();
});

test("revalidates an expired private session while keeping the public checklist accessible", async () => {
  let checks = 0;
  setup((url) => {
    if (url.pathname.endsWith("/auth/me")) return ++checks === 1 ? json(setSession) : json({}, 401);
    if (url.pathname.endsWith("/sm9/progress")) return json({}, 401);
  }, true);
  render(<App initialEntries={["/sets/sm9"]} />);
  expect(await screen.findByRole("link", { name: "Inicia sesión para ver tus cartas propias y faltantes." })).toBeVisible();
  expect(await screen.findByRole("link", { name: pikachuCard.name })).toBeVisible();
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
});

test("withholds progress when private and public checklist revisions disagree", async () => {
  setup((url) => url.pathname.endsWith("/sm9/progress") ? json(setCollectionPage({
    set: { ...setDetail, checklist_revision: "b".repeat(64) }, progress: { ...setProgress, checklist_revision: "b".repeat(64) },
  })) : undefined, true);
  render(<App initialEntries={["/sets/sm9"]} />);
  expect(await screen.findByText("No se pudo cargar tu finalización.")).toBeVisible();
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  expect(await screen.findByRole("link", { name: pikachuCard.name })).toBeVisible();
});

test("uses one no-store private explorer batch and clears badges while revalidating", async () => {
  let revalidating = false;
  let finish!: (response: Response) => void;
  const request = setup((url) => url.pathname.endsWith("/auth/me") && revalidating
    ? new Promise<Response>((resolve) => { finish = resolve; }) : undefined, true);
  render(<App initialEntries={["/sets"]} />);
  expect(await screen.findByText("8 / 100 · 8%")).toBeVisible();
  const batchCalls = request.mock.calls.filter(([input]) => new URL(input).pathname === "/api/v1/sets/progress");
  expect(batchCalls).toHaveLength(1);
  expect(new URL(batchCalls[0][0]).searchParams.getAll("set_id")).toEqual(["sm9"]);
  expect(batchCalls[0][1]).toMatchObject({ credentials: "include", cache: "no-store" });
  revalidating = true;
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(screen.queryByText("8 / 100 · 8%")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Team Up" })).toBeVisible();
  await act(async () => finish(json({}, 401)));
});

test.each(["incomplete", "empty"])("shows explicit %s coverage without a percentage or enabled ownership filter", async (status) => {
  const metadata = { ...setDetail, checklist_status: status, checklist_size: 0, checklist_revision: null };
  setup((url) => {
    if (url.pathname === "/api/v1/sets/sm9") return json(metadata);
    if (url.pathname.endsWith("/sm9/progress")) return json(setCollectionPage({ set: metadata, results: [], total: 0, quantities: {},
      progress: { ...setProgress, checklist_revision: null, status, total: status === "empty" ? 0 : null, owned: status === "empty" ? 0 : null,
        missing: status === "empty" ? 0 : null, physical_copies: status === "empty" ? 0 : null, percentage: null },
    }));
  }, true);
  render(<App initialEntries={["/sets/sm9"]} />);
  await screen.findByText(status === "empty" ? "Esta expansión no contiene cartas verificadas." : "La lista del proveedor está incompleta. La finalización no está disponible.");
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Mi colección" })).toBeDisabled();
});

test("keeps the public checklist usable when private progress fails and retries it", async () => {
  let failed = true;
  setup((url) => url.pathname.endsWith("/sm9/progress") && failed ? json({}, 503) : undefined, true);
  const user = userEvent.setup();
  render(<App initialEntries={["/sets/sm9"]} />);
  expect(await screen.findByText("No se pudo cargar tu finalización.")).toBeVisible();
  expect(await screen.findByRole("link", { name: pikachuCard.name })).toBeVisible();
  failed = false;
  await user.click(screen.getByRole("button", { name: "Reintentar finalización" }));
  expect(await screen.findByRole("progressbar")).toHaveAttribute("value", "8");
});

test("shows translated provider fallback and preserves canonical progress across ES and EN", async () => {
  const request = setup(undefined, true);
  const user = userEvent.setup();
  render(<App initialEntries={["/sets/sm9"]} />);
  expect(await screen.findByText("Metadatos de expansión disponibles en inglés.")).toBeVisible();
  await screen.findByText("8 / 100 · 8%");
  await user.click(screen.getByRole("button", { name: "English" }));
  expect(await screen.findByRole("heading", { name: "Team Up" })).toBeVisible();
  expect(await screen.findByText("8 / 100 · 8%")).toBeVisible();
  expect(screen.getByRole("combobox", { name: "My collection" })).toBeEnabled();
  expect(request.mock.calls.filter(([input]) => input.includes("/sm9/progress")).at(-1)![0]).toContain("language=en");
});

test("renders loading, empty and retryable errors without leaking provider details", async () => {
  let fail = true;
  setup((url) => url.pathname === "/api/v1/sets" ? fail ? json({ detail: "secret" }, 503) : json(setPage({ results: [], total: 0 })) : undefined);
  const user = userEvent.setup();
  render(<App initialEntries={["/sets"]} />);
  expect(screen.getByText("Cargando expansiones…")).toBeVisible();
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar las expansiones.");
  expect(screen.queryByText(/secret/)).not.toBeInTheDocument();
  fail = false;
  await user.click(screen.getByRole("button", { name: "Reintentar expansiones" }));
  expect(await screen.findByText("No hay expansiones para estos filtros.")).toBeVisible();
});

test("rejects invalid set IDs locally and handles missing set metadata", async () => {
  const request = setup();
  const view = render(<App initialEntries={["/sets/invalid_id"]} />);
  expect(screen.getByRole("alert")).toHaveTextContent("El identificador de expansión no es válido.");
  expect(request.mock.calls.some(([input]) => input.includes("/sets/"))).toBe(false);
  view.unmount();
  setup((url) => url.pathname === "/api/v1/sets/unknown" ? json({}, 404) : undefined);
  render(<App initialEntries={["/sets/unknown"]} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("No se encontró esta expansión.");
});

test("ignores stale public explorer responses after keyboard submission of new filters", async () => {
  let finish!: (response: Response) => void;
  let oldSignal: AbortSignal | undefined;
  setup((url, options) => {
    if (url.pathname !== "/api/v1/sets") return;
    if (url.searchParams.get("q") === "sv03.5") return json(setPage({ results: [{ ...setSummary, id: "sv03.5", name: "151" }] }));
    oldSignal = options?.signal as AbortSignal;
    return new Promise<Response>((resolve) => { finish = resolve; });
  });
  const user = userEvent.setup();
  render(<App initialEntries={["/sets"]} />);
  await user.type(screen.getByRole("searchbox", { name: "Nombre o ID de expansión" }), "sv03.5{Enter}");
  expect(await screen.findByRole("link", { name: "151" })).toBeVisible();
  expect(oldSignal?.aborted).toBe(true);
  await act(async () => finish(json(setPage())));
  expect(screen.queryByRole("link", { name: "Team Up" })).not.toBeInTheDocument();
});
