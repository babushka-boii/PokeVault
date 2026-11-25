import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "../app/App";
import { binderId, binderWorld, physical, pocketOf } from "../test/binderFixtures";
import { stubDex } from "../test/dexFixtures";

afterEach(() => vi.unstubAllGlobals());
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** The binder world plus the species index the editor searches. */
function world(pockets = [pocketOf(1, 1, physical(0))]) {
  const w = binderWorld({ binders: [{ name: "Tesoros", pockets }] });
  const base = w.request.getMockImplementation()!;
  const dex = stubDex();
  const index = dex.getMockImplementation()!;
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => new URL(input).pathname === "/api/v1/pokemon/index" ? index(input) : base(input, init)));
  return w;
}
const puts = (w: ReturnType<typeof world>) => w.calls.filter((c) => c.method === "PUT" && c.path.endsWith("/appearance"));
async function openEditor(user: ReturnType<typeof userEvent.setup>) {
  render(<App initialEntries={["/binders"]} />);
  const card = await screen.findByRole("article", { name: "Tesoros" });
  await user.click(within(card).getByText(/Gestionar/));
  await user.click(within(card).getByRole("button", { name: "Personalizar portada" }));
  return screen.getByRole("dialog", { name: "Personalizar portada" });
}

test("picks a material, sticks pixel stickers and saves one snapshot", async () => {
  const w = world(); const user = userEvent.setup();
  const dialog = await openEditor(user);
  expect(within(dialog).getAllByRole("button", { pressed: true }).some((b) => b.getAttribute("aria-label") === "Unova Noir")).toBe(true);
  await user.click(within(dialog).getByRole("button", { name: "Cuero café" }));
  await user.click(within(dialog).getByRole("button", { name: "Pegar Estrella" }));
  await user.click(within(dialog).getByRole("button", { name: "Pegar Rayo" }));
  expect(within(dialog).getByText("2 de 24 stickers")).toBeVisible();
  await user.click(within(dialog).getByRole("button", { name: "Guardar portada" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(puts(w)).toHaveLength(1);
  expect(puts(w)[0].body).toEqual({ cover: "brown_leather", stickers: [
    { kind: "pixel", species_id: null, pixel_key: "star", x: 50, y: 50, rotation: 0, scale: 1 },
    { kind: "pixel", species_id: null, pixel_key: "bolt", x: 50, y: 50, rotation: 0, scale: 1 }] });
  expect(document.querySelector(".pv-cover")).toHaveAttribute("data-cover", "brown_leather");   // the shelf shows the saved look
});

test("adds a Pokémon sticker from the species index, storing only its number", async () => {
  const w = world(); const user = userEvent.setup();
  const dialog = await openEditor(user);
  await user.type(await within(dialog).findByLabelText("Buscar Pokémon para pegar"), "pika");
  await user.click(await within(dialog).findByRole("button", { name: "Pegar Pikachu" }));
  await user.click(within(dialog).getByRole("button", { name: "Guardar portada" }));
  await waitFor(() => expect(puts(w)).toHaveLength(1));
  expect(puts(w)[0].body).toMatchObject({ stickers: [{ kind: "pokemon", species_id: 25, pixel_key: null }] });
  expect(JSON.stringify(puts(w)[0].body)).not.toMatch(/https?:|raw\.githubusercontent/);
});

test("a sticker moves with the arrow keys (Shift = 5) and the number fields, and is removed with Delete", async () => {
  world(); const user = userEvent.setup();
  const dialog = await openEditor(user);
  await user.click(within(dialog).getByRole("button", { name: "Pegar Corazón" }));
  const sticker = within(dialog).getByRole("button", { name: "Capa 1: Corazón (en la portada)" });
  sticker.focus();
  await user.keyboard("{ArrowRight}{ArrowRight}{Shift>}{ArrowDown}{/Shift}");
  expect(within(dialog).getByLabelText("Horizontal (%)")).toHaveValue(52);
  expect(within(dialog).getByLabelText("Vertical (%)")).toHaveValue(55);
  await user.clear(within(dialog).getByLabelText("Horizontal (%)")); await user.type(within(dialog).getByLabelText("Horizontal (%)"), "10");
  expect(within(dialog).getByLabelText("Horizontal (%)")).toHaveValue(10);
  await user.click(within(dialog).getByRole("button", { name: "Girar 5° a la derecha" }));
  await user.click(within(dialog).getByRole("button", { name: "Más grande" }));
  expect(within(dialog).getByRole("button", { name: "Capa 1: Corazón (en la portada)" }).style.transform).toContain("rotate(5deg)");
  expect(within(dialog).getByRole("button", { name: "Capa 1: Corazón (en la portada)" }).style.width).toBe("22%");   // 20% x 1.1
  within(dialog).getByRole("button", { name: "Capa 1: Corazón (en la portada)" }).focus();
  await user.keyboard("{Delete}");
  expect(within(dialog).queryByRole("button", { name: /^Capa 1/ })).not.toBeInTheDocument();
});

test("dragging with the pointer moves a sticker inside the cover and clamps at the edges", async () => {
  world(); const user = userEvent.setup();
  const dialog = await openEditor(user);
  await user.click(within(dialog).getByRole("button", { name: "Pegar Estrella" }));
  const canvas = dialog.querySelector<HTMLElement>(".pv-editor__canvas")!;
  canvas.getBoundingClientRect = () => ({ width: 400, height: 500, left: 0, top: 0, right: 400, bottom: 500, x: 0, y: 0, toJSON() { return {}; } });
  const sticker = within(dialog).getByRole("button", { name: "Capa 1: Estrella (en la portada)" });
  sticker.setPointerCapture = vi.fn(); sticker.hasPointerCapture = () => true; sticker.releasePointerCapture = vi.fn();
  fireEvent.pointerDown(sticker, { pointerId: 1, clientX: 200, clientY: 250 });
  fireEvent.pointerMove(sticker, { pointerId: 1, clientX: 240, clientY: 300 });
  expect(within(dialog).getByLabelText("Horizontal (%)")).toHaveValue(60);
  expect(within(dialog).getByLabelText("Vertical (%)")).toHaveValue(60);
  fireEvent.pointerMove(sticker, { pointerId: 1, clientX: 9999, clientY: -9999 });
  expect(within(dialog).getByLabelText("Horizontal (%)")).toHaveValue(100);
  expect(within(dialog).getByLabelText("Vertical (%)")).toHaveValue(0);
  fireEvent.pointerUp(sticker, { pointerId: 1 });
});

test("the limit is 24 stickers and the palette is then disabled", async () => {
  world(); const user = userEvent.setup();
  const dialog = await openEditor(user);
  for (let i = 0; i < 24; i += 1) await user.click(within(dialog).getByRole("button", { name: "Pegar Estrella" }));
  expect(within(dialog).getByText(/Llegaste al máximo de 24 stickers/)).toBeVisible();
  expect(within(dialog).getByRole("button", { name: "Pegar Estrella" })).toBeDisabled();
});

test("closing with unsaved changes asks first; keeping and discarding both work", async () => {
  const w = world(); const user = userEvent.setup();
  const dialog = await openEditor(user);
  await user.click(within(dialog).getByRole("button", { name: "Metálico" }));
  await user.keyboard("{Escape}");
  expect(screen.getByRole("alertdialog", { name: "¿Descartar los cambios sin guardar?" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Seguir editando" }));
  expect(screen.getByRole("dialog")).toBeVisible();
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }));
  await user.click(screen.getByRole("button", { name: "Descartar" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(puts(w)).toHaveLength(0);
});

test("a clean editor closes straight away, and no draft is kept in the browser", async () => {
  world(); const user = userEvent.setup();
  await openEditor(user);
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(Object.keys(localStorage).filter((k) => /cover|sticker|draft/i.test(k))).toEqual([]);
  expect(Object.keys(sessionStorage)).toEqual([]);
});

test("a failed save keeps the draft and says so", async () => {
  const w = world(); const user = userEvent.setup();
  const dialog = await openEditor(user);
  await user.click(within(dialog).getByRole("button", { name: "Pegar Rayo" }));
  w.fail("PUT", `/api/v1/binders/${binderId(1)}/appearance`, () => new Response(JSON.stringify({ detail: "x" }), { status: 500 }));
  await user.click(within(dialog).getByRole("button", { name: "Guardar portada" }));
  expect(await within(dialog).findByText("No pudimos guardar la portada. Tus cambios siguen aquí.")).toBeVisible();
  expect(within(dialog).getByRole("button", { name: "Capa 1: Rayo" })).toBeVisible();
  expect(within(dialog).getByRole("button", { name: "Guardar portada" })).toBeEnabled();
});

test("the editor never shows an identifier and is available in English", async () => {
  world(); const user = userEvent.setup();
  const dialog = await openEditor(user);
  expect(dialog.textContent).not.toMatch(UUID);
  for (const el of dialog.querySelectorAll("[aria-label],[title],[alt]")) for (const a of ["aria-label", "title", "alt"]) expect(el.getAttribute(a) ?? "").not.toMatch(UUID);
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "English" }));
  const card = screen.getByRole("article", { name: "Tesoros" });
  await user.click(within(card).getByRole("button", { name: "Customize cover" }));
  expect(screen.getByRole("dialog", { name: "Customize cover" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Brown leather" })).toBeVisible();
});

test("+ Agregar hojas adds two sheets, keeps them when empty and stops at 40", async () => {
  const w = world(); const user = userEvent.setup();
  render(<App initialEntries={[`/binders/${binderId(1)}`]} />);
  const add = await screen.findByRole("button", { name: "+ Agregar hojas" });
  expect(screen.getByRole("group", { name: /pág\. 1–2 de 2/ })).toBeVisible();
  await user.click(add);
  expect(await screen.findByRole("group", { name: /de 4/ })).toBeVisible();
  expect(w.calls.filter((c) => c.method === "POST" && c.path.endsWith("/pages"))).toHaveLength(1);
});
