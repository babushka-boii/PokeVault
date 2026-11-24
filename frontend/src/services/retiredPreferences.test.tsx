import { render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "../app/App";
import { removeRetiredPreferences, RETIRED_PREFERENCE_KEYS } from "./retiredPreferences";

afterEach(() => vi.unstubAllGlobals());

test("removes the retired box preferences and keeps every other key", () => {
  localStorage.setItem("pokevault.audio", JSON.stringify({ muted: false, volume: 0.5 }));
  localStorage.setItem("pokevault.spriteMode", "animated");
  localStorage.setItem("pokevault.locale", "en");
  localStorage.setItem("pokevault.currency", "USD");
  localStorage.setItem("other.app", "kept");
  removeRetiredPreferences();
  expect(Object.keys(localStorage).sort()).toEqual(["other.app", "pokevault.currency", "pokevault.locale"]);
  expect(RETIRED_PREFERENCE_KEYS).toEqual(["pokevault.audio", "pokevault.spriteMode"]);
});

test("is a no-op when nothing is stored and survives blocked storage", () => {
  expect(() => removeRetiredPreferences()).not.toThrow();
  const blocked = { removeItem: () => { throw new DOMException("blocked", "SecurityError"); } };
  expect(() => removeRetiredPreferences(blocked)).not.toThrow();
  expect(() => removeRetiredPreferences(undefined)).not.toThrow();
});

test("the application cleans the keys once when it starts", () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({}), { status: 401 })));
  localStorage.setItem("pokevault.audio", "{}");
  localStorage.setItem("pokevault.spriteMode", "animated");
  render(<App initialEntries={["/pokedex"]} />);
  expect(localStorage.getItem("pokevault.audio")).toBeNull();
  expect(localStorage.getItem("pokevault.spriteMode")).toBeNull();
  expect(localStorage.getItem("pokevault.locale")).toBe("es");
});
