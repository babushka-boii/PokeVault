import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { App } from "../../app/App";
import { binderId, binderWorld, physical, pocketOf } from "../../test/binderFixtures";
import { stubMedia } from "../../test/media";
import { swipeDirection } from "./albumLayout";

afterEach(() => vi.unstubAllGlobals());

describe("swipe criteria", () => {
  test("needs 48 px and horizontal motion at least 1.5 times the vertical", () => {
    expect(swipeDirection(-48, 0)).toBe(1);
    expect(swipeDirection(60, 10)).toBe(-1);
    expect(swipeDirection(-47, 0)).toBe(0);
    expect(swipeDirection(-90, 70)).toBe(0);      // 90 < 1.5 × 70
    expect(swipeDirection(-90, 60)).toBe(1);      // exactly 1.5×
    expect(swipeDirection(5, 120)).toBe(0);
  });
});

/** Swipes with one finger by default; `fingers` adds extra touch pointers (a pinch). */
function swipe(target: Element, dx: number, dy = 0, { type = "touch", fingers = 1 }: { type?: string; fingers?: number } = {}) {
  const base = { pointerType: type, clientX: 200, clientY: 300, isPrimary: true };
  fireEvent.pointerDown(target, { ...base, pointerId: 1 });
  for (let finger = 2; finger <= fingers; finger++) fireEvent.pointerDown(target, { ...base, pointerId: finger, isPrimary: false });
  fireEvent.pointerUp(target, { ...base, pointerId: 1, clientX: 200 + dx, clientY: 300 + dy });
  for (let finger = 2; finger <= fingers; finger++) fireEvent.pointerUp(target, { ...base, pointerId: finger });
}
const pagesLabel = (text: string) => screen.getByText(text);

describe("page swipes on a phone", () => {
  async function open(pockets = [pocketOf(1, 1, physical(0)), pocketOf(2, 1, physical(1))]) {
    stubMedia({ mobile: true });
    const world = binderWorld({ binders: [{ name: "Tesoros", pockets }] });
    render(<App initialEntries={[`/binders/${binderId(1)}`]} />);
    const pocket = await within(await screen.findByRole("grid", { name: "Página 1" })).findByRole("button", { name: /^Página 1, bolsillo 1:/ });
    return { world, pocket, album: document.querySelector(".pv-album")! };
  }

  test("a left swipe turns to the next page and a right swipe back; bounds hold; nothing is written", async () => {
    const { world, pocket, album } = await open();
    expect(pagesLabel("pág. 1 de 4")).toBeVisible();
    swipe(album, 120);                                           // right at page 1: nothing
    expect(pagesLabel("pág. 1 de 4")).toBeVisible();
    swipe(pocket, -120, 10);                                     // a swipe may start on a pocket
    expect(await screen.findByText("pág. 2 de 4")).toBeVisible();
    swipe(document.querySelector(".pv-album")!, 120);
    expect(await screen.findByText("pág. 1 de 4")).toBeVisible();
    expect(world.mutations()).toEqual([]);
  });

  test("short, mostly vertical, multi-touch and mouse gestures never turn the page", async () => {
    const { album } = await open();
    swipe(album, -40);
    swipe(album, -90, 80);
    swipe(album, -120, 0, { fingers: 2 });
    swipe(album, -120, 0, { type: "mouse" });
    expect(pagesLabel("pág. 1 de 4")).toBeVisible();
  });

  test("the click after a swipe does not open the pocket underneath, and the next tap does", async () => {
    const { pocket } = await open();
    swipe(pocket, -120);
    const next = await within(await screen.findByRole("grid", { name: "Página 2" })).findByRole("button", { name: /^Página 2, bolsillo 1:/ });
    fireEvent.click(next);                                      // the click that ends the swipe
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(next);                                      // an ordinary tap
    expect(await screen.findByRole("dialog")).toBeVisible();
  });

  test("a cancelled pointer ends the gesture", async () => {
    const { album } = await open();
    fireEvent.pointerDown(album, { pointerType: "touch", pointerId: 1, clientX: 200, clientY: 300 });
    fireEvent.pointerCancel(album, { pointerType: "touch", pointerId: 1 });
    fireEvent.pointerUp(album, { pointerType: "touch", pointerId: 1, clientX: 20, clientY: 300 });
    expect(pagesLabel("pág. 1 de 4")).toBeVisible();
  });

  test("swipes are ignored while a sheet is open", async () => {
    const { pocket, album } = await open();
    await userEvent.setup().click(pocket);
    await screen.findByRole("dialog");
    swipe(album, -120);
    expect(pagesLabel("pág. 1 de 4")).toBeVisible();
  });

  test("with reduced motion the swipe still turns the page", async () => {
    stubMedia({ mobile: true, reducedMotion: true });
    binderWorld({ binders: [{ name: "Tesoros", pockets: [pocketOf(1, 1, physical(0))] }] });
    render(<App initialEntries={[`/binders/${binderId(1)}`]} />);
    await screen.findByRole("grid", { name: "Página 1" });
    swipe(document.querySelector(".pv-album")!, -120);
    expect(await screen.findByText(/^pág\. 2 de \d+$/)).toBeVisible();
  });
});

describe("resizing during a flight", () => {
  test("cancels it: the clone goes away, the original is restored and the card still enters its pocket", async () => {
    const finished: { reject: (error: unknown) => void }[] = [];
    Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, writable: true, value: vi.fn(() => {
      let reject!: (error: unknown) => void;
      const promise = new Promise<void>((_resolve, fail) => { reject = fail; });
      finished.push({ reject });
      return { finished: promise, cancel: () => reject(new DOMException("cancelled", "AbortError")) };
    }) });
    try {
      binderWorld({ binders: [{ name: "Tesoros", pockets: [] }], tray: [physical(0)] });
      const user = userEvent.setup();
      render(<App initialEntries={[`/binders/${binderId(1)}`]} />);
      const item = await screen.findByRole("button", { name: /^Guardar Card 1/ });
      const original = item.querySelector(".pv-tray__thumb") as HTMLElement;
      await user.click(item);
      await waitFor(() => expect(document.querySelectorAll(".pv-flight")).toHaveLength(1));
      expect(original.style.visibility).toBe("hidden");
      act(() => { window.dispatchEvent(new Event("resize")); });
      await waitFor(() => expect(document.querySelectorAll(".pv-flight")).toHaveLength(0));
      expect(original.style.visibility).toBe("");
      const pocket = within(screen.getByRole("grid", { name: "Página 1" })).getByRole("button", { name: /^Página 1, bolsillo 1: Card 1/ });
      await waitFor(() => expect(pocket).toHaveAttribute("data-arrived", "true"));
      expect(pocket).not.toHaveAttribute("data-incoming");
    } finally {
      delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
      document.querySelectorAll(".pv-flight").forEach((clone) => clone.remove());
    }
  });
});
