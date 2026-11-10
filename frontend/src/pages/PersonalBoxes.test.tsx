import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "../app/App";
import { bulbasaurCard, pikachuCard, jsonResponse as json } from "../test/tcgFixtures";

const id = "00000000-0000-4000-8000-000000000001";
const second = "00000000-0000-4000-8000-000000000002";
const copyId = "00000000-0000-4000-8000-000000000003";
const copy = { id: copyId, card_id: bulbasaurCard.id, condition: "near_mint", language: "ja", variant: "holo", acquired_on: "2026-10-01", notes: "Birthday gift", created_at: "2026-11-07T12:00:00Z", updated_at: "2026-11-07T12:00:00Z" };
const box = { id, name: "Favorites", display_order: 0, wallpaper: "forest", copy_count: 1, created_at: copy.created_at, updated_at: copy.updated_at };
const session = { user: { id: "ash", display_name: "Ash", email: null, email_verified: true, picture_url: null }, csrf_token: "csrf" };
afterEach(() => vi.unstubAllGlobals());

function setup(override?: (url: URL, options?: RequestInit) => Response | Promise<Response> | undefined) {
  const request = vi.fn(async (input: string, options?: RequestInit) => {
    const url = new URL(input); const custom = override?.(url, options); if (custom) return custom;
    if (url.pathname.endsWith("/auth/me")) return json(session);
    if (url.pathname.includes("/cards/")) return json(bulbasaurCard);
    if (url.pathname.endsWith("/boxes")) return json({ results: [box], total: 1 });
    if (url.pathname.includes("/views/")) return json({ results: [copy], total: 1, offset: 0, limit: 30 });
    return json({ ...box, slots: [{ position: 0, copy }] });
  }); vi.stubGlobal("fetch", request); return request;
}

test("offers personal boxes without removing the public catalog and guards signed-out data", async () => {
  setup((url) => url.pathname.endsWith("/auth/me") ? json({}, 401) : undefined);
  const user = userEvent.setup(); render(<App initialEntries={["/boxes?mode=personal"]} />);
  expect(await screen.findByRole("link", { name: "Iniciar sesión" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Catálogo público" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "English" }));
  expect(screen.getByRole("button", { name: "My boxes" })).toBeVisible();
});

test("renders 30 navigable positions and physical identity with direct copy and printing links", async () => {
  const request = setup(); const user = userEvent.setup(); render(<App initialEntries={["/boxes?mode=personal"]} />);
  const grid = await screen.findByRole("grid");
  await screen.findByText("Birthday gift");
  expect(within(grid).getAllByRole("gridcell")).toHaveLength(30);
  expect(screen.getByRole("link", { name: "Editar copia" })).toHaveAttribute("href", `/collection/${copyId}`);
  expect(screen.getByRole("link", { name: "Ver impresión" })).toHaveAttribute("href", `/cards/${copy.card_id}`);
  expect(screen.getByText(copyId)).toBeVisible();
  const slot = within(grid).getAllByRole("button")[0]; slot.focus(); await user.keyboard("{ArrowDown}");
  expect(within(grid).getAllByRole("button")[6]).toHaveFocus();
  expect(screen.getByText("Espacio vacío 7")).toBeVisible();
  expect(request.mock.calls.filter(([url]) => String(url).includes("/cards/"))).toHaveLength(1);
});

test("creates, renames, reorders and confirms box deletion while retaining inventory", async () => {
  let boxes = [box]; let name = box.name; const calls: { method?: string; path: string; body: unknown }[] = [];
  setup((url, options) => {
    if (options?.method) {
      calls.push({ method: options.method, path: url.pathname, body: options.body ? JSON.parse(String(options.body)) : null });
      if (options.method === "POST") { boxes = [...boxes, { ...box, id: second, name: "New box", display_order: 1, copy_count: 0 }]; return json(boxes[1], 201); }
      if (url.pathname.endsWith("/order")) { boxes = [...boxes].reverse().map((b, i) => ({ ...b, display_order: i })); return json({ results: boxes, total: boxes.length }); }
      if (options.method === "DELETE") { boxes = boxes.filter((b) => b.id !== id); return new Response(null, { status: 204 }); }
      name = JSON.parse(String(options.body)).name; boxes = boxes.map((b) => b.id === id ? { ...b, name } : b); return json({ ...box, name });
    }
    if (url.pathname.endsWith("/boxes")) return json({ results: boxes, total: boxes.length });
    if (url.pathname.endsWith(id)) return json({ ...box, name, slots: [{ position: 0, copy }] });
    if (url.pathname.endsWith(second)) return json({ ...boxes.find((b) => b.id === second), slots: [] });
  });
  const user = userEvent.setup(); render(<App initialEntries={["/boxes?mode=personal"]} />); await screen.findByText("Birthday gift");
  await user.type(screen.getByLabelText("Nombre de nueva caja"), "New box"); await user.click(screen.getByRole("button", { name: "Crear caja" }));
  await waitFor(() => expect(screen.getByRole("option", { name: "New box" })).toBeInTheDocument());
  await user.selectOptions(screen.getByLabelText("Elegir caja"), id);
  await user.clear(screen.getByLabelText("Nombre de caja")); await user.type(screen.getByLabelText("Nombre de caja"), "Treasures");
  await user.click(screen.getByRole("button", { name: "Guardar caja" })); await screen.findByRole("heading", { name: "Treasures" });
  await user.click(screen.getByRole("button", { name: "Mover caja después" }));
  await waitFor(() => expect(calls.some((c) => c.path.endsWith("/order"))).toBe(true));
  await user.click(await screen.findByRole("button", { name: "Eliminar caja" }));
  expect(screen.getByText("Las copias permanecen en tu colección." )).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Confirmar eliminación de caja" }));
  await waitFor(() => expect(screen.queryByRole("option", { name: "Treasures" })).not.toBeInTheDocument());
  expect(calls.find((c) => c.path.endsWith("/order"))?.body).toEqual({ box_ids: [second, id] });
  expect(calls.every((c) => !c.path.includes("inventory"))).toBe(true);
});

test("places only an unassigned owned copy and uses expected UUID on removal", async () => {
  let occupied = false; const mutations: { path: string; search: string; body: unknown }[] = [];
  setup((url, options) => {
    if (options?.method) { mutations.push({ path: url.pathname, search: url.search, body: options.body ? JSON.parse(String(options.body)) : null }); occupied = options.method === "PUT"; return occupied ? json({ ...box, slots: [{ position: 0, copy }] }) : new Response(null, { status: 204 }); }
    if (url.pathname.endsWith(id)) return json({ ...box, copy_count: occupied ? 1 : 0, slots: occupied ? [{ position: 0, copy }] : [] });
  });
  const user = userEvent.setup(); render(<App initialEntries={["/boxes?mode=personal"]} />);
  await user.click(await screen.findByRole("button", { name: "Colocar copia aquí" }));
  await user.click(await screen.findByRole("button", { name: /Colocar.*000000000003/ }));
  await screen.findByText("Birthday gift");
  expect(mutations[0].body).toEqual({ copy_id: copyId });
  expect(within(screen.getByRole("grid")).getAllByRole("button")[0]).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Quitar de la caja" }));
  await waitFor(() => expect(screen.queryByText("Birthday gift")).not.toBeInTheDocument());
  expect(mutations[1].search).toBe(`?copy_id=${copyId}`);
});

test("shows conflict and refetches persisted placement, preserving physical identity when metadata fails", async () => {
  let detailReads = 0;
  setup((url, options) => {
    if (url.pathname.includes("/cards/")) return json({}, 503);
    if (options?.method === "PUT") return json({}, 409);
    if (url.pathname.endsWith(id)) { detailReads++; return json({ ...box, slots: [{ position: 0, copy }] }); }
  });
  const user = userEvent.setup(); render(<App initialEntries={["/boxes?mode=personal"]} />);
  await screen.findByText("Birthday gift");
  await user.click(screen.getByRole("button", { name: "Mover copia" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("La caja cambió");
  await waitFor(() => expect(detailReads).toBeGreaterThan(1));
  expect(screen.getByText(copyId)).toBeVisible();
});

test("read-only views group the current page without inventing a primary species or generation", async () => {
  setup((url) => url.pathname.includes("/cards/") ? json(pikachuCard) : url.pathname.includes("/views/") ? json({ results: [{ ...copy, card_id: pikachuCard.id }], total: 31, offset: 0, limit: 30 }) : undefined);
  const user = userEvent.setup(); render(<App initialEntries={["/boxes?mode=personal"]} />);
  await user.selectOptions(await screen.findByLabelText("Vista de copias"), "owned");
  await user.click(screen.getByRole("checkbox", { name: "Agrupar esta página por generación" }));
  expect(await screen.findByRole("heading", { name: "Varias generaciones" })).toBeVisible();
  expect(screen.getByText("#25, #644")).toBeVisible();
  expect(screen.getByText("Agrupación de esta página; no representa toda la colección." )).toBeVisible();
  expect(screen.queryByRole("button", { name: "Mover copia" })).not.toBeInTheDocument();
});

test("aborts and hides private boxes immediately during account validation and ignores late responses", async () => {
  let validating = false; let finish!: (r: Response) => void; let boxSignal: AbortSignal | undefined;
  setup((url, options) => {
    if (url.pathname.endsWith("/auth/me") && validating) return new Promise<Response>((r) => { finish = r; });
    if (url.pathname.endsWith(id)) boxSignal = options?.signal as AbortSignal;
  });
  render(<App initialEntries={["/boxes?mode=personal"]} />); await screen.findByText("Birthday gift");
  validating = true; await act(async () => window.dispatchEvent(new Event("focus")));
  expect(screen.queryByText("Birthday gift")).not.toBeInTheDocument(); expect(boxSignal?.aborted).toBe(true);
  await act(async () => finish(json({}, 401)));
  expect(await screen.findByRole("link", { name: "Iniciar sesión" })).toBeVisible();
  expect(localStorage.getItem("pokevault.boxes")).toBeNull();
});

test("keeps duplicate physical copies independently selectable and requests each visible printing once", async () => {
  const duplicate = { ...copy, id: "00000000-0000-4000-8000-000000000004", language: "en", notes: "Second physical copy" };
  const request = setup((url) => url.pathname.endsWith(id) ? json({ ...box, copy_count: 2, slots: [{ position: 0, copy }, { position: 29, copy: duplicate }] }) : undefined);
  const user = userEvent.setup(); render(<App initialEntries={["/boxes?mode=personal"]} />);
  await screen.findByRole("heading", { name: "Bulbasaur" });
  const grid = screen.getByRole("grid");
  await user.click(within(grid).getByRole("button", { name: new RegExp(duplicate.id) }));
  expect(screen.getByText("Second physical copy")).toBeVisible();
  expect(screen.getByText(duplicate.id)).toBeVisible();
  expect(screen.getByRole("link", { name: "Editar copia" })).toHaveAttribute("href", `/collection/${duplicate.id}`);
  expect(request.mock.calls.filter(([url]) => String(url).includes("/cards/"))).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "English" }));
  expect(screen.getByRole("button", { name: "Move copy" })).toBeVisible();
  expect(screen.getByText("Copy UUID")).toBeVisible();
});

test("represents Trainer and Energy explicitly without assigning species or generation", async () => {
  const trainer = { ...bulbasaurCard, id: "base1-88", category: "Trainer", dex_ids: [], name: "Professor Oak" };
  const energy = { ...bulbasaurCard, id: "base1-99", category: "Energy", dex_ids: [], name: "Grass Energy" };
  setup((url) => {
    if (url.pathname.includes("/cards/")) return json(url.pathname.endsWith(trainer.id) ? trainer : energy);
    if (url.pathname.includes("/views/")) return json({ results: [{ ...copy, card_id: trainer.id }, { ...copy, id: second, card_id: energy.id }], total: 2, offset: 0, limit: 30 });
  });
  const user = userEvent.setup(); render(<App initialEntries={["/boxes?mode=personal"]} />);
  await user.selectOptions(await screen.findByLabelText("Vista de copias"), "unassigned");
  await screen.findByRole("heading", { name: "Professor Oak" });
  await user.click(screen.getByRole("checkbox", { name: "Agrupar esta página por generación" }));
  expect(screen.getByRole("heading", { name: "Entrenador" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Energía" })).toBeVisible();
  expect(screen.queryByText("Generación 1")).not.toBeInTheDocument();
  expect(screen.getAllByRole("gridcell")).toHaveLength(30);
});

test("paginates the unassigned picker using bounded offsets and moves to an explicit destination position", async () => {
  let viewReads = 0; let moved = false; let destination: unknown;
  setup((url, options) => {
    if (url.pathname.endsWith("/boxes")) return json({ results: [box, { ...box, id: second, name: "Ocean", display_order: 1, copy_count: 0 }], total: 2 });
    if (options?.method === "PUT") { destination = { path: url.pathname, body: JSON.parse(String(options.body)) }; moved = true; return json({ ...box, id: second, name: "Ocean", slots: [{ position: 29, copy }] }); }
    if (url.pathname.includes("/views/unassigned")) { viewReads++; const offset = Number(url.searchParams.get("offset")); return json({ results: [copy], total: 31, offset, limit: 30 }); }
    if (url.pathname.endsWith(second)) return json({ ...box, id: second, name: "Ocean", copy_count: moved ? 1 : 0, slots: moved ? [{ position: 29, copy }] : [] });
  });
  const user = userEvent.setup(); render(<App initialEntries={["/boxes?mode=personal"]} />); await screen.findByText("Birthday gift");
  await user.selectOptions(screen.getByLabelText("Caja de destino"), second);
  await user.clear(screen.getByLabelText("Espacio de destino (1–30)")); await user.type(screen.getByLabelText("Espacio de destino (1–30)"), "30");
  await user.click(screen.getByRole("button", { name: "Mover copia" }));
  await screen.findByRole("heading", { name: "Ocean" });
  expect(destination).toEqual({ path: `/api/v1/boxes/${second}/slots/29`, body: { copy_id: copyId } });
  await user.click(within(screen.getByRole("grid")).getAllByRole("button")[0]);
  await user.click(screen.getByRole("button", { name: "Colocar copia aquí" }));
  await screen.findByText("Copias disponibles: 31");
  await user.click(screen.getByRole("button", { name: "Página siguiente" }));
  await waitFor(() => expect(viewReads).toBe(2));
});

test("ignores an obsolete box response after switching accounts", async () => {
  let switched = false; let finishDetail!: (r: Response) => void; let oldSignal: AbortSignal | undefined;
  setup((url, options) => {
    if (url.pathname.endsWith("/auth/me")) return json(switched ? { ...session, user: { ...session.user, id: "misty", display_name: "Misty" } } : session);
    if (url.pathname.endsWith("/boxes") && switched) return json({ results: [], total: 0 });
    if (url.pathname.endsWith(id)) { oldSignal = options?.signal as AbortSignal; return new Promise<Response>((resolve) => { finishDetail = resolve; }); }
  });
  render(<App initialEntries={["/boxes?mode=personal"]} />);
  await waitFor(() => expect(finishDetail).toBeTypeOf("function"));
  switched = true; await act(async () => window.dispatchEvent(new Event("focus")));
  expect(await screen.findByText("Aún no tienes cajas. Crea tu primera caja.")).toBeVisible();
  expect(oldSignal?.aborted).toBe(true);
  await act(async () => finishDetail(json({ ...box, slots: [{ position: 0, copy }] })));
  expect(screen.queryByText("Birthday gift")).not.toBeInTheDocument();
  expect(screen.queryByRole("grid")).not.toBeInTheDocument();
});

test("preserves the public catalog box, selected species and wallpaper across mode switching", async () => {
  setup((url) => {
    if (url.pathname === "/api/v1/pokemon") return json({ results: Array.from({ length: 30 }, (_, i) => ({ national_dex_number: i + 61, name: `pokemon-${i + 61}`, types: ["grass"], sprite_url: null })) });
    if (/\/pokemon\/\d+$/.test(url.pathname)) return json({}, 503);
  });
  const user = userEvent.setup(); render(<App initialEntries={["/boxes?box=3&pokemon=62&wallpaper=ocean"]} />);
  expect(await screen.findByRole("heading", { name: "Pokemon-62" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Mis cajas" }));
  await screen.findByText("Birthday gift");
  await user.click(screen.getByRole("button", { name: "Catálogo público" }));
  expect(await screen.findByRole("heading", { name: "Pokemon-62" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Caja 03" }).closest("section")).toHaveClass("pc-wallpaper--ocean");
});

test("shows a zero range for an empty derived view", async () => {
  setup((url) => url.pathname.includes("/views/") ? json({ results: [], total: 0, offset: 0, limit: 30 }) : undefined);
  const user = userEvent.setup(); render(<App initialEntries={["/boxes?mode=personal"]} />);
  await user.selectOptions(await screen.findByLabelText("Vista de copias"), "owned");
  await screen.findByText("No hay copias en esta vista.");
  expect(screen.getByText("0 / 0")).toBeVisible();
});

test("aborts a pending placement during session validation and ignores its late response after an account switch", async () => {
  let validating = false; let switched = false;
  let finishSession!: (r: Response) => void; let finishMove!: (r: Response) => void;
  let mutationSignal: AbortSignal | undefined;
  const otherBox = { ...box, id: second, name: "Misty's box", copy_count: 0 };
  const request = setup((url, options) => {
    if (url.pathname.endsWith("/auth/me") && validating) return new Promise<Response>((resolve) => { finishSession = resolve; });
    if (options?.method === "PUT") { mutationSignal = options.signal as AbortSignal; return new Promise<Response>((resolve) => { finishMove = resolve; }); }
    if (url.pathname.endsWith("/boxes") && switched) return json({ results: [otherBox], total: 1 });
    if (url.pathname.endsWith(second)) return json({ ...otherBox, slots: [] });
  });
  const user = userEvent.setup(); render(<App initialEntries={["/boxes?mode=personal"]} />);
  await screen.findByText("Birthday gift");
  await user.click(screen.getByRole("button", { name: "Mover copia" }));
  await waitFor(() => expect(finishMove).toBeTypeOf("function"));
  validating = true; await act(async () => window.dispatchEvent(new Event("focus")));
  expect(mutationSignal?.aborted).toBe(true);
  expect(screen.queryByText("Birthday gift")).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Favorites" })).not.toBeInTheDocument();
  switched = true;
  await act(async () => finishSession(json({ ...session, user: { ...session.user, id: "misty", display_name: "Misty" } })));
  expect(await screen.findByRole("heading", { name: "Misty's box" })).toBeVisible();
  const privateReadsBeforeLateResponse = request.mock.calls.filter(([url]) => String(url).includes("/boxes")).length;
  await act(async () => finishMove(json({ ...box, slots: [{ position: 0, copy }] })));
  expect(screen.queryByText("Birthday gift")).not.toBeInTheDocument();
  expect(screen.queryByText(copyId)).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Favorites" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Misty's box" })).toBeVisible();
  expect(request.mock.calls.filter(([url]) => String(url).includes("/boxes"))).toHaveLength(privateReadsBeforeLateResponse);
});
