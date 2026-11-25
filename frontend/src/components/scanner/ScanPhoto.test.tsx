import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { LocaleProvider } from "../../i18n/LocaleProvider";
import type { CardCorners } from "../../services/scanner";
import { MIN_SCAN_MS, ScanPhoto } from "./ScanPhoto";

const corners: CardCorners = [[0.2, 0.1], [0.8, 0.12], [0.78, 0.9], [0.18, 0.88]];
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });
const view = (props: { url: string | null; scanning: boolean; corners: CardCorners | null }) => <LocaleProvider><ScanPhoto name="card.jpg" {...props} /></LocaleProvider>;
const flush = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

test("shows the analysing text and the viewfinder while recognising", () => {
  const { container } = render(view({ url: "blob:card", scanning: true, corners: null }));
  expect(screen.getByRole("status")).toHaveTextContent("Analizando carta…");
  expect(container.querySelector(".scan-frame__beam")).not.toBeNull();
  expect(container.querySelectorAll(".scan-frame__overlay i")).toHaveLength(5);   // the beam and four corners
  expect(screen.getByRole("img", { name: "Vista previa de la carta" })).toBeVisible();
});

test("a quick answer keeps the sweep for the minimum time, then crops to the card", () => {
  const { rerender } = render(view({ url: "blob:card", scanning: false, corners: null }));
  rerender(view({ url: "blob:card", scanning: true, corners: null })); flush(10);
  rerender(view({ url: "blob:card", scanning: false, corners })); flush(MIN_SCAN_MS - 300);
  expect(screen.getByRole("status")).toHaveTextContent("Analizando carta…");
  const image = screen.getByRole("img", { name: "Vista previa de la carta" });
  expect(image.style.clipPath).toContain("0%");                  // still the whole photo
  flush(400);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(image.style.clipPath).toContain("20.00% 10.00%");       // now the detected outline
  expect(image.style.clipPath).toContain("18.00% 88.00%");
});

test("without corners the original photo is left uncropped", () => {
  const { rerender } = render(view({ url: "blob:card", scanning: true, corners: null })); flush(10);
  rerender(view({ url: "blob:card", scanning: false, corners: null })); flush(MIN_SCAN_MS + 10);
  const image = screen.getByRole("img", { name: "Vista previa de la carta" });
  expect(image.style.clipPath).toBe("polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)");
});

test("a photo without a preview (HEIC) shows only the status text", () => {
  const { container } = render(view({ url: null, scanning: true, corners: null }));
  expect(screen.getByRole("status")).toHaveTextContent("Analizando carta…");
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector(".scan-frame")).toBeNull();
  expect(screen.getByText(/vista previa de HEIC/i)).toBeVisible();
});

test("an error leaves the photo as it was, with no status", () => {
  const { rerender } = render(view({ url: "blob:card", scanning: true, corners: null })); flush(10);
  rerender(view({ url: "blob:card", scanning: false, corners: null })); flush(MIN_SCAN_MS + 10);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Vista previa de la carta" })).toBeVisible();
});
