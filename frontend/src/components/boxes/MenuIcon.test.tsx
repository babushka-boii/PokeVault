import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { LocaleProvider } from "../../i18n/LocaleProvider";
import { MenuIcon } from "./MenuIcon";
import type { SpriteMode } from "../../services/menuIcons";

function Icon({ dex = 25, mode = "static" }: { dex?: number; mode?: SpriteMode }) {
  return <LocaleProvider><MenuIcon pokemon={{ national_dex_number: dex }} mode={mode} /></LocaleProvider>;
}

test("requests a small static Gen V menu icon by default and replaces APNG when mode changes", () => {
  const { container, rerender } = render(<Icon />);
  const still = container.querySelector("img")!;
  expect(still).toHaveAttribute("src", "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/icons/25.png");
  expect(still).toHaveAttribute("width", "32");
  expect(still).toHaveAttribute("height", "32");
  expect(still).toHaveAttribute("alt", "");
  rerender(<Icon mode="animated" />);
  expect(container.querySelector("img")).toHaveAttribute("src", "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/icons/animated/25.png");
  rerender(<Icon mode="static" />);
  expect(container.querySelector("img")).toHaveAttribute("src", "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/icons/25.png");
});

test("recovers from runtime image errors through menu sources before a localized neutral placeholder", () => {
  const { container } = render(<Icon mode="animated" />);
  fireEvent.error(container.querySelector("img")!);
  expect(container.querySelector("img")).toHaveAttribute("src", "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/icons/25.png");
  fireEvent.error(container.querySelector("img")!);
  expect(container.querySelector("img")).toHaveAttribute("src", "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-vii/icons/25.png");
  fireEvent.error(container.querySelector("img")!);
  expect(container.querySelector("img")).toBeNull();
  expect(screen.getByRole("img", { name: "Sprite no disponible" })).toBeVisible();
});

test("resets failed sources when changing dex or display mode", () => {
  const { container, rerender } = render(<Icon mode="animated" />);
  fireEvent.error(container.querySelector("img")!);
  fireEvent.error(container.querySelector("img")!);
  fireEvent.error(container.querySelector("img")!);
  rerender(<Icon dex={26} mode="animated" />);
  expect(container.querySelector("img")).toHaveAttribute("src", "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/icons/animated/26.png");
  fireEvent.error(container.querySelector("img")!);
  rerender(<Icon dex={26} mode="static" />);
  expect(container.querySelector("img")).toHaveAttribute("src", "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/icons/26.png");
});

test("uses a verified later menu icon and shows the English fallback if it fails", () => {
  localStorage.setItem("pokevault.locale", "en");
  const { container } = render(<Icon dex={1025} mode="animated" />);
  expect(container.querySelector("img")).toHaveAttribute("src", "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-ix/scarlet-violet/icons/1025.png");
  fireEvent.error(container.querySelector("img")!);
  expect(container.querySelector("img")).toBeNull();
  expect(screen.getByRole("img", { name: "Sprite unavailable" })).toBeVisible();
});


afterEach(() => vi.restoreAllMocks());

test("centers and sizes the visible Thwackey footprint while keeping the original image", () => {
  const data = new Uint8ClampedArray(68 * 68 * 4);
  for (let y = 21; y < 47; y++) for (let x = 23; x < 45; x++) data[(y * 68 + x) * 4 + 3] = 255;
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage, getImageData: () => ({ data }),
  } as unknown as CanvasRenderingContext2D);
  const { container, rerender } = render(<Icon dex={811} />);
  const img = container.querySelector('img')!;
  Object.defineProperties(img, { naturalWidth: { value: 68 }, naturalHeight: { value: 68 } });
  fireEvent.load(img);
  expect(parseFloat(img.style.width)).toBeCloseTo(196.1538);
  expect(img.style.height).toBe(img.style.width);
  expect(img.style.transform).toBe('translate(-50%, -50%)');
  expect(img.src).toContain('/sword-shield/icons/811.png');
  rerender(<Icon dex={811} />);
  expect(container.querySelector('img')).toBe(img);
  expect(drawImage).toHaveBeenCalledTimes(1);
});

test("blocked pixel inspection leaves the valid image and fallback chain intact", () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => { throw new DOMException('Blocked'); });
  const { container } = render(<Icon dex={4} mode="animated" />);
  const img = container.querySelector('img')!;
  Object.defineProperties(img, { naturalWidth: { value: 32 }, naturalHeight: { value: 32 } });
  fireEvent.load(img);
  expect(container.querySelector('img')).toBe(img);
  expect(img.src).toContain('/generation-v/icons/animated/4.png');
  expect(img.style.width).toBe('');
});
