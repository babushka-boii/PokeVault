import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { App } from "../../app/App";
import { binderId, binderWorld, physical, pocketOf } from "../../test/binderFixtures";
import { stubMedia } from "../../test/media";
import { placePopover } from "./albumLayout";

afterEach(() => vi.unstubAllGlobals());
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const grid = (page: number) => screen.getByRole("grid", { name: `Página ${page}` });
const findGrid = (page: number) => screen.findByRole("grid", { name: `Página ${page}` });
const rect = (left: number, top: number, width = 60, height = 84) => ({ left, top, width, height, right: left + width, bottom: top + height }) as DOMRect;
const viewport = { width: 1280, height: 720 };
const size = { width: 288, height: 220 };

describe("popover placement", () => {
  test("goes to the right of the pocket when it fits", () => {
    const placed = placePopover(rect(200, 200), size, viewport);
    expect(placed).toEqual({ left: 268, top: 200, side: "right" });
  });
  test("flips to the left at the right edge", () => {
    const placed = placePopover(rect(1150, 200), size, viewport);
    expect(placed.side).toBe("left");
    expect(placed.left).toBe(1150 - 8 - 288);
  });
  test("is clamped inside the viewport at the top, bottom and left edges", () => {
    expect(placePopover(rect(200, -40), size, viewport).top).toBe(8);
    expect(placePopover(rect(200, 690), size, viewport).top).toBe(720 - 220 - 8);
    expect(placePopover(rect(1230, 300), size, { width: 300, height: 720 }).left).toBeGreaterThanOrEqual(8);
  });
});

describe("contextual controls", () => {
  test("an occupied pocket shows its facts and actions with no UUID, and Escape gives focus back", async () => {
    binderWorld({ binders: [{ name: "Tesoros", pockets: [pocketOf(1, 1, physical(0))] }] });
    const user = userEvent.setup();
    render(<App initialEntries={[`/binders/${binderId(1)}`]} />);
    const pocket = await within(await findGrid(1)).findByRole("button", { name: /^Página 1, bolsillo 1: Card 1/ });
    await user.click(pocket);
    const dialog = await screen.findByRole("dialog", { name: "Card 1 · Expansion 1" });
    expect(dialog).not.toHaveAttribute("aria-modal");             // non-modal on desktop
    expect(within(dialog).getByText(/Holográfica · Inglés · Casi impecable/)).toBeVisible();
    expect(within(dialog).getByText(/\$1\.500/)).toBeVisible();
    for (const name of ["Ver carta", "Mover a otro bolsillo", "Mover a otra carpeta", "Sacar de la carpeta"]) {
      expect(within(dialog).getByRole(name === "Ver carta" ? "link" : "button", { name })).toBeVisible();
    }
    expect(dialog.textContent).not.toMatch(UUID);
    for (const element of dialog.querySelectorAll("[aria-label],[title]")) {
      expect(element.getAttribute("aria-label") ?? "").not.toMatch(UUID);
      expect(element.getAttribute("title") ?? "").not.toMatch(UUID);
    }
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(pocket).toHaveFocus();
  });

  test("a press outside closes it and does not activate the pocket underneath", async () => {
    binderWorld({ binders: [{ name: "Tesoros", pockets: [pocketOf(1, 1, physical(0)), pocketOf(1, 2, physical(1))] }] });
    const user = userEvent.setup();
    render(<App initialEntries={[`/binders/${binderId(1)}`]} />);
    const first = await within(await findGrid(1)).findByRole("button", { name: /^Página 1, bolsillo 1:/ });
    await user.click(first);
    await screen.findByRole("dialog", { name: "Card 1 · Expansion 1" });
    await user.click(within(grid(1)).getByRole("button", { name: /^Página 1, bolsillo 2:/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // The press only dismissed: the second pocket's own controls did not open.
    expect(screen.queryByRole("dialog", { name: "Card 2 · Expansion 2" })).not.toBeInTheDocument();
  });

  test("the move button leaves the dialog and starts an explicit move mode with a cancel", async () => {
    const world = binderWorld({ binders: [{ name: "Tesoros", pockets: [pocketOf(1, 1, physical(0))] }] });
    const user = userEvent.setup();
    render(<App initialEntries={[`/binders/${binderId(1)}`]} />);
    const source = await within(await findGrid(1)).findByRole("button", { name: /^Página 1, bolsillo 1:/ });
    await user.click(source);
    await user.click(await screen.findByRole("button", { name: "Mover a otro bolsillo" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(/Moviendo Card 1 · Expansion 1/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Cancelar movimiento" }));
    expect(screen.queryByText(/Moviendo/)).not.toBeInTheDocument();
    expect(source).toHaveFocus();
    expect(world.mutations()).toEqual([]);
  });
});

describe("move mode never mutates by navigation", () => {
  async function startMove() {
    const world = binderWorld({ binders: [{ name: "Tesoros", pockets: [pocketOf(1, 1, physical(0)), pocketOf(1, 3, physical(1))] }] });
    const user = userEvent.setup();
    render(<App initialEntries={[`/binders/${binderId(1)}`]} />);
    await user.click(await within(await findGrid(1)).findByRole("button", { name: /^Página 1, bolsillo 1:/ }));
    await user.click(await screen.findByRole("button", { name: "Mover a otro bolsillo" }));
    return { world, user };
  }

  test("arrows, Home, End and page turns cause zero placement requests; Enter on an empty pocket exactly one", async () => {
    const { world, user } = await startMove();
    const first = within(grid(1)).getAllByRole("button")[0];
    first.focus();
    await user.keyboard("{ArrowRight}{ArrowDown}{ArrowLeft}{ArrowUp}{End}{Home}");
    await user.click(screen.getByRole("button", { name: "Página siguiente ›" }));
    await user.click(screen.getByRole("button", { name: "‹ Página anterior" }));
    expect(world.mutations()).toEqual([]);
    within(grid(1)).getByRole("button", { name: "Página 1, bolsillo 2: vacío" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(world.mutations()).toHaveLength(1));
    expect(world.mutations()[0]).toMatchObject({ method: "PUT", path: `/api/v1/binders/${binderId(1)}/pockets/1/2` });
  });

  test("an occupied destination is never overwritten", async () => {
    const { world, user } = await startMove();
    await user.click(within(grid(1)).getByRole("button", { name: /^Página 1, bolsillo 3: Card 2/ }));
    expect(world.mutations()).toEqual([]);
    expect(screen.getByText(/Moviendo Card 1/)).toBeVisible();   // still moving
  });

  test("Escape cancels the move and returns focus to the source", async () => {
    const { world, user } = await startMove();
    await user.keyboard("{Escape}");
    expect(screen.queryByText(/Moviendo/)).not.toBeInTheDocument();
    expect(within(grid(1)).getByRole("button", { name: /^Página 1, bolsillo 1:/ })).toHaveFocus();
    expect(world.mutations()).toEqual([]);
  });
});

describe("phone sheet", () => {
  test("is a modal dialog that keeps Tab inside and restores focus on close", async () => {
    stubMedia({ mobile: true });
    binderWorld({ binders: [{ name: "Tesoros", pockets: [pocketOf(1, 1, physical(0))] }] });
    const user = userEvent.setup();
    render(<App initialEntries={[`/binders/${binderId(1)}`]} />);
    const pocket = await within(await findGrid(1)).findByRole("button", { name: /^Página 1, bolsillo 1:/ });
    await user.click(pocket);
    const sheet = await screen.findByRole("dialog", { name: "Card 1 · Expansion 1" });
    expect(sheet).toHaveAttribute("aria-modal", "true");
    const controls = within(sheet).getAllByRole("button").concat(within(sheet).getAllByRole("link"));
    expect(controls.length).toBeGreaterThanOrEqual(5);
    const inside = () => sheet.contains(document.activeElement);
    for (let step = 0; step < controls.length + 2; step++) { await user.tab(); expect(inside()).toBe(true); }
    for (let step = 0; step < controls.length + 2; step++) { await user.tab({ shift: true }); expect(inside()).toBe(true); }
    await user.click(within(sheet).getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(pocket).toHaveFocus();
  });
});

describe("choosing from the tray", () => {
  test("an empty pocket opens the tray choice in two explicit steps and Cancel restores the pocket focus", async () => {
    const world = binderWorld({ binders: [{ name: "Tesoros", pockets: [] }], tray: [physical(0)] });
    const user = userEvent.setup();
    render(<App initialEntries={[`/binders/${binderId(1)}`]} />);
    const empty = await within(await findGrid(1)).findByRole("button", { name: "Página 1, bolsillo 4: vacío" });
    await user.click(empty);
    // Step 1: the controls open; nothing is in fill mode yet.
    const dialog = await screen.findByRole("dialog", { name: "Pág. 1 · bolsillo 4" });
    expect(screen.queryByText(/Toca una carta para guardarla en la página 1, bolsillo 4/)).not.toBeInTheDocument();
    // Step 2: choosing from the tray enters fill mode with a visible cue.
    await user.click(within(dialog).getByRole("button", { name: "Elegir de la bandeja" }));
    expect(screen.getByText("Toca una carta para guardarla en la página 1, bolsillo 4.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Cancelar elección" }));
    expect(screen.queryByText(/en la página 1, bolsillo 4/)).not.toBeInTheDocument();
    expect(empty).toHaveFocus();
    expect(world.mutations()).toEqual([]);
  });
});
