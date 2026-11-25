import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { App } from "../app/App";
import { CHART, daysBetween, line, plot, ticks, yRange } from "../components/charts/chartMath";
import { callsTo, stubHome } from "../test/homeFixtures";
import { jsonResponse as json } from "../test/tcgFixtures";

afterEach(() => vi.unstubAllGlobals());
const chart = async () => within(await screen.findByRole("region", { name: "Valor de tu colección" }));
const point = (day: string, total: string) => ({ day, total });
const history = (points: { day: string; total: string }[], extra = {}) => ({ started_on: points[0]?.day ?? null, points, baseline: null, ...extra });
const GAP = [point("2026-11-01", "10000"), point("2026-11-04", "11000"), point("2026-11-20", "14000"), point("2026-11-25", "13000")];

describe("chart maths", () => {
  test("x follows the real date, so a gap is a long segment, and y follows the value", () => {
    const plotted = plot(GAP);
    expect(plotted.map((p) => p.day)).toEqual(GAP.map((p) => p.day));                  // one place per record, none added
    expect(plotted[0].x).toBe(CHART.left);
    expect(plotted[3].x).toBe(CHART.width - CHART.right);
    const span = CHART.width - CHART.left - CHART.right;
    expect(plotted[1].x - plotted[0].x).toBeCloseTo((span * 3) / 24, 6);               // 3 of 24 days
    expect(plotted[2].x - plotted[1].x).toBeCloseTo((span * 16) / 24, 6);              // the 16-day gap is a long line
    expect(plotted[2].y).toBeLessThan(plotted[0].y);                                    // higher value, higher on the chart
    expect(daysBetween("2026-11-04", "2026-11-20")).toBe(16);
  });

  test("the line joins the real records in order, across gaps, with nothing in between", () => {
    const path = line(plot(GAP));
    expect(path.match(/[ML]/g)).toEqual(["M", "L", "L", "L"]);                          // 4 records, 3 segments
    expect(path.startsWith("M")).toBe(true);
  });

  test("a single record is centred, and a flat series gets a visible band", () => {
    const [only] = plot([point("2026-11-25", "12000")]);
    expect(only.x).toBe(CHART.left + (CHART.width - CHART.left - CHART.right) / 2);
    const flat = yRange([point("2026-11-01", "5000"), point("2026-11-02", "5000")]);
    expect(flat.max).toBeGreaterThan(flat.min);
    const ys = plot([point("2026-11-01", "5000"), point("2026-11-02", "5000")]).map((p) => p.y);
    expect(ys[0]).toBe(ys[1]);
  });

  test("the axis never goes below zero and ticks span it evenly", () => {
    expect(yRange([point("2026-11-01", "0"), point("2026-11-02", "10")]).min).toBe(0);
    const axis = ticks(GAP, 4);
    expect(axis).toHaveLength(4);
    expect(axis[0].value).toBeLessThan(axis[3].value);
    expect(axis[0].y).toBeGreaterThan(axis[3].y);
    expect(plot([])).toEqual([]);
  });
});

describe("the chart on Home", () => {
  test("draws a gold line with a dot per record, joining across days with no record", async () => {
    stubHome({ history: history(GAP) });
    render(<App initialEntries={["/"]} />);
    const section = await chart();
    const picture = await section.findByRole("img");
    const dots = [...picture.querySelectorAll("circle")];
    expect(dots.map((dot) => dot.getAttribute("data-day"))).toEqual(GAP.map((p) => p.day));   // a dot for every record, only those
    expect(picture.querySelectorAll("path")).toHaveLength(1);
    expect(picture.querySelector("path")!.getAttribute("d")!.match(/[ML]/g)).toHaveLength(4);
    expect(picture.querySelector("path")).toHaveClass("pv-chart__line");
  });

  test("the summary and the hidden table list only the recorded days", async () => {
    stubHome({ history: history(GAP) });
    render(<App initialEntries={["/"]} />);
    const section = await chart();
    const picture = await section.findByRole("img");
    expect(picture).toHaveAccessibleName("Del 1 nov 2026 al 25 nov 2026: de $10.000 a $13.000.");
    const table = section.getByRole("table", { name: "Valor registrado de tu colección" });
    expect(within(table).getAllByRole("row")).toHaveLength(1 + GAP.length);              // header + the four recorded days
    expect(within(table).getAllByRole("rowheader").map((cell) => cell.textContent)).toEqual(["1 nov 2026", "4 nov 2026", "20 nov 2026", "25 nov 2026"]);
    expect(within(table).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["$10.000", "$11.000", "$14.000", "$13.000"]);
    expect(table.closest(".pv-sr-only") ?? table).toHaveClass("pv-sr-only");
  });

  test("one record is a dot with an honest note about when recording began", async () => {
    stubHome({ history: history([point("2026-11-25", "12000")]) });
    render(<App initialEntries={["/"]} />);
    const section = await chart();
    const picture = await section.findByRole("img");
    expect(picture.querySelectorAll("circle")).toHaveLength(1);
    expect(picture.querySelectorAll("path")).toHaveLength(0);
    expect(picture).toHaveAccessibleName("25 nov 2026: $12.000.");
    expect(section.getByText("Empezamos a registrar tu colección el 25 nov 2026. Vuelve mañana para ver el gráfico.")).toBeVisible();
  });

  test("with no records it says so and draws nothing", async () => {
    stubHome({ history: history([], { started_on: null }) });
    render(<App initialEntries={["/"]} />);
    const section = await chart();
    expect(await section.findByText(/^Aún no hay registros\./)).toBeVisible();
    expect(section.queryByRole("img")).not.toBeInTheDocument();
    expect(section.queryByRole("table")).not.toBeInTheDocument();
  });

  test("records exist but none has a value in this currency or period: it says that, without inventing a line", async () => {
    stubHome({ history: history([], { started_on: "2026-10-01" }) });
    render(<App initialEntries={["/"]} />);
    const section = await chart();
    expect(await section.findByText("No hay registros con valor en CLP para este período.")).toBeVisible();
    expect(section.queryByRole("img")).not.toBeInTheDocument();
  });

  test("shows a skeleton with a status while loading, and an inline retry on error", async () => {
    let fail = true;
    const request = stubHome({ history: () => (fail ? json({}, 500) : json({ currency: "CLP", range: "30d", ...history(GAP) })) });
    const user = userEvent.setup();
    render(<App initialEntries={["/"]} />);
    const section = await chart();
    expect(await section.findByText("No pudimos cargar el historial de valor por ahora.")).toBeVisible();
    fail = false;
    await user.click(section.getByRole("button", { name: "Reintentar" }));
    expect(await section.findByRole("img")).toBeVisible();
    expect(callsTo(request, "/api/v1/collection/history").length).toBeGreaterThanOrEqual(2);
  });

  test("while the history loads a skeleton of the same body holds the place", async () => {
    stubHome({ history: () => new Promise<Response>(() => undefined) });
    render(<App initialEntries={["/"]} />);
    const section = await chart();
    expect((await section.findByText("Cargando el historial…")).parentElement).toHaveAttribute("aria-busy", "true");
    expect(document.querySelector(".pv-chart__body")).toBeInTheDocument();
  });
});

describe("ranges and currency", () => {
  const calls = (request: ReturnType<typeof stubHome>) => callsTo(request, "/api/v1/collection/history").map(([input]) => new URL(input as string).searchParams)
    .map((params) => `${params.get("range")}:${params.get("currency")}`);

  test("the default 30 days shares the hero's request: one call for both", async () => {
    const request = stubHome({ history: history(GAP) });
    render(<App initialEntries={["/"]} />);
    await (await chart()).findByRole("img");
    expect(calls(request)).toEqual(["30d:CLP"]);
  });

  test("each range asks once, and the 30 days is not asked again when it comes back", async () => {
    const request = stubHome({ history: (url) => json({ currency: "CLP", range: url.searchParams.get("range"), ...history(GAP) }) });
    const user = userEvent.setup();
    render(<App initialEntries={["/"]} />);
    const section = await chart();
    await section.findByRole("img");
    expect(section.getByRole("button", { name: "30 d" })).toHaveAttribute("aria-pressed", "true");
    await user.click(section.getByRole("button", { name: "7 d" }));
    await waitFor(() => expect(section.getByRole("button", { name: "7 d" })).toHaveAttribute("aria-pressed", "true"));
    await user.click(section.getByRole("button", { name: "1 año" }));
    await user.click(section.getByRole("button", { name: "30 d" }));
    await section.findByRole("img");
    expect(calls(request).sort()).toEqual(["1y:CLP", "30d:CLP", "7d:CLP"]);
  });

  test("the display currency drives the request and the labels", async () => {
    const request = stubHome({ history: (url) => json({ currency: url.searchParams.get("currency"), range: "30d", ...history(GAP.map((p) => point(p.day, url.searchParams.get("currency") === "USD" ? "12.50" : p.total))) }) });
    const user = userEvent.setup();
    render(<App initialEntries={["/"]} />);
    await (await chart()).findByRole("img");
    await user.click(within(screen.getByRole("group", { name: "Moneda de visualización" })).getByRole("button", { name: "USD" }));
    await waitFor(() => expect(calls(request)).toContain("30d:USD"));
    const picture = await (await chart()).findByRole("img", { name: /US\$12,50|USD ?12,50/ });
    expect(picture).toBeVisible();
  });

  test("is in English", async () => {
    stubHome({ history: history(GAP) });
    const user = userEvent.setup();
    render(<App initialEntries={["/"]} />);
    await user.click(await screen.findByRole("button", { name: "English" }));
    const section = within(await screen.findByRole("region", { name: "Your collection value" }));
    expect(await section.findByRole("img")).toHaveAccessibleName(/^From Nov 1, 2026 to Nov 25, 2026: from CLP\s10,000 to CLP\s13,000\.$/);
    expect(section.getByRole("button", { name: "1 year" })).toBeVisible();
  });

  test("guests never request it", async () => {
    const request = stubHome({ guest: true });
    render(<App initialEntries={["/"]} />);
    await screen.findByText("TU BÓVEDA TCG");
    expect(callsTo(request, "/api/v1/collection/history")).toHaveLength(0);
    expect(screen.queryByRole("region", { name: "Valor de tu colección" })).not.toBeInTheDocument();
  });
});
