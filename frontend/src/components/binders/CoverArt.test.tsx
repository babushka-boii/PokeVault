import { fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vitest";
import { covers, type Sticker } from "../../services/binders";
import { Cover } from "./Cover";
import { CoverArt } from "./CoverArt";

const pixel: Sticker = { kind: "pixel", species_id: null, pixel_key: "heart", x: 25, y: 40, rotation: -10, scale: 1.5 };
const species: Sticker = { kind: "pokemon", species_id: 25, pixel_key: null, x: 60, y: 70, rotation: 0, scale: 1 };

test.each(covers)("the %s material is drawn from its id only", (cover) => {
  const { container } = render(<CoverArt cover={cover} stickers={[]} />);
  expect(container.querySelector(".pv-coverart")).toHaveAttribute("data-cover", cover);
});

test("stickers sit at their percent position, size and rotation, back to front, and are hidden from assistive tech", () => {
  const { container } = render(<CoverArt cover="metallic" stickers={[pixel, species]} />);
  const layers = [...container.querySelectorAll<HTMLElement>(".pv-sticker")];
  expect(layers).toHaveLength(2);
  expect(layers[0].style.left).toBe("25%"); expect(layers[0].style.top).toBe("40%");
  expect(layers[0].style.width).toBe("30%");                         // 20% x scale 1.5
  expect(layers[0].style.transform).toContain("rotate(-10deg)");
  expect(layers[0].style.zIndex).toBe("0"); expect(layers[1].style.zIndex).toBe("1");
  expect(layers.every((layer) => layer.getAttribute("aria-hidden") === "true")).toBe(true);
  expect(container.querySelector(".pv-sticker__pixel--heart")).not.toBeNull();
});

test("a Pokémon sticker's image URL is built only from the species number and never sent a referrer", () => {
  const { container } = render(<CoverArt cover="noir" stickers={[species]} />);
  const image = container.querySelector("img")!;
  expect(image.getAttribute("src")).toBe("https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png");
  expect(image).toHaveAttribute("referrerpolicy", "no-referrer");
  expect(image).toHaveAttribute("loading", "lazy");
  expect(image).toHaveAttribute("alt", "");
});

test("an artwork that fails to load becomes a placeholder, not a broken image", () => {
  const { container } = render(<CoverArt cover="noir" stickers={[species]} />);
  fireEvent.error(container.querySelector("img")!);
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector(".pv-sticker__missing")).not.toBeNull();
});

test("the shelf cover links to the binder and shows the same material and stickers", () => {
  const { container } = render(<MemoryRouter><Cover binderId="b1" cover="white" stickers={[pixel]} /></MemoryRouter>);
  const link = container.querySelector("a")!;
  expect(link).toHaveAttribute("href", "/binders/b1"); expect(link).toHaveAttribute("data-cover", "white");
  expect(link).toHaveAttribute("aria-hidden", "true");
  expect(container.querySelectorAll(".pv-sticker")).toHaveLength(1);
});
