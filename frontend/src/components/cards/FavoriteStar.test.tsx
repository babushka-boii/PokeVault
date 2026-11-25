import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AuthContext } from "../../auth/context";
import { LocaleProvider } from "../../i18n/LocaleProvider";
import { jsonResponse as json } from "../../test/tcgFixtures";
import { FavoriteStar } from "./FavoriteStar";

afterEach(() => vi.unstubAllGlobals());
const user = { id: "ash-1", display_name: "Ash", email: null, email_verified: true, picture_url: null };

function shell(auth: Record<string, unknown>, cardId = "base1-4") {
  const value = { status: "authenticated", user, error: null, loggingOut: false, validating: false, retrySession: vi.fn(), logout: vi.fn(), getCsrfToken: () => "csrf", ...auth };
  const tree = (id: string) => <LocaleProvider><MemoryRouter><AuthContext.Provider value={value as never}><FavoriteStar cardId={id} /></AuthContext.Provider></MemoryRouter></LocaleProvider>;
  const view = render(tree(cardId));
  return { value, rerenderWith: (id: string) => view.rerender(tree(id)) };
}

/** A tiny favourites server: the card ids that are starred, a delay, and the calls made. */
function server(initial: string[] = [], options: { fail?: (method: string) => Response | undefined } = {}) {
  const starred = new Set(initial); const calls: { method: string; card: string; csrf: string | null }[] = [];
  const release: (() => void)[] = []; let hold = false;
  const request = vi.fn(async (input: string, init?: RequestInit) => {
    const card = decodeURIComponent(new URL(input).pathname.split("/").pop()!); const method = init?.method ?? "GET";
    calls.push({ method, card, csrf: (init?.headers as Record<string, string> | undefined)?.["X-CSRF-Token"] ?? null });
    const failure = options.fail?.(method); if (failure) return failure;
    if (hold && method !== "GET") await new Promise<void>((resolve) => release.push(resolve));
    if (method === "PUT") starred.add(card); if (method === "DELETE") starred.delete(card);
    return json({ card_id: card, favorite: starred.has(card) });
  });
  vi.stubGlobal("fetch", request);
  return { starred, calls, request, holdWrites: () => { hold = true; }, releaseWrites: () => { hold = false; release.splice(0).forEach((resolve) => resolve()); } };
}

describe("the star", () => {
  test("reads the card's state and is a pressed-state toggle with a stable name", async () => {
    server(["base1-4"]);
    shell({});
    const star = await screen.findByRole("button", { name: "Favorita" });
    await waitFor(() => expect(star).toBeEnabled());
    expect(star).toHaveAttribute("aria-pressed", "true");
    expect(star).toHaveTextContent("★");
  });

  test("an unstarred card shows an outline star that can be pressed", async () => {
    server();
    shell({});
    const star = await screen.findByRole("button", { name: "Favorita" });
    await waitFor(() => expect(star).toBeEnabled());
    expect(star).toHaveAttribute("aria-pressed", "false");
    expect(star).toHaveTextContent("☆");
  });

  test("changes only after the server confirms, announces it, and sends the CSRF token", async () => {
    const api = server();
    const person = userEvent.setup();
    shell({});
    const star = await screen.findByRole("button", { name: "Favorita" });
    await waitFor(() => expect(star).toBeEnabled());
    api.holdWrites();
    await person.click(star);
    expect(star).toBeDisabled();                               // pending: no double clicks
    expect(star).toHaveAttribute("aria-pressed", "false");      // and no optimistic star
    expect(star).toHaveTextContent("☆");
    api.releaseWrites();
    await waitFor(() => expect(star).toHaveAttribute("aria-pressed", "true"));
    expect(star).toBeEnabled();
    expect(await screen.findByRole("status")).toHaveTextContent("Agregada a tus favoritas.");
    expect(api.calls.filter((call) => call.method === "PUT")).toEqual([{ method: "PUT", card: "base1-4", csrf: "csrf" }]);
    await person.click(star);
    await waitFor(() => expect(star).toHaveAttribute("aria-pressed", "false"));
    expect(screen.getByRole("status")).toHaveTextContent("Quitada de tus favoritas.");
    expect(api.calls.at(-1)).toEqual({ method: "DELETE", card: "base1-4", csrf: "csrf" });
  });

  test("a failed save keeps the previous state and says so", async () => {
    server([], { fail: (method) => (method === "PUT" ? json({}, 500) : undefined) });
    const person = userEvent.setup();
    shell({});
    const star = await screen.findByRole("button", { name: "Favorita" });
    await waitFor(() => expect(star).toBeEnabled());
    await person.click(star);
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo guardar tu favorita. Inténtalo de nuevo.");
    expect(star).toHaveAttribute("aria-pressed", "false");
    expect(star).toBeEnabled();
  });

  test("the limit of 500 is explained", async () => {
    server([], { fail: (method) => (method === "PUT" ? json({ detail: "favorites_full" }, 409) : undefined) });
    const person = userEvent.setup();
    shell({});
    const star = await screen.findByRole("button", { name: "Favorita" });
    await waitFor(() => expect(star).toBeEnabled());
    await person.click(star);
    expect(await screen.findByRole("alert")).toHaveTextContent("Llegaste al máximo de 500 cartas favoritas.");
    expect(star).toHaveAttribute("aria-pressed", "false");
  });

  test("a 401 re-checks the session and a missing token does not write", async () => {
    const api = server([], { fail: (method) => (method === "PUT" ? json({}, 401) : undefined) });
    const person = userEvent.setup();
    const { value } = shell({});
    const star = await screen.findByRole("button", { name: "Favorita" });
    await waitFor(() => expect(star).toBeEnabled());
    await person.click(star);
    await waitFor(() => expect(value.retrySession).toHaveBeenCalled());
    expect(api.starred.size).toBe(0);
    const missing = shell({ getCsrfToken: () => null });
    const stars = await screen.findAllByRole("button", { name: "Favorita" });
    await waitFor(() => expect(stars[1]).toBeEnabled());
    const before = api.calls.length;
    await person.click(stars[1]);
    expect(api.calls.length).toBe(before);
    expect(missing.value.retrySession).toHaveBeenCalled();
  });

  test("a state that cannot be read disables the star and offers a retry", async () => {
    let fail = true;
    const api = server(["base1-4"], { fail: () => (fail ? json({}, 503) : undefined) });
    const person = userEvent.setup();
    shell({});
    expect(await screen.findByText("No se pudo cargar tu favorita.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Favorita" })).toBeDisabled();
    fail = false;
    await person.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Favorita" })).toHaveAttribute("aria-pressed", "true"));
    expect(api.calls.filter((call) => call.method === "GET")).toHaveLength(2);
  });

  test("each card has its own state", async () => {
    server(["base1-4"]);
    const { rerenderWith } = shell({}, "base1-4");
    await waitFor(() => expect(screen.getByRole("button", { name: "Favorita" })).toHaveAttribute("aria-pressed", "true"));
    rerenderWith("base1-5");
    await waitFor(() => expect(screen.getByRole("button", { name: "Favorita" })).toHaveAttribute("aria-pressed", "false"));
  });

  test("a pending save is cancelled when the star goes away", async () => {
    const api = server();
    const person = userEvent.setup();
    const view = render(<LocaleProvider><MemoryRouter><AuthContext.Provider value={{ status: "authenticated", user, error: null, loggingOut: false, validating: false, retrySession: vi.fn(), logout: vi.fn(), getCsrfToken: () => "csrf" } as never}><FavoriteStar cardId="base1-4" /></AuthContext.Provider></MemoryRouter></LocaleProvider>);
    const star = await screen.findByRole("button", { name: "Favorita" });
    await waitFor(() => expect(star).toBeEnabled());
    api.holdWrites();
    await person.click(star);
    view.unmount();
    api.releaseWrites();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("guests and sessions", () => {
  test("a guest makes no request and is invited to sign in", () => {
    const api = server();
    shell({ status: "unauthenticated", user: undefined });
    expect(screen.queryByRole("button", { name: "Favorita" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Inicia sesión para marcar favoritas" })).toHaveAttribute("href", "/login");
    expect(api.request).not.toHaveBeenCalled();
  });

  test("nothing shows or is requested while the session is being validated", () => {
    const api = server();
    shell({ validating: true });
    expect(within(document.body).queryByRole("button", { name: "Favorita" })).not.toBeInTheDocument();
    expect(api.request).not.toHaveBeenCalled();
  });
});
