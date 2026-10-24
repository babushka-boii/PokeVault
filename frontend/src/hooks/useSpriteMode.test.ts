import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useSpriteMode } from "./useSpriteMode";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("defaults to static and restores the chosen animation mode after remount", () => {
  const first = renderHook(() => useSpriteMode());
  expect(first.result.current.mode).toBe("static");
  expect(first.result.current.effectiveMode).toBe("static");
  act(() => first.result.current.setMode("animated"));
  expect(first.result.current.effectiveMode).toBe("animated");
  first.unmount();
  const second = renderHook(() => useSpriteMode());
  expect(second.result.current.mode).toBe("animated");
});

test("ignores malformed saved preferences", () => {
  localStorage.setItem("pokevault.spriteMode", "battle");
  expect(renderHook(() => useSpriteMode()).result.current.mode).toBe("static");
});

test("forces static for live reduced motion changes while retaining the user's preference", () => {
  let matches = false;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    get matches() { return matches; },
    onchange: null,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    addListener: (listener: () => void) => listeners.add(listener),
    removeListener: (listener: () => void) => listeners.delete(listener),
    dispatchEvent: () => true,
  }));
  localStorage.setItem("pokevault.spriteMode", "animated");
  const { result, unmount } = renderHook(() => useSpriteMode());
  expect(result.current.effectiveMode).toBe("animated");
  act(() => { matches = true; listeners.forEach((listener) => listener()); });
  expect(result.current.reducedMotion).toBe(true);
  expect(result.current.mode).toBe("animated");
  expect(result.current.effectiveMode).toBe("static");
  expect(localStorage.getItem("pokevault.spriteMode")).toBe("animated");
  act(() => { matches = false; listeners.forEach((listener) => listener()); });
  expect(result.current.effectiveMode).toBe("animated");
  unmount();
  expect(listeners.size).toBe(0);
});

test("starts static when reduced motion is already requested", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  localStorage.setItem("pokevault.spriteMode", "animated");
  const { result } = renderHook(() => useSpriteMode());
  expect(result.current.mode).toBe("animated");
  expect(result.current.effectiveMode).toBe("static");
});

test("keeps a session preference when browser storage is blocked", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("Denied", "SecurityError"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Denied", "SecurityError"); });
  const { result } = renderHook(() => useSpriteMode());
  expect(result.current.mode).toBe("static");
  act(() => result.current.setMode("animated"));
  expect(result.current.mode).toBe("animated");
});
