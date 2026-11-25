import { afterEach, expect, test, vi } from "vitest";
import { fetchProfile, isTeam, ProfileError, saveProfile } from "./profile";

const good = { trainer_id: "diego", team: [559, 501], member_since: "2026-11-01" };
const reply = (body: unknown, status = 200) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
afterEach(() => vi.unstubAllGlobals());

test("accepts a valid profile and sends credentials without caching", async () => {
  const request = reply(good); vi.stubGlobal("fetch", request);
  expect(await fetchProfile(new AbortController().signal)).toEqual(good);
  expect(request.mock.calls[0][1]).toMatchObject({ credentials: "include", cache: "no-store", method: "GET" });
});

test.each([
  { ...good, trainer_id: "red" }, { ...good, team: [1, 2, 3, 4, 5, 6] }, { ...good, team: [25, 25] }, { ...good, team: [0] }, { ...good, team: [1026] },
  { ...good, team: ["25"] }, { ...good, member_since: "yesterday" }, { ...good, extra: 1 }, { trainer_id: "mateo", team: [] },
])("rejects a malformed profile %#", async (body) => {
  vi.stubGlobal("fetch", reply(body));
  await expect(fetchProfile(new AbortController().signal)).rejects.toBeInstanceOf(ProfileError);
});

test("saves with the CSRF token and validates before sending", async () => {
  const request = reply(good); vi.stubGlobal("fetch", request);
  await saveProfile({ trainer_id: "diego", team: [559, 501] }, "csrf", new AbortController().signal);
  expect(request.mock.calls[0][1]).toMatchObject({ method: "PUT", headers: expect.objectContaining({ "X-CSRF-Token": "csrf" }), body: JSON.stringify({ trainer_id: "diego", team: [559, 501] }) });
  expect(() => saveProfile({ trainer_id: "mateo", team: [1, 1] }, "csrf", new AbortController().signal)).toThrow(ProfileError);
  expect(request).toHaveBeenCalledTimes(1);
});

test("turns an HTTP failure into a status", async () => {
  vi.stubGlobal("fetch", reply({}, 401));
  await expect(fetchProfile(new AbortController().signal)).rejects.toMatchObject({ status: 401 });
});

test("isTeam accepts up to five different species", () => {
  expect(isTeam([])).toBe(true); expect(isTeam([1, 4, 7, 25, 1025])).toBe(true); expect(isTeam([1, 1])).toBe(false);
});
