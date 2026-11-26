import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "../app/App";
import { jsonResponse as json, pikachuCard } from "../test/tcgFixtures";
import { binderId } from "../test/binderFixtures";

const session = { user: { id: "ash", display_name: "Ash", email: null, email_verified: true, picture_url: null }, csrf_token: "csrf-test" };
const copy = { id: "00000000-0000-4000-8000-000000000001", card_id: "base1-4", condition: "near_mint", language: "ja", variant: "holo", acquired_on: "2026-10-01", notes: "Physical copy detail", created_at: "2026-11-07T12:00:00Z", updated_at: "2026-11-07T12:00:00Z" };
afterEach(() => vi.unstubAllGlobals());

test("opens the exact inventory UUID and edits it without requiring provider availability", async () => {
  let record = { ...copy };
  vi.stubGlobal("fetch", vi.fn(async (input: string, options?: RequestInit) => {
    if (input.includes("/auth/me")) return json(session);
    if (input.endsWith(`/inventory/${copy.id}`)) {
      expect(options?.credentials).toBe("include");
      expect(options?.cache).toBe("no-store");
      if (options?.method === "PUT") {
        expect(options.headers).toMatchObject({ "X-CSRF-Token": "csrf-test" });
        record = { ...record, ...JSON.parse(options.body as string) };
      }
      return json(record);
    }
    throw new Error(`Unexpected external request ${input}`);
  }));
  const user = userEvent.setup();
  render(<App initialEntries={[`/collection/${copy.id}`]} />);
  expect(await screen.findByText("Physical copy detail")).toBeVisible();
  // The copy UUID is never shown: only the card (here the catalog id, as no metadata is reachable).
  expect(screen.queryByText(copy.id)).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "base1-4" })).toHaveAttribute("href", `/cards/base1-4?${new URLSearchParams({ returnTo: `/collection/${copy.id}` })}`);
  await user.click(screen.getByRole("button", { name: "Editar copia" }));
  await user.clear(screen.getByLabelText("Notas personales"));
  await user.type(screen.getByLabelText("Notas personales"), "Exact copy updated");
  await user.click(screen.getByRole("button", { name: "Guardar copia" }));
  expect(await screen.findByText("Exact copy updated")).toBeVisible();
  expect(record.id).toBe(copy.id);
});

test("shows a private missing-copy response and supports English", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: string) => input.includes("/auth/me") ? json(session) : json({}, 404)));
  const user = userEvent.setup();
  render(<App initialEntries={[`/collection/${copy.id}`]} />);
  expect(await screen.findByText("La carta o copia ya no está disponible. Actualiza la colección.")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "English" }));
  expect(screen.getByText("The card or copy is no longer available. Refresh your collection.")).toBeVisible();
});

test("hides a pending copy immediately when session revalidation begins", async () => {
  let finish!: (response: Response) => void;
  let expired = false;
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    if (input.includes("/auth/me")) return expired ? json({}, 401) : json(session);
    return new Promise<Response>((resolve) => { finish = resolve; });
  }));
  render(<App initialEntries={[`/collection/${copy.id}`]} />);
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  expired = true;
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  await screen.findByRole("link", { name: "Iniciar sesión" });
  await act(async () => { finish(json(copy)); });
  expect(screen.queryByText("Physical copy detail")).not.toBeInTheDocument();
});

test("requires sign in before fetching an individual inventory copy", async () => {
  const fetcher = vi.fn(async (input: string) => {
    if (input.includes("/auth/me")) return json({}, 401);
    throw new Error("Private data must not be fetched");
  });
  vi.stubGlobal("fetch", fetcher);
  render(<App initialEntries={[`/collection/${copy.id}`]} />);
  expect(await screen.findByRole("link", { name: "Iniciar sesión" })).toBeVisible();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

function locationApi(locate: () => Response, binders: unknown[] = []) {
  const request = vi.fn(async (input: string) => {
    const path = new URL(input).pathname;
    if (path === "/api/v1/auth/me") return json(session);
    if (path === "/api/v1/me/settings") return json({ preferred_currency: "CLP" });
    if (path === `/api/v1/inventory/${copy.id}`) return json(copy);
    if (path === "/api/v1/binders/locations") return locate();
    if (path === "/api/v1/binders") return json({ results: binders, total: binders.length });
    return json({}, 404);
  });
  vi.stubGlobal("fetch", request);
  return request;
}

test("says which binder, page and pocket hold the copy and links there", async () => {
  const binderId = "10000000-0000-4000-8000-000000000001";
  const request = locationApi(() => json({ results: [{ copy_id: copy.id, binder_id: binderId, binder_name: "Kanto", page: 2, pocket: 5 }] }));
  render(<App initialEntries={[`/collection/${copy.id}`]} />);
  const section = await screen.findByRole("region", { name: "¿Dónde está esta carta?" });
  const link = await within(section).findByRole("link", { name: "Carpeta Kanto · pág. 2 · bolsillo 5" });
  expect(link).toHaveAttribute("href", `/binders/${binderId}?page=2&pocket=5`);
  expect(request.mock.calls.some(([input]) => new URL(input).search === `?copy_id=${copy.id}`)).toBe(true);
});

test("offers to store a copy that is in no binder in the first binder", async () => {
  const stamp = "2026-11-24T12:00:00Z";
  const first = { id: "10000000-0000-4000-8000-000000000009", name: "Kanto", display_order: 0, cover: "noir", stickers: [], copy_count: 0, page_count: 2, last_placed_at: null, created_at: stamp, updated_at: stamp };
  locationApi(() => json({ results: [] }), [first]);
  render(<App initialEntries={[`/collection/${copy.id}`]} />);
  const section = await screen.findByRole("region", { name: "¿Dónde está esta carta?" });
  await waitFor(() => expect(within(section).getByRole("link", { name: "Sin carpeta · guardar" })).toHaveAttribute("href", `/binders/${first.id}`));
});

test("omits the location when it cannot be read, without breaking the copy", async () => {
  locationApi(() => json({}, 503));
  render(<App initialEntries={[`/collection/${copy.id}`]} />);
  expect(await screen.findByText("Physical copy detail")).toBeVisible();
  await waitFor(() => expect(screen.queryByRole("region", { name: "¿Dónde está esta carta?" })).not.toBeInTheDocument());
});

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const card = { ...pikachuCard, id: "base1-4", name: "Charizard", set: { ...pikachuCard.set, id: "base1", name: "Base Set" } };

function detailApi({ metadata = true, inventory = () => json(copy) }: { metadata?: boolean; inventory?: () => Response } = {}) {
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const path = new URL(input).pathname;
    if (path === "/api/v1/auth/me") return json(session);
    if (path === "/api/v1/me/settings") return json({ preferred_currency: "CLP" });
    if (path === `/api/v1/inventory/${copy.id}`) return inventory();
    if (path === "/api/v1/binders/locations") return json({ results: [] });
    if (path === "/api/v1/binders") return json({ results: [], total: 0 });
    if (path === "/api/v1/cards/base1-4") return metadata ? json(card) : json({}, 503);
    return json({}, 404);
  }));
}
const noUuid = (root: Element) => {
  expect(root.textContent).not.toMatch(UUID);
  for (const element of root.querySelectorAll("[aria-label],[title],[alt]")) {
    for (const name of ["aria-label", "title", "alt"]) expect(element.getAttribute(name) ?? "").not.toMatch(UUID);
  }
};

test("names the copy by card and expansion, never by its UUID", async () => {
  detailApi();
  const user = userEvent.setup();
  render(<App initialEntries={[`/collection/${copy.id}`]} />);
  const link = await screen.findByRole("link", { name: "Charizard · Base Set" });
  expect(link).toHaveAttribute("href", `/cards/base1-4?${new URLSearchParams({ returnTo: `/collection/${copy.id}` })}`);
  noUuid(screen.getByRole("main"));
  await user.click(screen.getByRole("button", { name: "Editar copia" }));       // editing
  noUuid(screen.getByRole("main"));
  await user.click(screen.getByRole("button", { name: "Cancelar" }));
  await user.click(screen.getByRole("button", { name: "Eliminar copia" }));          // deleting
  expect(await screen.findByText("¿Eliminar esta copia de tu colección?")).toBeVisible();
  noUuid(screen.getByRole("main"));
});

test("falls back to the catalog id, not the UUID, when the printing cannot be loaded", async () => {
  detailApi({ metadata: false });
  render(<App initialEntries={[`/collection/${copy.id}`]} />);
  expect(await screen.findByRole("link", { name: "base1-4" })).toBeVisible();
  noUuid(screen.getByRole("main"));
});

test("no UUID while loading or when the copy cannot be loaded", async () => {
  detailApi({ inventory: () => json({}, 500) });
  render(<App initialEntries={[`/collection/${copy.id}`]} />);
  expect(await screen.findByRole("alert")).toBeVisible();
  noUuid(screen.getByRole("main"));
});

test("offers a way back to the binder pocket it was opened from", async () => {
  detailApi();
  const returnTo = `/binders/${binderId(1)}?page=2&pocket=5`;
  render(<App initialEntries={[`/collection/${copy.id}?${new URLSearchParams({ returnTo })}`]} />);
  const back = await screen.findByRole("link", { name: "‹ Volver a la carpeta" });
  expect(back).toHaveAttribute("href", returnTo);
});

test.each([
  ["an external address", "https://evil.example/binders"],
  ["a protocol-relative address", `//evil.example/binders/${binderId(1)}`],
  ["a path that is not a binder", "/collection"],
  ["a malformed binder id", "/binders/not-a-uuid?page=1&pocket=1"],
  ["an out-of-range page", `/binders/${binderId(1)}?page=41&pocket=1`],
  ["an out-of-range pocket", `/binders/${binderId(1)}?page=1&pocket=10`],
  ["extra query parameters", `/binders/${binderId(1)}?page=1&pocket=1&next=http://x`],
  ["a fragment", `/binders/${binderId(1)}#x`],
])("ignores %s as a return target", async (_name, returnTo) => {
  detailApi();
  render(<App initialEntries={[`/collection/${copy.id}?${new URLSearchParams({ returnTo })}`]} />);
  await screen.findByRole("link", { name: "Charizard · Base Set" });
  expect(screen.queryByRole("link", { name: "‹ Volver a la carpeta" })).not.toBeInTheDocument();
});

test("propagates the binder page and pocket through the copy's catalog link", async () => {
  detailApi();
  const origin = `/binders/${binderId(1)}?page=2&pocket=5`;
  render(<App initialEntries={[`/collection/${copy.id}?${new URLSearchParams({ returnTo: origin })}`]} />);
  expect(await screen.findByRole("link", { name: "Charizard · Base Set" })).toHaveAttribute("href", `/cards/base1-4?${new URLSearchParams({ returnTo: origin })}`);
  await userEvent.click(screen.getByRole("link", { name: "Charizard · Base Set" }));
  expect(await screen.findByRole("link", { name: "Volver a la carpeta" })).toHaveAttribute("href", origin);
});
