import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "../app/App";
import { pikachuCard, jsonResponse as json } from "../test/tcgFixtures";

const profile = { id: "ash", display_name: "Ash", email: null, email_verified: true, picture_url: null };
const session = { user: profile, csrf_token: "csrf-test" };
const copy = { id: "00000000-0000-4000-8000-000000000001", card_id: pikachuCard.id,
  condition: "near_mint", language: "ja", variant: "holo", acquired_on: "2026-10-01", notes: "My first copy",
  created_at: "2026-11-07T12:00:00Z", updated_at: "2026-11-07T12:00:00Z" };
const page = (results: unknown[]) => ({ results, total: results.length, quantities: results.length ? { [pikachuCard.id]: results.length } : {}, offset: 0, limit: 24 });
afterEach(() => vi.unstubAllGlobals());

test("adds a physical copy from card details and displays it after navigating to collection", async () => {
  let saved = false;
  vi.stubGlobal("fetch", vi.fn(async (input: string, options?: RequestInit) => {
    const url = new URL(input);
    if (url.pathname.endsWith("/auth/me")) return json(session);
    if (url.pathname.includes("/cards/")) return json(pikachuCard);
    if (options?.method === "POST") {
      expect(options.credentials).toBe("include");
      expect(options.headers).toMatchObject({ "X-CSRF-Token": "csrf-test" });
      expect(JSON.parse(options.body as string)).toMatchObject({ card_id: pikachuCard.id, language: "ja", notes: "Birthday gift" });
      saved = true;
      return json(copy, 201);
    }
    return json(page(saved ? [copy] : []));
  }));
  const user = userEvent.setup();
  render(<App initialEntries={[`/cards/${pikachuCard.id}`]} />);
  await user.click(await screen.findByRole("button", { name: "Añadir a mi colección" }));
  await user.selectOptions(screen.getByLabelText("Idioma de la copia"), "ja");
  await user.type(screen.getByLabelText("Notas personales"), "Birthday gift");
  await user.click(screen.getByRole("button", { name: "Guardar copia" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Copia añadida");
  await user.click(screen.getByRole("link", { name: "Mi colección" }));
  expect(await screen.findByText("My first copy")).toBeVisible();
  expect(screen.getByRole("heading", { name: "Pikachu & Zekrom-GX" })).toBeVisible();
});

test("edits and confirms deletion of individual duplicate copies, then localizes the empty state", async () => {
  let records = [copy, { ...copy, id: "00000000-0000-4000-8000-000000000002", notes: "Second copy" }];
  vi.stubGlobal("fetch", vi.fn(async (input: string, options?: RequestInit) => {
    const url = new URL(input);
    if (url.pathname.endsWith("/auth/me")) return json(session);
    if (url.pathname.includes("/cards/")) return json(pikachuCard);
    if (options?.method === "PUT") {
      const attributes = JSON.parse(options.body as string);
      records = records.map((r) => url.pathname.endsWith(r.id) ? { ...r, ...attributes } : r);
      return json(records.find((r) => url.pathname.endsWith(r.id)));
    }
    if (options?.method === "DELETE") {
      records = records.filter((r) => !url.pathname.endsWith(r.id));
      return new Response(null, { status: 204 });
    }
    return json(page(records));
  }));
  const user = userEvent.setup();
  render(<App initialEntries={["/collection"]} />);
  expect(await screen.findByText("2 copias" )).toBeVisible();
  const first = screen.getByText("My first copy").closest("li")!;
  await user.click(within(first).getByRole("button", { name: "Editar copia" }));
  await user.clear(screen.getByLabelText("Notas personales"));
  await user.type(screen.getByLabelText("Notas personales"), "Updated notes");
  await user.click(screen.getByRole("button", { name: "Guardar copia" }));
  expect(await screen.findByText("Updated notes")).toBeVisible();
  for (const note of ["Updated notes", "Second copy"]) {
    const row = screen.getByText(note).closest("li")!;
    await user.click(within(row).getByRole("button", { name: "Eliminar copia" }));
    expect(screen.getByRole("button", { name: "Confirmar eliminación" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Confirmar eliminación" }));
    await waitFor(() => expect(screen.queryByText(note)).not.toBeInTheDocument());
  }
  expect(screen.getByText("Tu colección está vacía. Explora el catálogo y añade tu primera carta.")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "English" }));
  expect(screen.getByText("Your collection is empty. Explore the catalog and add your first card.")).toBeVisible();
});

test("keeps copy management available when the public provider fails and clears private content on logout", async () => {
  let loggedIn = true;
  vi.stubGlobal("fetch", vi.fn(async (input: string, options?: RequestInit) => {
    if (input.includes("/auth/me")) return loggedIn ? json(session) : json({}, 401);
    if (input.includes("/auth/logout")) { loggedIn = false; return new Response(null, { status: 204 }); }
    if (input.includes("/cards/")) return json({}, 503);
    if (options?.method === "DELETE") return new Response(null, { status: 204 });
    return json(page([copy]));
  }));
  const user = userEvent.setup();
  render(<App initialEntries={["/collection"]} />);
  expect(await screen.findByText("My first copy")).toBeVisible();
  expect(await screen.findByText("Los datos de esta carta aún no están disponibles.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Editar copia" })).toBeEnabled();
  await user.click(screen.getByRole("link", { name: "Perfil" }));
  await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
  await screen.findByRole("link", { name: "Iniciar sesión" });
  await user.click(screen.getByRole("link", { name: "Mi colección" }));
  expect(screen.queryByText("My first copy")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Iniciar sesión" })).toBeVisible();
});

test("shows translated inventory failure with retry, and hides a late response after session expiry", async () => {
  let fail = true;
  let expired = false;
  let finish!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    if (input.includes("/auth/me")) return expired ? json({}, 401) : json(session);
    if (input.includes("/cards/")) return json(pikachuCard);
    if (fail) return json({}, 503);
    return new Promise<Response>((resolve) => { finish = resolve; });
  }));
  const user = userEvent.setup();
  render(<App initialEntries={["/collection"]} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar tu colección");
  fail = false;
  await user.click(screen.getByRole("button", { name: "Reintentar colección" }));
  expired = true;
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  await screen.findByRole("link", { name: "Iniciar sesión" });
  await act(async () => { finish(json(page([copy]))); });
  expect(screen.queryByText("My first copy")).not.toBeInTheDocument();
});

test("keeps the collection visible while the session is checked, and replaces it if a different account answers", async () => {
  let resolveSession!: (r: Response) => void;
  let revalidate = false;
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    if (input.includes("/auth/me")) return revalidate ? new Promise<Response>((r) => { resolveSession = r; }) : json(session);
    if (input.includes("/cards/")) return json(pikachuCard);
    return json(page(revalidate ? [] : [copy]));
  }));
  render(<App initialEntries={["/collection"]} />);
  expect(await screen.findByText("My first copy")).toBeVisible();
  revalidate = true;
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  expect(screen.getByText("My first copy")).toBeVisible();   // a background check does not unmount the page
  expect(screen.queryByText("Comprobando sesión…")).not.toBeInTheDocument();
  await act(async () => { resolveSession(json({ ...session, user: { ...profile, id: "misty", display_name: "Misty" } })); });
  expect(await screen.findByText("Tu colección está vacía. Explora el catálogo y añade tu primera carta.")).toBeVisible();
  expect(screen.queryByText("My first copy")).not.toBeInTheDocument();
});

test("coordinates copy editing so saving one row cannot discard another draft", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    if (input.includes("/auth/me")) return json(session);
    if (input.includes("/cards/")) return json(pikachuCard);
    return json(page([copy, { ...copy, id: "00000000-0000-4000-8000-000000000002", notes: "Second copy" }]));
  }));
  const user = userEvent.setup();
  render(<App initialEntries={["/collection"]} />);
  await screen.findByText("My first copy");
  await user.click(within(screen.getByText("My first copy").closest("li")!).getByRole("button", { name: "Editar copia" }));
  expect(within(screen.getByText("Second copy").closest("li")!).getByRole("button", { name: "Editar copia" })).toBeDisabled();
  expect(within(screen.getByText("Second copy").closest("li")!).getByRole("button", { name: "Eliminar copia" })).toBeDisabled();
  expect(screen.getByRole("searchbox", { name: "Buscar por nombre de carta" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(within(screen.getByText("Second copy").closest("li")!).getByRole("button", { name: "Editar copia" })).toBeEnabled();
});

test("loads the bounded collection and resets the local page when a filter changes", async () => {
  const records = Array.from({ length: 25 }, (_, i) => ({ ...copy,
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, notes: `Copy ${i + 1}` }));
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    if (input.includes("/auth/me")) return json(session);
    if (input.includes("/cards/")) return json(pikachuCard);
    const url = new URL(input);
    const offset = Number(url.searchParams.get("offset"));
    const filtered = url.searchParams.get("language") === "es";
    return json({ results: filtered ? [] : records.slice(offset, offset + 24),
      total: filtered ? 0 : 25, quantities: filtered ? {} : { [pikachuCard.id]: 25 }, offset, limit: 24 });
  }));
  const user = userEvent.setup();
  render(<App initialEntries={["/collection"]} />);
  expect(await screen.findByText("25 copias")).toBeVisible();
  expect(screen.getAllByRole("button", { name: "Editar copia" })).toHaveLength(24);
  await user.click(screen.getByRole("button", { name: "Página siguiente" }));
  expect(await screen.findByText("Copy 25")).toBeVisible();
  expect(screen.queryByText("Copy 1")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Página siguiente" })).toBeDisabled();
  await user.click(within(screen.getByRole("group", { name: "Idioma de la copia" })).getByRole("button", { name: "Español" }));
  expect(await screen.findByText("No hay copias para estos filtros.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Página anterior" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Limpiar filtros" }));
  expect(await screen.findByText("Copy 1")).toBeVisible();
});

test("retains input after a save failure and prevents repeated submissions while saving", async () => {
  let complete!: (response: Response) => void;
  let writes = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: string, options?: RequestInit) => {
    if (input.includes("/auth/me")) return json(session);
    if (input.includes("/cards/")) return json(pikachuCard);
    if (options?.method === "POST") {
      writes += 1;
      return new Promise<Response>((resolve) => { complete = resolve; });
    }
    return json(page([]));
  }));
  const user = userEvent.setup();
  render(<App initialEntries={[`/cards/${pikachuCard.id}`]} />);
  await user.click(await screen.findByRole("button", { name: "Añadir a mi colección" }));
  await user.type(screen.getByLabelText("Notas personales"), "Keep draft");
  await user.click(screen.getByRole("button", { name: "Guardar copia" }));
  expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled();
  expect(writes).toBe(1);
  await act(async () => { complete(json({}, 503)); });
  expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos confirmar si se guardó la copia");
  expect(screen.getByLabelText("Notas personales")).toHaveValue("Keep draft");
  expect(screen.getByLabelText("Notas personales")).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Reintentar la misma copia" }));
  expect(writes).toBe(2);
  await act(async () => { complete(json(copy, 201)); });
  expect(await screen.findByRole("status")).toHaveTextContent("Copia añadida");
});

test("searches loaded names immediately and shares metadata with displayed groups", async () => {
  const calls = vi.fn(async (input: string) => {
    if (input.includes("/auth/me")) return json(session);
    if (input.includes("/cards/")) return json(pikachuCard);
    return json(page([copy, { ...copy, id: "00000000-0000-4000-8000-000000000002" }]));
  });
  vi.stubGlobal("fetch", calls);
  const user = userEvent.setup();
  render(<App initialEntries={["/collection"]} />);
  await screen.findByRole("heading", { name: pikachuCard.name });
  const search = screen.getByRole("searchbox", { name: "Buscar por nombre de carta" });
  expect(screen.queryByLabelText("ID de carta")).not.toBeInTheDocument();
  await user.type(search, "not a card");
  expect(screen.getByText("No hay copias para estos filtros.")).toBeVisible();
  await user.clear(search);
  await user.type(search, "PIKACHU");
  expect(screen.getAllByRole("button", { name: "Editar copia" })).toHaveLength(2);
  expect(calls.mock.calls.filter(([url]) => url.includes("/cards/"))).toHaveLength(1);
});

test("orders the full loaded set by name or expansion and defaults to recent copies", async () => {
  const older = { ...copy, card_id: "sv1-1", created_at: "2026-01-01T00:00:00Z" };
  const newer = { ...copy, id: "00000000-0000-4000-8000-000000000002", card_id: "sv1-2", created_at: "2026-11-01T00:00:00Z" };
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    if (input.includes("/auth/me")) return json(session);
    if (input.includes("/cards/sv1-1")) return json({ ...pikachuCard, id: "sv1-1", name: "Abra", set: { ...pikachuCard.set, name: "Zeta" } });
    if (input.includes("/cards/sv1-2")) return json({ ...pikachuCard, id: "sv1-2", name: "Zubat", set: { ...pikachuCard.set, name: "Alfa" } });
    return json({ results: [newer, older], total: 2, quantities: { "sv1-1": 1, "sv1-2": 1 }, offset: 0, limit: 24 });
  }));
  const user = userEvent.setup();
  render(<App initialEntries={["/collection"]} />);
  await screen.findByRole("heading", { name: "Abra" });
  const titles = () => screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
  expect(titles()).toEqual(["Zubat", "Abra"]);
  await user.selectOptions(screen.getByLabelText("Ordenar por"), "name");
  expect(titles()).toEqual(["Abra", "Zubat"]);
  await user.selectOptions(screen.getByLabelText("Ordenar por"), "set");
  expect(titles()).toEqual(["Zubat", "Abra"]);
  await user.click(screen.getAllByRole("button", { name: "Editar copia" })[0]);
  expect(screen.getByLabelText("Ordenar por")).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(screen.getByLabelText("Ordenar por")).toBeEnabled();
});

test("card round trip preserves collection filters, order and page", async () => {
  const records = Array.from({ length: 30 }, (_, i) => ({ ...copy, id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, notes: `Copy ${i}` }));
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    if (input.includes("/auth/me")) return json(session);
    if (input.includes("/cards/")) return json(pikachuCard);
    if (input.includes("/inventory?")) {
      const offset = Number(new URL(input).searchParams.get("offset"));
      return json({ ...page(records), results: records.slice(offset, offset + 24), offset });
    }
    return json({}, 503);
  }));
  const origin = "/collection?variant=holo&language=ja&order=name&page=2";
  render(<App initialEntries={[origin]} />);
  const user = userEvent.setup();
  const link = await screen.findByRole("link", { name: pikachuCard.name });
  expect(link).toHaveAttribute("href", `/cards/${pikachuCard.id}?${new URLSearchParams({ returnTo: origin })}`);
  expect(screen.getAllByText(/^Copy \d+$/)).toHaveLength(6);
  await user.click(link);
  const back = await screen.findByRole("link", { name: "Volver a Mi colección" });
  expect(back).toHaveAttribute("href", origin);
  await user.click(back);
  await screen.findByRole("link", { name: pikachuCard.name });
  expect(screen.getAllByText(/^Copy \d+$/)).toHaveLength(6);
  expect(screen.getByLabelText("Ordenar por")).toHaveValue("name");
});
