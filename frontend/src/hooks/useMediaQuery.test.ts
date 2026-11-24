import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { stubMedia } from "../test/media";
import { useMediaQuery } from "./useMediaQuery";

afterEach(() => vi.unstubAllGlobals());

test("returns false when matchMedia is unavailable", () => {
  const { result } = renderHook(() => useMediaQuery("(max-width: 767px)"));
  expect(result.current).toBe(false);
});

test("reads the current match and follows change events", () => {
  const media = stubMedia({ mobile: true });
  const { result } = renderHook(() => useMediaQuery("(max-width: 767px)"));
  expect(result.current).toBe(true);
  act(() => media.set({ mobile: false }));
  expect(result.current).toBe(false);
});

test("unsubscribes on unmount", () => {
  const media = stubMedia();
  const { unmount } = renderHook(() => useMediaQuery("(prefers-reduced-motion: reduce)"));
  expect(media.listenerCount()).toBe(1);
  unmount();
  expect(media.listenerCount()).toBe(0);
});
