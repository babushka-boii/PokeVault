import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { App } from "../app/App";
import { priceAge } from "../components/home/age";
import { callsTo, homeValuation, ratesDown, stubHome, userA } from "../test/homeFixtures";
import { jsonResponse as json } from "../test/tcgFixtures";

afterEach(() => vi.unstubAllGlobals());
const main = () => within(screen.getByRole("main"));
const hero = async () => within(await screen.findByRole("region", { name: "VALOR DE TU COLECCIÓN" }));
const week = (total: string) => ({ started_on: "2026-11-01", points: [{ day: "2026-11-01", total }], baseline: { day: "2026-11-18", total } });

describe("greeting", () => {
  test("greets the user by first name with the avatar in a reserved trainer slot", async () => {
    stubHome();
    render(<App initialEntries={["/"]} />);
    expect(await (await hero()).findByRole("heading", { level: 2, name: "Hola, Ash" })).toBeVisible();
    const slot = document.querySelector(".pv-home__trainer")!;
    expect(slot).toBeInTheDocument();
    expect(slot).toHaveAttribute("aria-hidden", "true");        // the name is already in the text
    // A square with the diagonal cut, and the picture (or initials) filling all of it.
    const frame = slot.querySelector(".pv-avatar-frame")!;
    expect(frame).toHaveClass("pv-cut");
    expect(frame.querySelector(".pv-avatar-frame__fill")).not.toBeNull();
    expect(slot.querySelector(".pv-avatar")).toBeNull();                // no round avatar inside a box
  });

  test.each([
    ["a single name", "Brock", "Hola, Brock"],
    ["a long name", "  María José  Gómez ", "Hola, María"],
    ["an empty name", "   ", "Hola"],
  ])("handles %s", async (_label, name, expected) => {
    stubHome({ user: { ...userA, display_name: name } });
    render(<App initialEntries={["/"]} />);
    expect(await (await hero()).findByRole("heading", { level: 2, name: expected })).toBeVisible();
  });

  test("speaks English", async () => {
    stubHome();
    const user = userEvent.setup();
    render(<App initialEntries={["/"]} />);
    await user.click(await screen.findByRole("button", { name: "English" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Hi, Ash" })).toBeVisible();
  });
});

describe("seven-day change", () => {
  test("shows an arrow, the amount and the percentage when the value went up", async () => {
    stubHome({ history: week("1000") });
    render(<App initialEntries={["/"]} />);
    const change = await (await hero()).findByText(/en 7 días/);
    expect(change).toBeVisible();
    expect(change).toHaveTextContent("▲ Subió $112 (11,2%) en 7 días");
    expect(change).toHaveAttribute("data-direction", "up");
    // Never only a colour: the arrow is drawn and a word is announced.
    expect(within(change).getByText("Subió")).toHaveClass("pv-sr-only");
    expect((await hero()).getByText("Incluye las cartas que agregaste o quitaste.")).toBeVisible();
  });

  test("shows a down arrow and the word 'bajó' when it fell", async () => {
    stubHome({ history: week("1500") });
    render(<App initialEntries={["/"]} />);
    const change = await (await hero()).findByText(/en 7 días/);
    expect(change).toHaveTextContent("▼ Bajó $388 (25,9%) en 7 días");
    expect(change).toHaveAttribute("data-direction", "down");
    expect(within(change).getByText("Bajó")).toBeInTheDocument();
  });

  test("says there was no change when the totals match", async () => {
    stubHome({ history: week("1112") });
    render(<App initialEntries={["/"]} />);
    const change = await (await hero()).findByText(/en 7 días/);
    expect(change).toHaveTextContent("= Sin cambios en 7 días");
    expect(change).toHaveAttribute("data-direction", "flat");
  });

  test("drops the percentage when the old total was zero", async () => {
    stubHome({ history: week("0") });
    render(<App initialEntries={["/"]} />);
    const change = await (await hero()).findByText(/en 7 días/);
    expect(change).toHaveTextContent("▲ Subió $1.112 en 7 días");
    expect(change.textContent).not.toMatch(/%/);
  });

  test.each([
    ["no record that is seven days old", { started_on: "2026-11-24", points: [], baseline: null }],
    ["no records at all", {}],
  ])("is hidden with %s", async (_label, history) => {
    stubHome({ history });
    render(<App initialEntries={["/"]} />);
    await (await hero()).findByText(/1\.112/);
    await waitFor(() => expect(main().queryByText(/en 7 días/)).not.toBeInTheDocument());
    expect(main().queryByText("Incluye las cartas que agregaste o quitaste.")).not.toBeInTheDocument();
  });

  test("is hidden when the history fails, and the total still shows", async () => {
    stubHome({ history: () => json({}, 503) });
    render(<App initialEntries={["/"]} />);
    expect(await (await hero()).findByText(/1\.112/)).toBeVisible();
    expect(main().queryByText(/en 7 días/)).not.toBeInTheDocument();
  });

  test("is hidden without exchange rates, where the total itself is not converted", async () => {
    stubHome({ valuation: homeValuation({ ...ratesDown, original_totals: { EUR: "0.89" }, priced_count: 3 }), history: week("1000") });
    render(<App initialEntries={["/"]} />);
    await (await hero()).findByText(/0,89/);
    expect(main().queryByText(/en 7 días/)).not.toBeInTheDocument();
  });

  test("never delays the total: the history is a separate request", async () => {
    stubHome({ history: () => new Promise<Response>(() => undefined) });
    render(<App initialEntries={["/"]} />);
    expect(await (await hero()).findByText(/1\.112/)).toBeVisible();
    expect(main().queryByText(/en 7 días/)).not.toBeInTheDocument();
  });

  test("is asked for in the display currency", async () => {
    const request = stubHome({ history: week("1000") });
    const user = userEvent.setup();
    render(<App initialEntries={["/"]} />);
    await (await hero()).findByText(/en 7 días/);
    await user.click(within(screen.getByRole("group", { name: "Moneda de visualización" })).getByRole("button", { name: "USD" }));
    await waitFor(() => expect(callsTo(request, "/api/v1/collection/history").some(([input]) => new URL(input as string).searchParams.get("currency") === "USD")).toBe(true));
  });
});

describe("one price note for the page", () => {
  test("says how old the least fresh price is, next to the attribution, exactly once", async () => {
    stubHome();
    render(<App initialEntries={["/"]} />);
    const note = await main().findByText(/^Precios de referencia · actualizados hace/);
    expect(note).toBeVisible();
    expect(main().getAllByText(/Precios de referencia/)).toHaveLength(1);
    expect(main().getAllByRole("link", { name: "Rates By Exchange Rate API" })).toHaveLength(1);
    expect(note.closest("section")).toBe(screen.getByRole("region", { name: "VALOR DE TU COLECCIÓN" }));
  });

  test("omits the age when nothing is priced, and the attribution when nothing was converted", async () => {
    stubHome({ valuation: homeValuation({ ...ratesDown, prices_updated_at: null, original_totals: {}, priced_count: 0, unpriced_count: 5, unpriced_by_reason: { variant_unknown: 5 } }) });
    render(<App initialEntries={["/"]} />);
    await (await hero()).findByText("Conversión no disponible: se muestra el precio original.");
    expect(main().queryByText(/actualizados hace/)).not.toBeInTheDocument();
    expect(main().queryByRole("link", { name: "Rates By Exchange Rate API" })).not.toBeInTheDocument();
  });

  test("age wording", () => {
    const now = Date.parse("2026-11-25T12:00:00Z");
    expect(priceAge("2026-11-25T11:30:00Z", now)).toEqual({ unit: "lessThanHour" });
    expect(priceAge("2026-11-25T12:30:00Z", now)).toEqual({ unit: "lessThanHour" });   // a clock a little ahead
    expect(priceAge("2026-11-25T11:00:00Z", now)).toEqual({ unit: "hours", count: 1 });
    expect(priceAge("2026-11-25T00:00:00Z", now)).toEqual({ unit: "hours", count: 12 });
    expect(priceAge("2026-11-23T13:00:00Z", now)).toEqual({ unit: "hours", count: 47 });
    expect(priceAge("2026-11-23T12:00:00Z", now)).toEqual({ unit: "days", count: 2 });
    expect(priceAge("2026-11-01T12:00:00Z", now)).toEqual({ unit: "days", count: 24 });
  });

  test("is in English", async () => {
    stubHome();
    const user = userEvent.setup();
    render(<App initialEntries={["/"]} />);
    await user.click(await screen.findByRole("button", { name: "English" }));
    expect(await main().findByText(/^Reference prices · updated .* ago$/)).toBeVisible();
  });
});

describe("empty collection", () => {
  test("keeps the page: greeting, zero value and a first step instead of a replacement panel", async () => {
    stubHome({ valuation: homeValuation({ copy_count: 0, priced_count: 0, unpriced_count: 0, unpriced_by_reason: {}, total: "0", original_totals: {}, sources: {}, top: [], prices_updated_at: null }) });
    render(<App initialEntries={["/"]} />);
    expect(await (await hero()).findByRole("heading", { level: 2, name: "Hola, Ash" })).toBeVisible();
    expect((await hero()).getByText(/\$0/)).toBeVisible();
    expect((await hero()).getByText("Agrega tu primera carta")).toBeVisible();
    expect((await hero()).getByRole("link", { name: "Buscar en expansiones" })).toHaveAttribute("href", "/sets");
    expect(main().queryByText(/actualizados hace/)).not.toBeInTheDocument();
    expect(main().queryByText(/en 7 días/)).not.toBeInTheDocument();
    expect(main().getAllByRole("link", { name: "Escanear carta" }).length).toBeGreaterThan(0);
  });
});

describe("new-user guide", () => {
  test("lists three steps and crosses out the ones that are done", async () => {
    stubHome({ guide: { has_copy: true, has_stored: false, has_favorite: false, dismissed: false } });
    render(<App initialEntries={["/"]} />);
    const list = await main().findByRole("list", { name: "Primeros pasos" });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([expect.stringContaining("Escanea tu primera carta"), expect.stringContaining("Guárdala en una carpeta"), expect.stringContaining("Marca tu favorita ★")]);
    expect(within(items[0]).getByText("Escanea tu primera carta").closest("a")).toHaveAttribute("href", "/scanner");
    expect(within(items[1]).getByRole("link")).toHaveAttribute("href", "/binders");
    expect(within(items[2]).getByRole("link")).toHaveAttribute("href", "/collection");
    // Done means crossed out *and* named as done: never colour or a line alone.
    expect(items[0]).toHaveAttribute("data-done", "true");
    expect(within(items[0]).getByText("(hecho)")).toHaveClass("pv-sr-only");
    expect(items[1]).toHaveAttribute("data-done", "false");
    expect(within(items[1]).queryByText("(hecho)")).not.toBeInTheDocument();
    expect(within(items[0]).getByText("Escanea tu primera carta")).toHaveStyle({ textDecoration: "line-through" });
  });

  test("is hidden once dismissed, and while it loads or fails", async () => {
    stubHome({ guide: { dismissed: true } });
    render(<App initialEntries={["/"]} />);
    await (await hero()).findByText(/1\.112/);
    expect(main().queryByRole("list", { name: "Primeros pasos" })).not.toBeInTheDocument();
  });

  test("a failed request hides it silently", async () => {
    stubHome({ guide: () => json({}, 500) });
    render(<App initialEntries={["/"]} />);
    await (await hero()).findByText(/1\.112/);
    expect(main().queryByRole("list", { name: "Primeros pasos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("closing it asks the server and removes it for good", async () => {
    let closed = false;
    const request = stubHome({ guide: () => json({ has_copy: false, has_stored: false, has_favorite: false, dismissed: closed }),
      override: (url, options) => { if (url.pathname === "/api/v1/home/guide" && options?.method === "PUT") { closed = true; return json({ has_copy: false, has_stored: false, has_favorite: false, dismissed: true }); } return undefined; } });
    const user = userEvent.setup();
    render(<App initialEntries={["/"]} />);
    await main().findByRole("list", { name: "Primeros pasos" });
    await user.click(main().getByRole("button", { name: "Cerrar guía" }));
    await waitFor(() => expect(main().queryByRole("list", { name: "Primeros pasos" })).not.toBeInTheDocument());
    const put = callsTo(request, "/api/v1/home/guide").find(([, options]) => (options as RequestInit | undefined)?.method === "PUT")!;
    expect(JSON.parse(String((put[1] as RequestInit).body))).toEqual({ dismissed: true });
    expect((put[1] as RequestInit).headers).toMatchObject({ "X-CSRF-Token": "csrf" });
  });

  test("a failed close keeps the guide and says so", async () => {
    stubHome({ guide: { has_copy: false, has_stored: false, has_favorite: false, dismissed: false },
      override: (url, options) => (url.pathname === "/api/v1/home/guide" && options?.method === "PUT" ? json({}, 500) : undefined) });
    const user = userEvent.setup();
    render(<App initialEntries={["/"]} />);
    await user.click(await main().findByRole("button", { name: "Cerrar guía" }));
    expect(await main().findByRole("alert")).toHaveTextContent("No se pudo cerrar la guía.");
    expect(main().getByRole("list", { name: "Primeros pasos" })).toBeVisible();
  });

  test("is not requested for guests", async () => {
    const request = stubHome({ guest: true });
    render(<App initialEntries={["/"]} />);
    await screen.findByText("TU BÓVEDA TCG");
    expect(callsTo(request, "/api/v1/home/guide")).toHaveLength(0);
    expect(callsTo(request, "/api/v1/collection/history")).toHaveLength(0);
  });
});

describe("avatar", () => {
  test("a picture fills the cut-corner square and is decorative next to the name", async () => {
    stubHome({ user: { ...userA, picture_url: "https://example.test/ash.png" } });
    render(<App initialEntries={["/"]} />);
    await screen.findByRole("heading", { level: 2, name: "Hola, Ash" });
    const image = document.querySelector(".pv-home__trainer img") as HTMLImageElement;
    expect(image).toHaveClass("pv-avatar-frame__fill");
    expect(image).toHaveAttribute("alt", "");
    expect(image).toHaveAttribute("width", "64"); expect(image).toHaveAttribute("height", "64");
    expect(image).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(image.closest(".pv-avatar-frame")).toHaveStyle({ "--pv-avatar-size": "64px" });
  });

  test("initials fill the same square when the picture fails", async () => {
    stubHome({ user: { ...userA, picture_url: "https://example.test/broken.png" } });
    render(<App initialEntries={["/"]} />);
    const image = await waitFor(() => { const found = document.querySelector<HTMLImageElement>(".pv-home__trainer img"); if (!found) throw new Error("no image yet"); return found; });
    fireEvent.error(image);
    await waitFor(() => expect(document.querySelector(".pv-home__trainer .pv-avatar-frame__fill--fallback")).toHaveTextContent("AK"));
  });
});
