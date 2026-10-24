import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { TcgCard } from "../../services/cards";
import { bulbasaurCard } from "../../test/tcgFixtures";
import { InteractiveCard } from "./InteractiveCard";

const card = bulbasaurCard as TcgCard;
const media = new Map<string, { matches: boolean; listeners: Set<() => void> }>();

function setMedia(query: string, matches: boolean) {
  const entry = media.get(query);
  if (!entry) throw new Error(`No media subscription for ${query}`);
  act(() => {
    entry.matches = matches;
    entry.listeners.forEach((listener) => listener());
  });
}

function renderCard(props: Partial<React.ComponentProps<typeof InteractiveCard>> = {}) {
  let opens = 0;
  const result = render(<InteractiveCard card={card} {...props}>
    {props.children ?? <a href="/cards/base1-44" onClick={(event) => { event.preventDefault(); opens += 1; }}>
      <img src="https://example.org/card.webp" alt="Bulbasaur" />
    </a>}
  </InteractiveCard>);
  const surface = result.container.querySelector<HTMLElement>(".tcg-interactive-surface")!;
  vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 300, width: 200, height: 300, toJSON() {},
  });
  const captures = new Set<number>();
  surface.setPointerCapture = (id) => { captures.add(id); };
  surface.hasPointerCapture = (id) => captures.has(id);
  surface.releasePointerCapture = (id) => { captures.delete(id); };
  return { ...result, surface, getOpens: () => opens };
}

function armTouch() {
  setMedia("(hover: hover) and (pointer: fine)", false);
  fireEvent.click(screen.getByRole("button", { name: "Tilt card" }));
}

beforeEach(() => {
  media.clear();
  vi.stubGlobal("matchMedia", (query: string) => {
    if (!media.has(query)) media.set(query, { matches: query === "(hover: hover) and (pointer: fine)", listeners: new Set() });
    const entry = media.get(query)!;
    return {
      get matches() { return entry.matches; }, media: query, onchange: null,
      addEventListener: (_: string, listener: () => void) => entry.listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => entry.listeners.delete(listener),
      addListener() {}, removeListener() {}, dispatchEvent() { return true; },
    };
  });
  // JSDOM has no PointerEvent implementation; retain the real mouse coordinates.
  class TestPointerEvent extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    readonly isPrimary: boolean;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? "mouse";
      this.isPrimary = init.isPrimary ?? true;
    }
  }
  vi.stubGlobal("PointerEvent", TestPointerEvent);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("moves the light and bounds gallery tilt while returning to rest on pointer leave", () => {
  const { surface } = renderCard();
  fireEvent.pointerMove(surface, { pointerType: "mouse", clientX: 200, clientY: 0 });
  expect(surface.style.getPropertyValue("--card-rotate-x")).toBe("4deg");
  expect(surface.style.getPropertyValue("--card-rotate-y")).toBe("4deg");
  expect(surface.style.getPropertyValue("--card-light-x")).toBe("100%");
  expect(surface.style.getPropertyValue("--card-light-y")).toBe("0%");
  expect(surface).toHaveAttribute("data-active", "true");
  fireEvent.pointerMove(surface, { pointerType: "mouse", clientX: 900, clientY: -300 });
  expect(surface.style.getPropertyValue("--card-rotate-y")).toBe("4deg");
  fireEvent.pointerLeave(surface, { pointerType: "mouse" });
  expect(surface.style.getPropertyValue("--card-rotate-x")).toBe("0deg");
  expect(surface.style.getPropertyValue("--card-rotate-y")).toBe("0deg");
  expect(surface).toHaveAttribute("data-active", "false");
});

test("allows a deeper bounded tilt for the large detail artwork", () => {
  const { surface } = renderCard({ large: true });
  fireEvent.pointerMove(surface, { pointerType: "mouse", clientX: 0, clientY: 300 });
  expect(surface.style.getPropertyValue("--card-rotate-x")).toBe("-8deg");
  expect(surface.style.getPropertyValue("--card-rotate-y")).toBe("-8deg");
});

test("leaves child links keyboard accessible without adding a decorative tab stop", () => {
  const { container, getOpens } = renderCard();
  const link = screen.getByRole("link", { name: "Bulbasaur" });
  link.focus();
  expect(link).toHaveFocus();
  expect(container.querySelector(".tcg-interactive-card")).not.toHaveAttribute("tabindex");
  fireEvent.click(link, { detail: 0 });
  expect(getOpens()).toBe(1);
});

test("preserves ordinary touch scrolling and a simple tap before touch interaction is armed", () => {
  const { surface, getOpens } = renderCard();
  setMedia("(hover: hover) and (pointer: fine)", false);
  expect(surface.style.touchAction).not.toBe("none");
  const link = screen.getByRole("link", { name: "Bulbasaur" });
  fireEvent.pointerDown(link, { pointerType: "touch", clientX: 20, clientY: 20 });
  expect(fireEvent.pointerMove(surface, { pointerType: "touch", clientX: 25, clientY: 100, cancelable: true })).toBe(true);
  expect(surface).toHaveAttribute("data-active", "false");
  fireEvent.pointerCancel(surface, { pointerType: "touch" });
  fireEvent.pointerDown(link, { pointerType: "touch", clientX: 20, clientY: 20 });
  fireEvent.pointerUp(link, { pointerType: "touch", clientX: 20, clientY: 20 });
  fireEvent.click(link, { detail: 1 });
  expect(getOpens()).toBe(1);
});

test("arms touch before the gesture, follows a drag and resets on release without opening the link", () => {
  const { surface, getOpens } = renderCard();
  armTouch();
  const button = screen.getByRole("button", { name: "Finish interaction" });
  expect(button.closest("a")).toBeNull();
  expect(button).toHaveAttribute("aria-pressed", "true");
  expect(surface.style.touchAction).toBe("none");
  const link = screen.getByRole("link", { name: "Bulbasaur" });
  fireEvent.pointerDown(link, { pointerType: "touch", pointerId: 7, clientX: 100, clientY: 150 });
  fireEvent.pointerMove(surface, { pointerType: "touch", pointerId: 7, clientX: 200, clientY: 0 });
  expect(surface.style.getPropertyValue("--card-rotate-x")).toBe("4deg");
  expect(surface.style.getPropertyValue("--card-light-x")).toBe("100%");
  expect(surface.hasPointerCapture(7)).toBe(true);
  fireEvent.pointerUp(surface, { pointerType: "touch", pointerId: 7 });
  expect(surface.hasPointerCapture(7)).toBe(false);
  expect(surface).toHaveAttribute("data-active", "false");
  expect(surface.style.getPropertyValue("--card-rotate-x")).toBe("0deg");
  fireEvent.click(link, { detail: 1 });
  expect(getOpens()).toBe(0);
  // A later ordinary tap is independent of the previous drag.
  fireEvent.pointerDown(link, { pointerType: "touch", clientX: 100, clientY: 150 });
  fireEvent.pointerUp(link, { pointerType: "touch", clientX: 100, clientY: 150 });
  fireEvent.click(link, { detail: 1 });
  expect(getOpens()).toBe(1);
});

test.each(["pointerCancel", "lostPointerCapture"] as const)("resets and blocks a drag click after %s", (endEvent) => {
  const { surface, getOpens } = renderCard();
  armTouch();
  fireEvent.pointerDown(surface, { pointerType: "touch", pointerId: 2, clientX: 100, clientY: 150 });
  fireEvent.pointerMove(surface, { pointerType: "touch", pointerId: 2, clientX: 170, clientY: 80 });
  fireEvent[endEvent](surface, { pointerType: "touch", pointerId: 2 });
  expect(surface).toHaveAttribute("data-active", "false");
  expect(surface.hasPointerCapture(2)).toBe(false);
  fireEvent.click(screen.getByRole("link"), { detail: 1 });
  expect(getOpens()).toBe(0);
});

test("continues dragging when a child loses implicit capture to the card surface", () => {
  const { surface } = renderCard();
  armTouch();
  const artwork = screen.getByRole("img");
  fireEvent.pointerDown(artwork, { pointerType: "touch", pointerId: 4, clientX: 100, clientY: 150 });
  fireEvent.pointerMove(surface, { pointerType: "touch", pointerId: 4, clientX: 180, clientY: 40 });
  // Touch implicitly captures the original child. Transferring capture to the
  // surface emits a bubbling lostpointercapture from that original child.
  fireEvent.lostPointerCapture(artwork, { pointerType: "touch", pointerId: 4 });
  expect(surface.hasPointerCapture(4)).toBe(true);
  expect(surface).toHaveAttribute("data-active", "true");
  fireEvent.pointerMove(surface, { pointerType: "touch", pointerId: 4, clientX: 0, clientY: 300 });
  expect(surface.style.getPropertyValue("--card-rotate-x")).toBe("-4deg");
});

test("ignores a second touch pointer during an active gesture", () => {
  const { surface } = renderCard();
  armTouch();
  fireEvent.pointerDown(surface, { pointerType: "touch", pointerId: 1, clientX: 100, clientY: 150 });
  fireEvent.pointerDown(surface, { pointerType: "touch", pointerId: 2, isPrimary: false, clientX: 200, clientY: 0 });
  fireEvent.pointerMove(surface, { pointerType: "touch", pointerId: 2, isPrimary: false, clientX: 200, clientY: 0 });
  expect(surface.style.getPropertyValue("--card-rotate-x")).toBe("0deg");
  fireEvent.pointerMove(surface, { pointerType: "touch", pointerId: 1, clientX: 0, clientY: 300 });
  expect(surface.style.getPropertyValue("--card-rotate-x")).toBe("-4deg");
});

test("does not simulate mouse hover when the device cannot hover", () => {
  const { surface } = renderCard();
  setMedia("(hover: hover) and (pointer: fine)", false);
  fireEvent.pointerMove(surface, { pointerType: "mouse", clientX: 200, clientY: 0 });
  expect(surface).toHaveAttribute("data-active", "false");
});

test("offers touch arming on a device with both a mouse and a touch screen", () => {
  media.set("(any-pointer: coarse)", { matches: true, listeners: new Set() });
  renderCard({ touchLabel: "Inclinar carta", touchActiveLabel: "Terminar interacción" });
  fireEvent.click(screen.getByRole("button", { name: "Inclinar carta" }));
  expect(screen.getByRole("button", { name: "Terminar interacción" })).toHaveAttribute("aria-pressed", "true");
});

test("resets the active tilt and removes reflections when reduced motion changes live", () => {
  media.set("(prefers-reduced-motion: reduce)", { matches: false, listeners: new Set() });
  const { surface } = renderCard();
  fireEvent.pointerMove(surface, { pointerType: "mouse", clientX: 200, clientY: 0 });
  expect(surface).toHaveAttribute("data-active", "true");
  setMedia("(prefers-reduced-motion: reduce)", true);
  expect(surface).toHaveAttribute("data-active", "false");
  expect(surface.style.getPropertyValue("--card-rotate-x")).toBe("0deg");
  expect(surface.querySelector(".tcg-card-glare")).toBeNull();
  fireEvent.pointerMove(surface, { pointerType: "mouse", clientX: 0, clientY: 300 });
  expect(surface).toHaveAttribute("data-active", "false");
});

test("releases a touch gesture and restores scrolling when reduced motion is enabled", () => {
  media.set("(prefers-reduced-motion: reduce)", { matches: false, listeners: new Set() });
  const { surface } = renderCard();
  armTouch();
  fireEvent.pointerDown(surface, { pointerType: "touch", pointerId: 3, clientX: 100, clientY: 150 });
  fireEvent.pointerMove(surface, { pointerType: "touch", pointerId: 3, clientX: 190, clientY: 20 });
  expect(surface.hasPointerCapture(3)).toBe(true);
  setMedia("(prefers-reduced-motion: reduce)", true);
  expect(surface.hasPointerCapture(3)).toBe(false);
  expect(surface.style.touchAction).not.toBe("none");
  expect(screen.queryByRole("button")).toBeNull();
  fireEvent.pointerMove(surface, { pointerType: "touch", pointerId: 3, clientX: 0, clientY: 300 });
  expect(surface).toHaveAttribute("data-active", "false");
});

test("blocks touch-drag navigation while reduced motion keeps the card static", () => {
  media.set("(prefers-reduced-motion: reduce)", { matches: true, listeners: new Set() });
  const { surface, getOpens } = renderCard();
  const link = screen.getByRole("link");
  fireEvent.pointerDown(link, { pointerType: "touch", clientX: 100, clientY: 150 });
  fireEvent.pointerMove(surface, { pointerType: "touch", clientX: 190, clientY: 150 });
  fireEvent.pointerUp(surface, { pointerType: "touch" });
  fireEvent.click(link, { detail: 1 });
  expect(getOpens()).toBe(0);
  expect(surface).toHaveAttribute("data-active", "false");
});

test("preserves a retry button's keyboard activation after dragging its artwork surface", () => {
  let retries = 0;
  const { surface } = renderCard({ children: <button type="button" onClick={() => { retries += 1; }}>Retry artwork</button> });
  armTouch();
  fireEvent.pointerDown(surface, { pointerType: "touch", clientX: 100, clientY: 150 });
  fireEvent.pointerMove(surface, { pointerType: "touch", clientX: 190, clientY: 20 });
  fireEvent.pointerUp(surface, { pointerType: "touch" });
  fireEvent.click(screen.getByRole("button", { name: "Retry artwork" }), { detail: 0 });
  expect(retries).toBe(1);
});

test("Escape ends intentional touch mode and returns the card to rest", () => {
  const { surface } = renderCard();
  armTouch();
  fireEvent.pointerDown(surface, { pointerType: "touch", pointerId: 3, clientX: 190, clientY: 20 });
  fireEvent.keyDown(screen.getByRole("button"), { key: "Escape" });
  expect(surface).toHaveAttribute("data-active", "false");
  expect(surface.style.touchAction).not.toBe("none");
  expect(screen.getByRole("button", { name: "Tilt card" })).toHaveAttribute("aria-pressed", "false");
});

test("unmount releases pointer capture and media subscriptions", () => {
  const { surface, unmount } = renderCard();
  armTouch();
  fireEvent.pointerDown(surface, { pointerType: "touch", pointerId: 3, clientX: 100, clientY: 150 });
  fireEvent.pointerMove(surface, { pointerType: "touch", pointerId: 3, clientX: 190, clientY: 20 });
  expect(surface.hasPointerCapture(3)).toBe(true);
  unmount();
  expect(surface.hasPointerCapture(3)).toBe(false);
  media.forEach((entry) => expect(entry.listeners.size).toBe(0));
});

test("unmount clears the compatibility-click timer", () => {
  vi.useFakeTimers();
  const { surface, unmount } = renderCard();
  armTouch();
  fireEvent.pointerDown(surface, { pointerType: "touch", clientX: 100, clientY: 150 });
  fireEvent.pointerMove(surface, { pointerType: "touch", clientX: 190, clientY: 20 });
  fireEvent.pointerUp(surface, { pointerType: "touch" });
  expect(vi.getTimerCount()).toBe(1);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

test.each([
  { rarity: "Common", variants: [], reflection: "subtle" },
  { rarity: null, variants: [], reflection: "subtle" },
  { rarity: "Rare Ultra", variants: [], reflection: "subtle" },
  { rarity: "Rare Non Holo", variants: [], reflection: "subtle" },
  { rarity: "Rare Holo", variants: [], reflection: "iridescent" },
  { rarity: "Common", variants: [{ id: null, type: "holo", subtype: null, stamps: [] }], reflection: "iridescent" },
  { rarity: "Common", variants: [
    { id: null, type: "holo", subtype: null, stamps: [] },
    { id: null, type: "normal", subtype: null, stamps: [] },
  ], reflection: "subtle" },
])("uses $reflection simulated reflection for rarity $rarity and its available printings", ({ reflection, ...metadata }) => {
  const { surface } = renderCard({ card: { ...card, ...metadata } });
  expect(surface).toHaveAttribute("data-reflection", reflection);
  expect(surface.querySelector(".tcg-card-iridescence") !== null).toBe(reflection === "iridescent");
});
