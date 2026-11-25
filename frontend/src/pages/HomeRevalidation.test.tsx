import { act, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "../app/App";
import { stubHome, userA } from "../test/homeFixtures";
import { jsonResponse as json } from "../test/tcgFixtures";

afterEach(() => vi.unstubAllGlobals());

/** Coming back to the tab checks the session in the background: nothing on Home may unmount or reload. */
test("Home keeps its blocks, and loads nothing again, while the session is revalidated", async () => {
  let revalidating = false; let finish!: (response: Response) => void;
  const request = stubHome({ override: (url) => url.pathname === "/api/v1/auth/me" && revalidating ? new Promise<Response>((resolve) => { finish = resolve; }) as never : undefined });
  render(<App initialEntries={["/"]} />);
  const hero = await screen.findByRole("region", { name: "VALOR DE TU COLECCIÓN" });
  await within(hero).findByText(/1\.112/);
  const total = within(hero).getByText(/1\.112/);
  const before = request.mock.calls.filter(([input]) => new URL(input as string).pathname !== "/api/v1/auth/me").length;

  revalidating = true;
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  // Still the very same nodes (nothing was unmounted), and no skeleton or "checking session" text replaced them.
  expect(screen.getByRole("region", { name: "VALOR DE TU COLECCIÓN" })).toBe(hero);
  expect(within(hero).getByText(/1\.112/)).toBe(total);
  expect(screen.queryByText("Comprobando sesión…")).not.toBeInTheDocument();

  await act(async () => { finish(json({ user: userA, csrf_token: "csrf-2" })); });
  await waitFor(() => expect(request.mock.calls.filter(([input]) => new URL(input as string).pathname === "/api/v1/auth/me")).toHaveLength(2));
  expect(screen.getByRole("region", { name: "VALOR DE TU COLECCIÓN" })).toBe(hero);
  expect(within(hero).getByText(/1\.112/)).toBe(total);
  const after = request.mock.calls.filter(([input]) => new URL(input as string).pathname !== "/api/v1/auth/me").length;
  expect(after).toBe(before);   // the same session answered: no data was requested again
});

test("Home drops its private blocks only when the check says the session is gone", async () => {
  let revalidating = false; let finish!: (response: Response) => void;
  stubHome({ override: (url) => url.pathname === "/api/v1/auth/me" && revalidating ? new Promise<Response>((resolve) => { finish = resolve; }) as never : undefined });
  render(<App initialEntries={["/"]} />);
  await within(await screen.findByRole("region", { name: "VALOR DE TU COLECCIÓN" })).findByText(/1\.112/);
  revalidating = true;
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  await act(async () => { finish(json({}, 401)); });
  await waitFor(() => expect(screen.queryByText(/1\.112/)).not.toBeInTheDocument());
});
