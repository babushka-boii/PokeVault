import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "../app/App";
import { binderId, binderWorld, physical, pocketOf } from "../test/binderFixtures";
import { jsonResponse as json } from "../test/tcgFixtures";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
afterEach(() => vi.unstubAllGlobals());

function expectNoUuid(root: HTMLElement) {
  expect(root.textContent).not.toMatch(UUID);
  for (const element of root.querySelectorAll("[aria-label]")) expect(element.getAttribute("aria-label")).not.toMatch(UUID);
}

test("the shelf lists binders with counts and gold values from one value request", async () => {
  const world = binderWorld({ binders: [{ name: "Kanto", pockets: [pocketOf(1, 1, physical(0)), pocketOf(1, 2, physical(1))] }, { name: "Repetidas", pockets: [] }], tray: [physical(2)] });
  render(<App initialEntries={["/binders"]} />);
  const kanto = await screen.findByRole("article", { name: "Kanto" });
  expect(within(kanto).getByRole("link", { name: "Kanto" })).toHaveAttribute("href", `/binders/${binderId(1)}`);
  expect(within(kanto).getByText("2 cartas")).toBeVisible();
  expect(await within(kanto).findByLabelText(/^Valor: \$3\.000$/)).toBeVisible();
  expect(within(screen.getByRole("article", { name: "Repetidas" })).getByText("0 cartas")).toBeVisible();
  expect(screen.getByRole("link", { name: "1 carta sin carpeta · guardar" })).toHaveAttribute("href", `/binders/${binderId(1)}`);
  expect(screen.getByRole("link", { name: "Rates By Exchange Rate API" })).toBeVisible();
  expect(world.calls.filter((c) => c.path === "/api/v1/prices/binders")).toHaveLength(1);
  expect(world.calls.some((c) => /\/binders\/[^/]+\/value$/.test(c.path))).toBe(false);
  expectNoUuid(screen.getByRole("main"));
});

test("an empty shelf invites the first binder and creates it", async () => {
  const world = binderWorld({ binders: [] });
  const user = userEvent.setup();
  render(<App initialEntries={["/binders"]} />);
  expect(await screen.findByRole("heading", { name: "Tu primera carpeta te espera" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Escanear carta" })).toHaveAttribute("href", "/scanner");
  await user.type(screen.getByLabelText("Nombre de la nueva carpeta"), "  Kanto  ");
  await user.click(screen.getByRole("button", { name: "Crear carpeta" }));
  expect(await screen.findByRole("article", { name: "Kanto" })).toBeVisible();
  expect(world.mutations()).toEqual([{ method: "POST", path: "/api/v1/binders", body: { name: "Kanto" } }]);
});

test("renames, reorders and deletes with confirmation; the cards return to the tray", async () => {
  const world = binderWorld({ binders: [{ name: "Kanto", pockets: [pocketOf(1, 1, physical(0))] }, { name: "Johto", pockets: [] }] });
  const user = userEvent.setup();
  render(<App initialEntries={["/binders"]} />);
  const kanto = await screen.findByRole("article", { name: "Kanto" });
  await user.click(within(kanto).getByText("Gestionar Kanto"));
  await user.click(within(kanto).getByRole("button", { name: "Renombrar" }));
  await user.clear(within(kanto).getByLabelText("Nombre de la carpeta"));
  await user.type(within(kanto).getByLabelText("Nombre de la carpeta"), "Kanto 151");
  await user.click(within(kanto).getByRole("button", { name: "Guardar nombre" }));
  const renamed = await screen.findByRole("article", { name: "Kanto 151" });
  await user.click(within(renamed).getByText("Gestionar Kanto 151"));
  expect(within(renamed).getByRole("button", { name: "Mover antes" })).toBeDisabled();
  await user.click(within(renamed).getByRole("button", { name: "Mover después" }));
  await waitFor(() => expect(world.mutations().find((c) => c.path === "/api/v1/binders/order")?.body).toEqual({ binder_ids: [binderId(2), binderId(1)] }));
  const johto = screen.getByRole("article", { name: "Johto" });
  await user.click(within(johto).getByText("Gestionar Johto"));
  await user.click(within(johto).getByRole("button", { name: "Eliminar carpeta" }));
  expect(within(johto).getByText("Sus cartas vuelven a la bandeja «Sin carpeta»; tu colección no cambia.")).toBeVisible();
  await user.click(within(johto).getByRole("button", { name: "Confirmar eliminación" }));
  await waitFor(() => expect(screen.queryByRole("article", { name: "Johto" })).not.toBeInTheDocument());
  expect(world.mutations().map((c) => `${c.method} ${c.path}`)).toEqual([
    `PUT /api/v1/binders/${binderId(1)}`, "PUT /api/v1/binders/order", `DELETE /api/v1/binders/${binderId(2)}`,
  ]);
  expect(world.mutations()[0].body).toEqual({ name: "Kanto 151" });
});

test("guests are invited to sign in and make no private requests", async () => {
  const request = vi.fn(async (input: string) => new URL(input).pathname === "/api/v1/auth/me" ? json({}, 401) : json({}, 500));
  vi.stubGlobal("fetch", request);
  render(<App initialEntries={["/binders"]} />);
  expect(await screen.findByRole("link", { name: "Iniciar sesión" })).toHaveAttribute("href", "/login");
  expect(request.mock.calls.every(([input]) => new URL(input).pathname === "/api/v1/auth/me")).toBe(true);
});

test("a value outage keeps the shelf usable", async () => {
  const world = binderWorld({ binders: [{ name: "Kanto", pockets: [pocketOf(1, 1, physical(0))] }] });
  world.fail("GET", "/api/v1/prices/binders", () => json({}, 503));
  render(<App initialEntries={["/binders"]} />);
  const kanto = await screen.findByRole("article", { name: "Kanto" });
  expect(within(kanto).getByText("1 carta")).toBeVisible();
  await waitFor(() => expect(within(kanto).queryByLabelText(/^Valor:/)).not.toBeInTheDocument());
  expect(within(kanto).getByRole("link", { name: "Kanto" })).toBeVisible();
});
