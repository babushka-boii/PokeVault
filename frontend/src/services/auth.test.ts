import { afterEach, expect, test, vi } from "vitest";
import { fetchSession, requestGoogleLogin, endSession } from "./auth";

const profile = { id: "a052b801-e45d-4e48-a541-5027079a6b12", display_name: "Trainer", email: null, email_verified: false, picture_url: null };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
afterEach(() => vi.unstubAllGlobals());

test("treats 401 as absent session without reading an unsafe response", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("secret", { status: 401 })));
  expect(await fetchSession()).toBeNull();
});

test.each([
  { user: profile },
  { user: { ...profile, id: null }, csrf_token: "csrf" },
  { user: { ...profile, email_verified: "yes" }, csrf_token: "csrf" },
  { user: { ...profile, picture_url: "javascript:alert(1)" }, csrf_token: "csrf" },
  { user: { ...profile, picture_url: "http://example.test/profile" }, csrf_token: "csrf" },
  { user: profile, csrf_token: "" },
])("rejects a malformed profile payload %j", async (payload) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(payload)));
  await expect(fetchSession()).rejects.toMatchObject({ code: "session_unavailable" });
});

test.each(["javascript:alert(1)", "http://accounts.google.com/o/oauth2/v2/auth", "https://evil.example", "https://accounts.google.com.evil.example/o/oauth2/v2/auth", "https://user@accounts.google.com/o/oauth2/v2/auth"])('rejects untrusted authorization destination %s', async (authorization_url) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ authorization_url })));
  await expect(requestGoogleLogin()).rejects.toMatchObject({ code: "unknown" });
});

test("uses only known error codes from server failures", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "internal exception" }, 500)));
  await expect(requestGoogleLogin()).rejects.toMatchObject({ code: "unknown" });
});

test("normalizes a failed logout without exposing upstream data", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "secret" }, 403)));
  await expect(endSession("csrf")).rejects.toMatchObject({ code: "logout_failed" });
});
