import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { LocaleProvider } from "../../i18n/LocaleProvider";
import { PokemonSprite } from "./PokemonSprite";

const pokemon = { national_dex_number: 25, name: "pikachu", types: ["electric" as const], sprite_url: "https://example.org/pikachu.png" };

test("shows the species sprite as a decorative image", () => {
  const { container } = render(<LocaleProvider><PokemonSprite pokemon={pokemon} /></LocaleProvider>);
  const image = container.querySelector("img")!;
  expect(image).toHaveAttribute("src", pokemon.sprite_url);
  expect(image).toHaveAttribute("alt", "");
  expect(image).toHaveAttribute("referrerpolicy", "no-referrer");
});

test("falls back to a labelled marker, with no dependency on the retired box styles, when the sprite is missing or fails", () => {
  const { container, rerender } = render(<LocaleProvider><PokemonSprite pokemon={{ ...pokemon, sprite_url: null }} /></LocaleProvider>);
  expect(screen.getByLabelText("Sprite no disponible")).toHaveClass("pv-sprite-missing");
  rerender(<LocaleProvider><PokemonSprite pokemon={pokemon} /></LocaleProvider>);
  fireEvent.error(container.querySelector("img")!);
  expect(screen.getByLabelText("Sprite no disponible")).toHaveClass("pv-sprite-missing");
  expect(container.querySelector(".pc-missing")).toBeNull();
});
