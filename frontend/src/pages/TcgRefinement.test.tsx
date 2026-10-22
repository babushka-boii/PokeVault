import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "../app/App";
import { jsonResponse, pikachuCard, speciesDetails, tcgPage } from "../test/tcgFixtures";

const teamUp = { id: "sm9", name: "Unión de Aliados", name_language: "es", logo_url: "https://assets.tcgdex.net/es/sm/sm9/logo.png", symbol_url: null,
  logo_sources: [{ url: "https://assets.tcgdex.net/es/sm/sm9/logo.png", language: "es" }, { url: "https://assets.tcgdex.net/en/sm/sm9/logo.png", language: "en" }],
  serie: { id: "sm", name: "Sol y Luna" }, release_date: "2019-02-01" };
const noLogo = { ...teamUp, id: "promo", name: "Promocionales", logo_url: null, logo_sources: [], serie: null, release_date: null };
const anotherNoLogo = { ...noLogo, id: "promo2", name: "Promocionales especiales" };
const sets = [teamUp, noLogo, anotherNoLogo];
afterEach(() => vi.unstubAllGlobals());
function gallery() {
  const request = vi.fn((value: string) => {
    const url = new URL(value);
    const selected = sets.find((set) => set.id === url.searchParams.get("set_id")) ?? teamUp;
    return Promise.resolve(jsonResponse(value.includes("/cards?") ? tcgPage([{ ...pikachuCard, id: `${selected.id}-33`, set: selected }], {
      sets, sets_complete: true, page: Number(url.searchParams.get("page")),
    }) : speciesDetails()));
  });
  vi.stubGlobal("fetch", request);
  return request;
}

test("searchable expansion picker uses the full set pool and independently selects sets without logos", async () => {
  const request = gallery();
  const user = userEvent.setup();
  render(<App initialEntries={["/pokemon/25/cards?page=3&returnTo=%2Fboxes%3Fbox%3D1%26pokemon%3D25"]} />);
  await screen.findByRole("heading", { name: "Pikachu & Zekrom-GX" });
  await user.click(screen.getByRole("button", { name: /Expansión/ }));
  const dialog = screen.getByRole("dialog", { name: "Elegir expansión" });
  expect(within(dialog).getByText("Sol y Luna · 2019")).toBeVisible();
  expect(within(dialog).getByRole("heading", { name: "Otras" })).toBeVisible();
  await user.type(within(dialog).getByRole("searchbox", { name: "Buscar expansión" }), "especiales");
  expect(within(dialog).queryByRole("button", { name: "Promocionales" })).not.toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Promocionales especiales" }));
  await waitFor(() => expect(request).toHaveBeenCalledWith(expect.stringContaining("page=1&page_size=12&sort=name&set_id=promo2"), expect.anything()));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: "Pikachu & Zekrom-GX" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Expansión Promocionales especiales" }));
  expect(screen.getByRole("button", { name: "Promocionales especiales" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Promocionales" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Unión de Aliados" })).toBeVisible();
});

test("logo failure tries documented formats and verified English artwork before moving the named expansion to Other", async () => {
  gallery();
  const user = userEvent.setup();
  render(<App initialEntries={["/pokemon/25/cards"]} />);
  await screen.findByRole("heading", { name: "Pikachu & Zekrom-GX" });
  await user.click(screen.getByRole("button", { name: /Expansión/ }));
  const dialog = screen.getByRole("dialog");
  const logo = within(dialog).getByRole("img", { name: "Unión de Aliados" });
  fireEvent.error(logo);
  expect(within(dialog).getByRole("img", { name: "Unión de Aliados" })).toHaveAttribute("src", "https://assets.tcgdex.net/es/sm/sm9/logo.webp");
  fireEvent.error(within(dialog).getByRole("img", { name: "Unión de Aliados" }));
  expect(within(dialog).getByRole("img", { name: "Unión de Aliados" })).toHaveAttribute("src", "https://assets.tcgdex.net/es/sm/sm9/logo.jpg");
  fireEvent.error(within(dialog).getByRole("img", { name: "Unión de Aliados" }));
  expect(within(dialog).getByRole("img", { name: "Unión de Aliados" })).toHaveAttribute("src", "https://assets.tcgdex.net/en/sm/sm9/logo.png");
  for (let attempt = 0; attempt < 3; attempt += 1) fireEvent.error(within(dialog).getByRole("img", { name: "Unión de Aliados" }));
  expect(within(dialog).queryByRole("img", { name: "Unión de Aliados" })).not.toBeInTheDocument();
  const others = within(dialog).getByRole("group", { name: "Otras" });
  expect(within(others).getByRole("button", { name: /Unión de Aliados/ })).toBeVisible();
});

test("expansion picker supports keyboard selection, Escape and outside dismissal with focus return", async () => {
  gallery();
  const user = userEvent.setup();
  render(<App initialEntries={["/pokemon/25/cards"]} />);
  await screen.findByRole("heading", { name: "Pikachu & Zekrom-GX" });
  const trigger = screen.getByRole("button", { name: /Expansión/ });
  trigger.focus();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("searchbox")).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  await user.keyboard("{Enter}");
  await user.click(screen.getByRole("heading", { level: 1 }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("chronological controls request a new complete server order and retain navigation context", async () => {
  const request = gallery();
  const user = userEvent.setup();
  render(<App initialEntries={["/pokemon/25/cards?page=3&returnTo=%2Fboxes%3Fwallpaper%3Docean"]} />);
  await screen.findByRole("heading", { name: "Pikachu & Zekrom-GX" });
  await user.selectOptions(screen.getByRole("combobox", { name: "Ordenar por" }), "newest");
  await waitFor(() => expect(request).toHaveBeenCalledWith(expect.stringContaining("page=1&page_size=12&sort=newest"), expect.anything()));
  await screen.findByRole("heading", { name: "Pikachu & Zekrom-GX" });
  expect(screen.getByRole("link", { name: "Volver" })).toHaveAttribute("href", "/boxes?wallpaper=ocean");
  await user.selectOptions(screen.getByRole("combobox", { name: "Ordenar por" }), "oldest");
  await waitFor(() => expect(request).toHaveBeenCalledWith(expect.stringContaining("sort=oldest"), expect.anything()));
});

test("detail presents TCG defensive metadata and two independently validated return destinations", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ ...pikachuCard, set: teamUp,
    weaknesses: [{ type: "Fighting", value: "×2" }], resistances: [{ type: "Metal", value: "-30" }], retreat: 3, regulation_mark: "F",
    abilities: [{ name: "TCG Power", type: "Ability", effect: "An official card effect." }],
  }))));
  const origin = "/boxes?box=19&pokemon=559&wallpaper=ocean";
  const returnTo = `/pokemon/25/cards?sort=newest&page=2&${new URLSearchParams({ returnTo: origin })}`;
  render(<App initialEntries={[`/cards/sm9-33?${new URLSearchParams({ returnTo })}`]} />);
  await screen.findByRole("heading", { level: 1, name: "Pikachu & Zekrom-GX" });
  expect(screen.getByText("Fighting ×2")).toBeVisible();
  expect(screen.getByText("Metal -30")).toBeVisible();
  expect(screen.getByText("Retirada").nextElementSibling).toHaveTextContent("3");
  expect(screen.getByText("Marca de regulación").nextElementSibling).toHaveTextContent("F");
  expect(screen.getByRole("heading", { name: "TCG Power" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Volver a la galería" })).toHaveAttribute("href", returnTo);
  expect(screen.getByRole("link", { name: "Volver a Cajas" })).toHaveAttribute("href", origin);
  await user.click(screen.getByRole("button", { name: "English" }));
  await screen.findByRole("link", { name: "Back to gallery" });
  expect(await screen.findByText("Weaknesses")).toBeVisible();
});

test("a nested external return destination never creates an external link", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(pikachuCard)));
  const returnTo = `/pokemon/25/cards?${new URLSearchParams({ returnTo: "https://evil.example" })}`;
  render(<App initialEntries={[`/cards/sm9-33?${new URLSearchParams({ returnTo })}`]} />);
  await screen.findByRole("heading", { level: 1, name: "Pikachu & Zekrom-GX" });
  expect(screen.getByRole("link", { name: "Volver a Pokédex" })).toHaveAttribute("href", "/pokedex");
});
