import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { App } from "../app/App";
import { binder, callsTo, stubHome } from "../test/homeFixtures";
import { jsonResponse as json } from "../test/tcgFixtures";

afterEach(() => vi.unstubAllGlobals());
const shelf = async () => within(await screen.findByRole("region", { name: "Mis carpetas" }));
const binders = (count: number) => Array.from({ length: count }, (_, index) => binder(index + 1, `Carpeta ${index + 1}`, { copy_count: index + 1 }));

describe("the bookcase", () => {
  test("puts three covers on each of two shelves, always six places", async () => {
    stubHome({ binders: binders(5) });
    render(<App initialEntries={["/"]} />);
    const section = await shelf();
    await section.findByRole("link", { name: "Carpeta 1" });
    const list = section.getByRole("list");
    expect(list).toHaveClass("pv-bookcase");
    expect(list.children).toHaveLength(6);                                  // four are covers' places, one is empty: the bookcase never shrinks
    const items = section.getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items.map((item) => item.getAttribute("data-shelf"))).toEqual(["1", "1", "1", "2", "2"]);
    // The empty place is decoration only.
    const empty = [...list.children].filter((child) => child.classList.contains("pv-bookcase__item--empty"));
    expect(empty).toHaveLength(1);
    expect(empty[0]).toHaveAttribute("aria-hidden", "true");
  });

  test("each cover shows name, count and gold value, and links to its binder", async () => {
    stubHome({ binders: binders(2) });
    render(<App initialEntries={["/"]} />);
    const section = await shelf();
    const first = (await section.findAllByRole("listitem"))[0];
    expect(within(first).getByRole("link", { name: "Carpeta 1" })).toHaveAttribute("href", `/binders/${binders(1)[0].id}`);
    expect(within(first).getByText("1 carta")).toBeVisible();
    expect(await within(first).findByLabelText(/^Valor: \$1\.500$/)).toBeVisible();
    expect(first.querySelector(".price-amount")).toHaveTextContent("$1.500");
    expect(first.querySelector(".pv-cover")).toHaveAttribute("aria-hidden", "true");     // the name link is the accessible one
  });

  test("at most six covers; more are reached with 'Ver todas'", async () => {
    stubHome({ binders: binders(9) });
    render(<App initialEntries={["/"]} />);
    const section = await shelf();
    await section.findByRole("link", { name: "Carpeta 1" });
    expect(section.getAllByRole("listitem").map((item) => item.getAttribute("data-shelf"))).toEqual(["1", "1", "1", "2", "2", "2"]);
    expect(section.queryByRole("link", { name: "Carpeta 7" })).not.toBeInTheDocument();
    expect(section.getByText("+ 3 más")).toBeVisible();
    expect(section.getByRole("link", { name: "Ver todas las carpetas" })).toHaveAttribute("href", "/binders");
  });

  test("with no binders it draws an empty bookcase and invites the first one", async () => {
    stubHome({ binders: [] });
    render(<App initialEntries={["/"]} />);
    const section = await shelf();
    expect(await section.findByRole("heading", { name: "Tu primera carpeta te espera" })).toBeVisible();
    const drawn = document.querySelector(".pv-bookcase--empty")!;
    expect(drawn).toHaveAttribute("aria-hidden", "true");
    expect(drawn.children).toHaveLength(6);
    expect(section.queryByRole("listitem")).not.toBeInTheDocument();
    expect(section.getByRole("link", { name: "+ Nueva carpeta" })).toHaveAttribute("href", "/binders");
  });

  test("while loading it shows a bookcase-shaped skeleton and a status text", async () => {
    stubHome({ override: (url) => (url.pathname === "/api/v1/binders" ? new Promise<Response>(() => undefined) as never : undefined) });
    render(<App initialEntries={["/"]} />);
    const section = await shelf();
    expect(await section.findByText("Cargando tus carpetas…")).toBeInTheDocument();
    const drawn = document.querySelector(".pv-bookcase--skeleton")!;
    expect(drawn).toHaveAttribute("aria-hidden", "true");
    expect(drawn.children).toHaveLength(6);
  });

  test("a failed list retries by itself and the rest of the page keeps working", async () => {
    let fail = true;
    const request = stubHome({ override: (url) => (url.pathname === "/api/v1/binders" && fail ? json({}, 500) : undefined) });
    const user = userEvent.setup();
    render(<App initialEntries={["/"]} />);
    const section = await shelf();
    expect(await section.findByText("No pudimos cargar tus carpetas por ahora.")).toBeVisible();
    expect(await screen.findByRole("region", { name: "Expansiones" })).toBeVisible();
    fail = false;
    await user.click(section.getByRole("button", { name: "Reintentar" }));
    expect(await section.findByRole("link", { name: "Favoritas" })).toBeVisible();
    expect(callsTo(request, "/api/v1/binders")).toHaveLength(2);
  });

  test("keeps one grouped value request and never asks for a binder's details", async () => {
    const request = stubHome({ binders: binders(6) });
    render(<App initialEntries={["/"]} />);
    const section = await shelf();
    await waitFor(() => expect(section.getAllByLabelText(/^Valor:/)).toHaveLength(6));
    expect(callsTo(request, "/api/v1/prices/binders")).toHaveLength(1);
    expect(request.mock.calls.some(([input]) => /\/binders\/[^/]+(\/value)?$/.test(new URL(input as string).pathname))).toBe(false);
  });
});
