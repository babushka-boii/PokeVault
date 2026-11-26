import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { Link, MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider } from "../auth/AuthProvider";
import { CurrencyProvider } from "../components/prices/CurrencyProvider";
import { LocaleProvider } from "../i18n/LocaleProvider";
import { RouteMemory } from "../app/RouteMemory";
import { TcgCardPage } from "./TcgCardPage";
import { cardPath } from "../services/cards";
import { jsonResponse as json, pikachuCard } from "../test/tcgFixtures";
afterEach(() => vi.unstubAllGlobals());
function Probe({ explicit }: { explicit: boolean | string }) {
  const location = useLocation(); const navigate = useNavigate();
  return <><output aria-label="Route">{location.pathname + location.search}</output>
    <button onClick={() => navigate(-1)}>Browser back</button>
    <Link to={cardPath(pikachuCard.id, typeof explicit === "string" ? explicit : explicit ? location.pathname + location.search : undefined)}>Open card</Link></>;
}
function setup(origin: string, explicit: boolean | string = true, direct = false) {
  vi.stubGlobal("fetch", vi.fn(async (input: string) => input.includes("/auth/me") ? json({}, 401) : input.includes("/api/v1/cards/") ? json(pikachuCard) : json({}, 503)));
  render(<LocaleProvider><AuthProvider><CurrencyProvider><MemoryRouter initialEntries={[direct ? cardPath(pikachuCard.id) : origin]}>
    <RouteMemory><Probe explicit={explicit} /><Routes><Route path="/cards/:id" element={<TcgCardPage />} /><Route path="*" element={<h1>Origin</h1>} /></Routes></RouteMemory>
  </MemoryRouter></CurrencyProvider></AuthProvider></LocaleProvider>);
}
const origins = [
  ["/", "Volver al Inicio"], ["/profile", "Volver al Perfil"],
  ["/collection?q=pika&variant=unknown&order=name&page=3", "Volver a Mi colección"],
  ["/collection/00000000-0000-4000-8000-000000000001", "Volver a Mi colección"],
  ["/pokemon/25?page=2", "Volver a la galería"], ["/sets?page=2", "Volver a expansiones"],
  ["/sets/sm9?ownership=owned&page=2", "Volver a la expansión"],
  ["/binders/00000000-0000-4000-8000-000000000001?page=3", "Volver a la carpeta"],
  ["/binders", "Mis carpetas"], ["/scanner", "Volver al escáner"], ["/pokedex?generation=1", "Volver a la Pokédex"],
];
test.each(origins)("card return preserves %s and labels its source", async (origin, label) => {
  setup(origin); const user = userEvent.setup();
  expect(screen.getByRole("link", { name: "Open card" })).toHaveAttribute("href", cardPath(pikachuCard.id, origin));
  await user.click(screen.getByRole("link", { name: "Open card" }));
  const back = await screen.findByRole("link", { name: label });
  expect(back).toHaveAttribute("href", origin);
  await user.click(back);
  expect(screen.getByLabelText("Route")).toHaveTextContent(origin);
  expect(screen.getByRole("heading", { name: "Origin" })).toBeVisible();
});
test("missing returnTo uses observed app history", async () => {
  setup("/profile", false); const user = userEvent.setup();
  await user.click(screen.getByRole("link", { name: "Open card" }));
  await user.click(await screen.findByRole("link", { name: "Volver al Perfil" }));
  expect(screen.getByLabelText("Route")).toHaveTextContent("/profile");
});
test("a direct card entry with no history falls back to the Pokédex", async () => {
  setup("/", false, true); const user = userEvent.setup();
  await user.click(await screen.findByRole("link", { name: "Volver a la Pokédex" }));
  expect(screen.getByLabelText("Route")).toHaveTextContent("/pokedex");
});
test("browser back retains the real source and restores its scroll", async () => {
  setup("/collection?page=3"); const user = userEvent.setup();
  const scroll = vi.fn(); vi.stubGlobal("scrollTo", scroll);
  vi.stubGlobal("scrollY", 640);
  act(() => window.dispatchEvent(new Event("scroll")));
  await user.click(screen.getByRole("link", { name: "Open card" }));
  await screen.findByRole("link", { name: "Volver a Mi colección" });
  vi.stubGlobal("scrollY", 0);
  await user.click(screen.getByRole("button", { name: "Browser back" }));
  expect(screen.getByLabelText("Route")).toHaveTextContent("/collection?page=3");
  await waitFor(() => expect(scroll).toHaveBeenCalledWith(0, 640));
});

test("profile return label is localized in English", async () => {
  localStorage.setItem("pokevault.locale", "en");
  setup("/profile");
  const user = userEvent.setup();
  await user.click(screen.getByRole("link", { name: "Open card" }));
  expect(await screen.findByRole("link", { name: "Back to Profile" })).toHaveAttribute("href", "/profile");
});

test("invalid external returnTo falls back to observed app history", async () => {
  setup("/profile", "https://evil.example");
  const user = userEvent.setup();
  await user.click(screen.getByRole("link", { name: "Open card" }));
  await user.click(await screen.findByRole("link", { name: "Volver al Perfil" }));
  expect(screen.getByLabelText("Route")).toHaveTextContent("/profile");
});
