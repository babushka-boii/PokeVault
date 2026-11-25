import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AWAY_MS, createAuthStore, STALE_MS } from "./store";

const user = { id: "ash", display_name: "Ash", email: null, email_verified: true, picture_url: null };
const session = { user, csrf_token: "csrf-1" };
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
let now = 1_000_000;
let answer: () => Promise<Response>;
let fetcher: ReturnType<typeof vi.fn>;

beforeEach(() => {
  now = 1_000_000;
  vi.mocked(Date.now).mockImplementation(() => now);
  answer = () => Promise.resolve(reply(session));
  fetcher = vi.fn(() => answer());
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => vi.unstubAllGlobals());

async function signedIn() {
  const store = createAuthStore();
  store.activate();
  await vi.waitFor(() => expect(store.getSnapshot().status).toBe("authenticated"));
  return store;
}

test("revalidating a signed-in session never changes its status or user, and only withholds the CSRF token", async () => {
  const store = await signedIn();
  expect(store.getCsrfToken()).toBe("csrf-1");
  let finish!: (response: Response) => void;
  answer = () => new Promise<Response>((resolve) => { finish = resolve; });
  now += STALE_MS + 1;
  store.revalidate("focus");
  expect(store.getSnapshot()).toMatchObject({ status: "authenticated", user, validating: true });
  expect(store.getCsrfToken()).toBeNull();
  finish(reply({ user, csrf_token: "csrf-2" }));
  await vi.waitFor(() => expect(store.getCsrfToken()).toBe("csrf-2"));
  expect(store.getSnapshot()).toMatchObject({ status: "authenticated", error: null });
  await vi.waitFor(() => expect(store.getSnapshot().validating).toBeFalsy());
});

test("a 401 closes the session and clears the identity", async () => {
  const store = await signedIn();
  answer = () => Promise.resolve(reply({}, 401));
  now += STALE_MS + 1;
  store.revalidate("focus");
  await vi.waitFor(() => expect(store.getSnapshot().status).toBe("unauthenticated"));
  expect(store.getSnapshot().user).toBeNull();
  expect(store.getCsrfToken()).toBeNull();
});

test("a network error is not a logout: the user stays and the notice is calm", async () => {
  const store = await signedIn();
  answer = () => Promise.reject(new TypeError("offline"));
  now += STALE_MS + 1;
  store.revalidate("focus");
  await vi.waitFor(() => expect(store.getSnapshot().error).toBe("session_unavailable"));
  expect(store.getSnapshot()).toMatchObject({ status: "authenticated", user });
  expect(store.getSnapshot().validating).toBeFalsy();
});

test("a 5xx is treated like a network error", async () => {
  const store = await signedIn();
  answer = () => Promise.resolve(reply({}, 503));
  now += STALE_MS + 1;
  store.revalidate("pageshow");
  await vi.waitFor(() => expect(store.getSnapshot().error).toBe("session_unavailable"));
  expect(store.getSnapshot().status).toBe("authenticated");
});

test("coming back soon after a short absence does not revalidate", async () => {
  const store = await signedIn();
  expect(fetcher).toHaveBeenCalledTimes(1);
  store.markAway(); now += AWAY_MS - 1;
  store.revalidate("visible");
  now += 1_000; store.revalidate("focus");
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test("more than 30 s away revalidates once, even if focus, pageshow and visibility all fire", async () => {
  const store = await signedIn();
  store.markAway(); now += AWAY_MS + 1;
  store.revalidate("focus"); store.revalidate("pageshow"); store.revalidate("visible");
  expect(fetcher).toHaveBeenCalledTimes(2);
  await vi.waitFor(() => expect(store.getSnapshot().validating).toBeFalsy());
  store.revalidate("focus");   // the away time was consumed by the first return
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test("a check older than 60 s revalidates without having been away", async () => {
  const store = await signedIn();
  now += STALE_MS - 1; store.revalidate("focus");
  expect(fetcher).toHaveBeenCalledTimes(1);
  now += 2; store.revalidate("focus");
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test("a page restored from the back-forward cache always revalidates", async () => {
  const store = await signedIn();
  now += 1_000;
  store.revalidate("bfcache");
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test("an unconfirmed session can be retried in the background without leaving the page", async () => {
  const store = await signedIn();
  answer = () => Promise.reject(new TypeError("offline"));
  now += STALE_MS + 1; store.revalidate("focus");
  await vi.waitFor(() => expect(store.getSnapshot().error).toBe("session_unavailable"));
  answer = () => Promise.resolve(reply(session));
  store.retrySession();
  expect(store.getSnapshot()).toMatchObject({ status: "authenticated", validating: true });
  await vi.waitFor(() => expect(store.getSnapshot().error).toBeNull());
});
