import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { LocaleProvider } from "../../i18n/LocaleProvider";
import { SpeciesSprite } from "./SpeciesSprite";

afterEach(() => vi.unstubAllGlobals());

function showOnScreen(reduced = false) {
  vi.stubGlobal("IntersectionObserver", class { constructor(private callback: (entries: { isIntersecting: boolean }[]) => void) {} observe() { this.callback([{ isIntersecting: true }]); } disconnect() {} });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduced && query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} }));
}
const mount = (number: number) => render(<LocaleProvider><SpeciesSprite number={number} name="Scraggy" animate fit={{ max: 105, still: 108 }} /></LocaleProvider>);
const measured = (img: HTMLImageElement, width: number, height: number) => {
  Object.defineProperty(img, "naturalWidth", { value: width, configurable: true }); Object.defineProperty(img, "naturalHeight", { value: height, configurable: true });
  act(() => { fireEvent.load(img); });
};

test("an animated sprite grows by a whole number to stay within the maximum height", () => {
  showOnScreen();
  const { container } = mount(559);
  const img = container.querySelector("img")!;
  expect(img.src).toContain("/black-white/animated/559.gif");
  measured(img, 37, 41);
  expect(img).toHaveAttribute("width", "74"); expect(img).toHaveAttribute("height", "82");   // x2
  measured(img, 87, 89);
  expect(img).toHaveAttribute("width", "87"); expect(img).toHaveAttribute("height", "89");   // x1: x2 would pass 105
});

test("species above 649 and reduced motion show the still sprite at the still size", () => {
  showOnScreen();
  const above = mount(700).container.querySelector("img")!;
  expect(above.src).toMatch(/\/700\.png$/); expect(above).toHaveAttribute("width", "108");
  vi.unstubAllGlobals(); showOnScreen(true);
  const still = mount(559).container.querySelector("img")!;
  expect(still.src).toMatch(/\/559\.png$/); expect(still).toHaveAttribute("height", "108");
});
