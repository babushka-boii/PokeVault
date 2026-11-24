import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, test } from "vitest";
import { BoxesRedirect } from "./BoxesRedirect";

function Where() {
  const location = useLocation();
  return <output aria-label="location">{location.pathname}{location.search}</output>;
}

function open(url: string) {
  render(<MemoryRouter initialEntries={[url]}>
    <Routes><Route path="/boxes" element={<BoxesRedirect />} /><Route path="*" element={<Where />} /></Routes>
  </MemoryRouter>);
  return screen.getByLabelText("location").textContent;
}

describe("old /boxes links", () => {
  test.each([
    ["/boxes", "/pokedex"],
    ["/boxes?box=19", "/pokedex"],
    ["/boxes?wallpaper=ocean", "/pokedex"],
    ["/boxes?box=19&wallpaper=night", "/pokedex"],
  ])("%s goes to the Pokédex", (from, to) => {
    expect(open(from)).toBe(to);
  });

  test.each([
    ["/boxes?mode=personal", "/binders"],
    ["/boxes?mode=personal&box=3&wallpaper=forest", "/binders"],
    ["/boxes?mode=personal&pokemon=25", "/binders"],  // the personal mode wins
  ])("%s goes to the binders", (from, to) => {
    expect(open(from)).toBe(to);
  });

  test.each([
    ["/boxes?pokemon=25", "/pokemon/25/cards?returnTo=%2Fpokedex"],
    ["/boxes?box=19&pokemon=559&wallpaper=ocean", "/pokemon/559/cards?returnTo=%2Fpokedex"],
    ["/boxes?pokemon=1", "/pokemon/1/cards?returnTo=%2Fpokedex"],
    ["/boxes?pokemon=1025", "/pokemon/1025/cards?returnTo=%2Fpokedex"],
  ])("%s opens that species' gallery", (from, to) => {
    expect(open(from)).toBe(to);
  });

  test.each(["0", "1026", "-1", "1.5", "abc", "", "01", "25abc", "%2525", "99999"])("an unusable pokemon value %j goes to the Pokédex", (value) => {
    expect(open(`/boxes?pokemon=${value}`)).toBe("/pokedex");
  });

  test("a repeated pokemon parameter is ambiguous and goes to the Pokédex", () => {
    expect(open("/boxes?pokemon=25&pokemon=26")).toBe("/pokedex");
  });
});
