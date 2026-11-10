import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "../app/App";
import { jsonResponse as json } from "../test/tcgFixtures";

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
  expect(screen.getByText(copy.id)).toBeVisible();
  expect(screen.getByRole("link", { name: "base1-4" })).toHaveAttribute("href", "/cards/base1-4");
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
