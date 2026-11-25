import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { App } from "../app/App";
import { callsTo, homeValuation, ratesDown, stubHome, userB } from "../test/homeFixtures";
import { jsonResponse as json } from "../test/tcgFixtures";

afterEach(() => vi.unstubAllGlobals());
const main = () => within(screen.getByRole("main"));
const GAP = [{ day: "2026-11-01", total: "10000" }, { day: "2026-11-25", total: "13000" }];
const recorded = { started_on: "2026-11-01", points: GAP, baseline: { day: "2026-11-18", total: "11000" } };
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

async function settled() {
  await main().findByRole("img");                                     // the chart
  await main().findByRole("link", { name: "Favoritas" });             // the bookcase
  await waitFor(() => expect(main().getAllByRole("link", { name: /^Card \d/ }).length).toBeGreaterThan(0));
  await main().findAllByRole("progressbar");                          // expansions
}

describe("signed-in order and requests", () => {
  test("sections come in the agreed order", async () => {
    stubHome({ history: recorded, guide: { has_copy: true, has_stored: false, has_favorite: false, dismissed: false } });
    render(<App initialEntries={["/"]} />);
    await settled();
    const names = [...screen.getByRole("main").querySelectorAll("section[aria-labelledby]")]
      .map((section) => document.getElementById(section.getAttribute("aria-labelledby")!.split(" ")[0])?.textContent);
    expect(names).toEqual(["VALOR DE TU COLECCIÓN", "Escáner de cartas", "Primeros pasos", "Tus cartas", "Mis carpetas", "Expansiones", "Valor de tu colección"]);
  });

  test("a normal load makes each request once and none for a binder's detail", async () => {
    const request = stubHome({ history: recorded });
    render(<App initialEntries={["/"]} />);
    await settled();
    for (const path of ["/api/v1/prices/collection", "/api/v1/collection/history", "/api/v1/home/guide", "/api/v1/binders", "/api/v1/prices/binders", "/api/v1/binders/views/unassigned", "/api/v1/binders/views/recent", "/api/v1/sets/progress"]) {
      expect(callsTo(request, path), path).toHaveLength(1);
    }
    // Lazy tabs and unused data are not requested.
    for (const path of ["/api/v1/favorites/cards", "/api/v1/binders/views/added", "/api/v1/prices/copies"]) expect(callsTo(request, path), path).toHaveLength(0);
    expect(request.mock.calls.some(([input]) => /\/binders\/[0-9a-f-]{36}$/.test(new URL(input as string).pathname))).toBe(false);
  });

  test("no copy UUID appears in text or accessible names anywhere on the page", async () => {
    stubHome({ history: recorded, guide: { dismissed: false, has_copy: true, has_stored: false, has_favorite: false } });
    render(<App initialEntries={["/"]} />);
    await settled();
    const page = screen.getByRole("main");
    expect(page.textContent).not.toMatch(UUID);
    for (const element of page.querySelectorAll("[aria-label],[title],[alt]")) {
      for (const name of ["aria-label", "title", "alt"]) expect(element.getAttribute(name) ?? "", `${element.tagName} ${name}`).not.toMatch(UUID);
    }
  });
});

describe("states", () => {
  test("loading: every section holds its place with skeletons and a status text", async () => {
    const never = () => new Promise<Response>(() => undefined);
    stubHome({ valuation: never, history: never, guide: never, override: (url) => (["/api/v1/binders", "/api/v1/binders/views/recent"].includes(url.pathname) ? (never() as never) : undefined) });
    render(<App initialEntries={["/"]} />);
    for (const label of ["Cargando valor…", "Cargando tus cartas…", "Cargando tus carpetas…", "Cargando el historial…", "Cargando avance de expansiones…"]) {
      expect(await main().findByText(label), label).toBeInTheDocument();
    }
    expect(main().queryByRole("progressbar")).not.toBeInTheDocument();          // never a spinner
    expect(main().queryByRole("list", { name: "Primeros pasos" })).not.toBeInTheDocument();   // the optional guide waits silently
  });

  test("prices down: the page stays usable, with retry where it helps and recorded history intact", async () => {
    stubHome({ valuation: () => json({}, 503), history: recorded, override: (url) => (url.pathname === "/api/v1/prices/binders" ? json({}, 503) : undefined) });
    render(<App initialEntries={["/"]} />);
    expect(await main().findByText("No pudimos cargar el valor de tu colección por ahora. Tus cartas están a salvo.")).toBeVisible();
    expect(main().getByText("No pudimos cargar tus cartas más valiosas por ahora.")).toBeVisible();
    expect(await main().findByRole("img")).toBeVisible();                         // the recorded history is still there
    expect(await main().findByRole("link", { name: "Favoritas" })).toBeVisible();   // binders without values
    expect(main().queryByText(/en 7 días/)).not.toBeInTheDocument();
    expect(main().getByRole("region", { name: "Expansiones" })).toBeVisible();
  });

  test("exchange rates down: original totals, no change line, no attribution", async () => {
    stubHome({ valuation: homeValuation({ ...ratesDown, original_totals: { EUR: "0.89" }, priced_count: 3 }), history: recorded });
    render(<App initialEntries={["/"]} />);
    const hero = within(await screen.findByRole("region", { name: "VALOR DE TU COLECCIÓN" }));
    expect(await hero.findByText("Conversión no disponible: se muestra el precio original.")).toBeVisible();
    expect(main().queryByText(/en 7 días/)).not.toBeInTheDocument();
    expect(main().queryByRole("link", { name: "Rates By Exchange Rate API" })).not.toBeInTheDocument();
  });

  test("the card catalog down: names fall back to catalog ids and everything else works", async () => {
    stubHome({ history: recorded, override: (url) => (url.pathname.startsWith("/api/v1/cards/") ? json({}, 503) : undefined) });
    render(<App initialEntries={["/"]} />);
    const cards = within(await screen.findByRole("region", { name: "Tus cartas" }));
    await waitFor(() => expect(cards.getAllByRole("link", { name: /^sv\d-\d$/ }).length).toBeGreaterThan(0));
    expect(cards.getAllByRole("listitem")[0].querySelector(".price-amount")).toHaveTextContent("$5.000");
    expect(await main().findByRole("img")).toBeVisible();
    expect(screen.queryByText(UUID)).not.toBeInTheDocument();
  });

  test("one failing section never takes the others with it", async () => {
    stubHome({ history: () => json({}, 500), override: (url) => (url.pathname === "/api/v1/binders" ? json({}, 500) : undefined) });
    render(<App initialEntries={["/"]} />);
    expect(await main().findByText("No pudimos cargar el historial de valor por ahora.")).toBeVisible();
    expect(await main().findByText("No pudimos cargar tus carpetas por ahora.")).toBeVisible();
    expect(await main().findByText(/1\.112/)).toBeVisible();
    expect(await main().findAllByRole("progressbar")).not.toHaveLength(0);
    expect(main().getAllByRole("link", { name: /^Card \d/ }).length).toBeGreaterThan(0);
  });

  test("a new user: zero value, empty states everywhere, the guide open and the page whole", async () => {
    stubHome({
      valuation: homeValuation({ copy_count: 0, priced_count: 0, unpriced_count: 0, unpriced_by_reason: {}, total: "0", original_totals: {}, sources: {}, top: [], prices_updated_at: null }),
      binders: [], recent: [], history: { started_on: null, points: [], baseline: null },
      guide: { has_copy: false, has_stored: false, has_favorite: false, dismissed: false },
    });
    render(<App initialEntries={["/"]} />);
    expect(await main().findByRole("list", { name: "Primeros pasos" })).toBeVisible();
    expect(await main().findByText("Aún no hay copias con precio para mostrar.")).toBeVisible();
    expect(await main().findByRole("heading", { name: "Tu primera carpeta te espera" })).toBeVisible();
    expect(await main().findByText("Aún no hay expansiones con cartas tuyas.")).toBeVisible();
    expect(await main().findByText(/^Aún no hay registros\./)).toBeVisible();
    expect(main().getByRole("heading", { level: 2, name: "Hola, Ash" })).toBeVisible();
  });

  test("a different account never sees the previous account's data", async () => {
    stubHome({ history: recorded, user: userB });
    render(<App initialEntries={["/"]} />);
    expect(await main().findByRole("heading", { level: 2, name: "Hola, Misty" })).toBeVisible();
    expect(main().queryByText("Hola, Ash")).not.toBeInTheDocument();
  });

  test("every section that fails explains itself kindly, offers Reintentar and never raises an alarm", async () => {
    const down = () => json({}, 503);
    stubHome({
      valuation: down, history: down, guide: down, favorites: down,
      override: (url) => (["/api/v1/binders", "/api/v1/binders/views/recent"].includes(url.pathname) ? json({}, 503) : undefined),
    });
    render(<App initialEntries={["/"]} />);
    for (const message of [
      "No pudimos cargar el valor de tu colección por ahora. Tus cartas están a salvo.",
      "No pudimos cargar tus cartas más valiosas por ahora.",
      "No pudimos cargar tus carpetas por ahora.",
      "No pudimos cargar el avance de tus expansiones por ahora.",
      "No pudimos cargar el historial de valor por ahora.",
      "No pudimos cargar tus primeros pasos por ahora.",
    ]) {
      const note = (await main().findByText(message)).closest(".pv-inline-error")!;
      expect(note, message).toHaveAttribute("role", "status");
      expect(within(note as HTMLElement).getByRole("button", { name: "Reintentar" }), message).toBeVisible();
    }
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(main().queryByText(/se pudo cargar|se pudieron cargar/)).not.toBeInTheDocument();    // no curt "could not" wording left
  });
});
