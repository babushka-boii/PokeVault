import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { LocaleProvider } from "../../i18n/LocaleProvider";
import { pikachuCard, scraggyCard } from "../../test/tcgFixtures";
import { CardArtwork } from "./CardArtwork";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test("tries another documented image format after a failed optimized image", () => {
  render(<LocaleProvider><CardArtwork card={pikachuCard} large /></LocaleProvider>);
  fireEvent.error(screen.getByRole("img"));
  expect(screen.getByRole("img")).toHaveAttribute("src", "https://assets.tcgdex.net/en/sm/sm9/33/high.png");
  fireEvent.load(screen.getByRole("img"));
  expect(screen.getByRole("img")).toBeVisible();
});

test("tries a verified alternative language for this exact printing and identifies loaded artwork", () => {
  const card = { ...pikachuCard, language: "es" as const, image_language: "es" as const, image_sources: [
    { base_url: "https://assets.tcgdex.net/es/sm/sm9/33", language: "es" as const },
    ...pikachuCard.image_sources,
  ] };
  render(<LocaleProvider><CardArtwork card={card} large /></LocaleProvider>);
  for (let attempt = 0; attempt < 6; attempt++) fireEvent.error(screen.getByRole("img"));
  expect(screen.getByRole("img")).toHaveAttribute("src", "https://assets.tcgdex.net/en/sm/sm9/33/high.webp");
  fireEvent.load(screen.getByRole("img"));
  expect(screen.getByText("Ilustración oficial disponible en inglés.")).toBeVisible();
});

test("distinguishes absent provider artwork from exhausted requests and permits retry", () => {
  const view = render(<LocaleProvider><CardArtwork card={scraggyCard} large /></LocaleProvider>);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByText("Imagen de carta no disponible")).toBeVisible();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  view.rerender(<LocaleProvider><CardArtwork card={pikachuCard} large /></LocaleProvider>);
  for (let attempt = 0; attempt < 6; attempt++) fireEvent.error(screen.getByRole("img"));
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reintentar ilustración" }));
  expect(screen.getByRole("img")).toHaveAttribute("src", pikachuCard.image_url);
});

test("resets error and loading state when the printing changes", () => {
  const view = render(<LocaleProvider><CardArtwork card={pikachuCard} /></LocaleProvider>);
  fireEvent.error(screen.getByRole("img"));
  view.rerender(<LocaleProvider><CardArtwork card={{ ...pikachuCard, id: "sm9-162", image_sources: [
    { base_url: "https://assets.tcgdex.net/en/sm/sm9/162", language: "en" },
  ] }} /></LocaleProvider>);
  expect(screen.getByRole("img")).toHaveAttribute("src", "https://assets.tcgdex.net/en/sm/sm9/162/low.webp");
});

test("bounds stalled visible artwork loading and releases timers on unmount", () => {
  vi.useFakeTimers();
  const view = render(<LocaleProvider><CardArtwork card={pikachuCard} large /></LocaleProvider>);
  act(() => vi.advanceTimersByTime(20_000));
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reintentar ilustración" })).toBeVisible();
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

test("never times out an offscreen lazy image before it approaches the viewport", () => {
  vi.useFakeTimers();
  let observe: IntersectionObserverCallback | undefined;
  const disconnect = vi.fn();
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback) { observe = callback; }
    observe() {}
    disconnect = disconnect;
  });
  const view = render(<LocaleProvider><CardArtwork card={pikachuCard} /></LocaleProvider>);
  act(() => vi.advanceTimersByTime(30_000));
  expect(screen.getByRole("img")).toHaveAttribute("src", pikachuCard.thumbnail_url);
  act(() => observe?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
  fireEvent.load(screen.getByRole("img"));
  act(() => vi.advanceTimersByTime(30_000));
  expect(screen.getByRole("img")).toBeVisible();
  view.unmount();
  expect(disconnect).toHaveBeenCalled();
});
