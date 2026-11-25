import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "../app/App";
import { AuthContext } from "../auth/context";
import { BinderValue } from "../components/prices/BinderValue";
import { CurrencyContext } from "../components/prices/currency";
import { LocaleProvider } from "../i18n/LocaleProvider";
import { cardPrices, copyId, copyPrice, noRates, quote, valuation } from "../test/priceFixtures";
import { pikachuCard, jsonResponse as json } from "../test/tcgFixtures";

const profile = { id: "ash", display_name: "Ash", email: null, email_verified: true, picture_url: null };
const session = { user: profile, csrf_token: "csrf-test" };
afterEach(() => vi.unstubAllGlobals());

type Route = (url: URL, options?: RequestInit) => Response | Promise<Response> | undefined;
function serve(route: Route, signedIn = false) {
  const calls: { url: URL; options?: RequestInit }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string, options?: RequestInit) => {
    const url = new URL(input);
    calls.push({ url, options });
    if (url.pathname === "/api/v1/auth/me") return signedIn ? json(session) : new Response(null, { status: 401 });
    const answer = await route(url, options);
    if (answer) return answer;
    if (url.pathname.startsWith("/api/v1/cards/")) return json(pikachuCard);
    throw new Error(`Unexpected request ${url.pathname}`);
  }));
  return calls;
}
const priceCalls = (calls: { url: URL }[], path: string) => calls.filter((c) => c.url.pathname.startsWith(path));

// --- Card detail ---

test("card detail shows reference prices by variant with source, language note and attribution", async () => {
  const calls = serve((url) => url.pathname === "/api/v1/prices/cards/sm9-33" ? json(cardPrices(url.searchParams.get("currency") as "CLP" | "USD")) : undefined);
  const user = userEvent.setup();
  render(<App initialEntries={["/cards/sm9-33"]} />);
  const panel = (await screen.findByRole("heading", { name: "Precio de referencia" })).closest("section")!;
  expect(await within(panel).findByText("$38")).toBeVisible();
  expect(within(panel).getByText(/Original: EUR\s0,03 · Cardmarket \(tendencia\) · 22-11-2026/)).toBeVisible();
  expect(within(panel).getByText("Sin precio de mercado para esta variante")).toBeVisible();
  expect(within(panel).queryByText("Esta variante no existe en el catálogo")).not.toBeInTheDocument();
  expect(within(panel).getByText(/igual para cartas en español e inglés. No es una tasación/)).toBeVisible();
  const attribution = within(panel).getByRole("link", { name: "Rates By Exchange Rate API" });
  expect(attribution).toHaveAttribute("href", "https://www.exchangerate-api.com");
  expect(attribution).toHaveAttribute("rel", "noopener noreferrer");
  expect(priceCalls(calls, "/api/v1/prices/")[0].url.searchParams.get("currency")).toBe("CLP");

  await user.selectOptions(within(panel).getByLabelText("Moneda"), "USD");
  expect(await within(panel).findByText("US$0,04")).toBeVisible();
  expect(localStorage.getItem("pokevault.currency")).toBe("USD");
  expect(calls.some((c) => c.url.pathname === "/api/v1/me/settings")).toBe(false); // signed out: local only
});

test("signed-out visitors keep their stored currency", async () => {
  localStorage.setItem("pokevault.currency", "USD");
  const calls = serve((url) => url.pathname.startsWith("/api/v1/prices/") ? json(cardPrices("USD")) : undefined);
  render(<App initialEntries={["/cards/sm9-33"]} />);
  expect(await screen.findByText("US$0,04")).toBeVisible();
  expect(priceCalls(calls, "/api/v1/prices/").every((c) => c.url.searchParams.get("currency") === "USD")).toBe(true);
});

test("after sign-in the account preference wins over the local one", async () => {
  localStorage.setItem("pokevault.currency", "CLP");
  const calls = serve((url) => {
    if (url.pathname === "/api/v1/me/settings") return json({ preferred_currency: "USD" });
    if (url.pathname.startsWith("/api/v1/prices/cards/")) return json(cardPrices("USD"));
    if (url.pathname === "/api/v1/inventory") return json({ results: [], total: 0, quantities: {}, offset: 0, limit: 24 });
  }, true);
  render(<App initialEntries={["/cards/sm9-33"]} />);
  expect(await screen.findByText("US$0,04")).toBeVisible();
  expect(priceCalls(calls, "/api/v1/prices/").map((c) => c.url.searchParams.get("currency"))).toEqual(["USD"]);
  expect(localStorage.getItem("pokevault.currency")).toBe("USD");
});

test("changing the currency while signed in saves it to the account and reports failures", async () => {
  let fail = false;
  const calls = serve((url, options) => {
    if (url.pathname === "/api/v1/me/settings") {
      if (options?.method === "PUT") return fail ? new Response(null, { status: 503 }) : json(JSON.parse(options.body as string));
      return json({ preferred_currency: "CLP" });
    }
    if (url.pathname.startsWith("/api/v1/prices/cards/")) return json(cardPrices(url.searchParams.get("currency") as "CLP" | "USD"));
    if (url.pathname === "/api/v1/inventory") return json({ results: [], total: 0, quantities: {}, offset: 0, limit: 24 });
  }, true);
  const user = userEvent.setup();
  render(<App initialEntries={["/cards/sm9-33"]} />);
  await screen.findByText("$38");
  await user.selectOptions(screen.getByLabelText("Moneda"), "USD");
  await waitFor(() => expect(calls.filter((c) => c.options?.method === "PUT")).toHaveLength(1));
  const put = calls.find((c) => c.options?.method === "PUT")!;
  expect(put.options?.headers).toMatchObject({ "X-CSRF-Token": "csrf-test" });
  expect(put.options?.body).toBe(JSON.stringify({ preferred_currency: "USD" }));
  fail = true;
  await user.selectOptions(screen.getByLabelText("Moneda"), "CLP");
  expect(await screen.findByText(/No se pudo guardar la moneda en tu cuenta/)).toBeVisible();
  expect(await screen.findByText("$38")).toBeVisible();
});

// --- My collection ---

const inventoryCopy = (n: number, variant: string, notes: string) => ({ id: copyId(n), card_id: "sm9-33", condition: "near_mint", language: "es", variant,
  acquired_on: null, notes, created_at: "2026-11-07T12:00:00Z", updated_at: "2026-11-07T12:00:00Z" });

test("collection shows the list first, then a price per copy, and survives a price outage", async () => {
  let pricesUp = false;
  const copies = [inventoryCopy(1, "normal", "Normal copy"), inventoryCopy(2, "unknown", "Mystery copy")];
  const calls = serve((url) => {
    if (url.pathname === "/api/v1/me/settings") return json({ preferred_currency: "CLP" });
    if (url.pathname === "/api/v1/inventory") return json({ results: copies, total: 2, quantities: { "sm9-33": 2 }, offset: 0, limit: 24 });
    if (url.pathname === "/api/v1/prices/copies") return pricesUp
      ? json({ currency: "CLP", rates: cardPrices().rates, results: [copyPrice(1, quote("38")), copyPrice(2, null, "variant_unknown", "unknown")] })
      : new Response(null, { status: 503 });
  }, true);
  const user = userEvent.setup();
  render(<App initialEntries={["/collection"]} />);
  expect(await screen.findByText("Normal copy")).toBeVisible();
  expect(await screen.findByText("No se pudieron cargar los precios.")).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(priceCalls(calls, "/api/v1/prices/copies")[0].url.searchParams.getAll("copy_id")).toEqual([copyId(1), copyId(2)]);
  pricesUp = true;
  await user.click(screen.getByRole("button", { name: "Reintentar precios" }));
  const normal = screen.getByText("Normal copy").closest("li")!;
  expect(await within(normal).findByText("$38")).toBeVisible();
  expect(within(screen.getByText("Mystery copy").closest("li")!).getByText("Sin precio: indica la variante de la copia")).toBeVisible();
  expect(screen.getByRole("link", { name: "Rates By Exchange Rate API" })).toBeVisible();
});

test("the profile link opens the collection filtered to copies without a variant", async () => {
  const calls = serve((url) => {
    if (url.pathname === "/api/v1/me/settings") return json({ preferred_currency: "CLP" });
    if (url.pathname === "/api/v1/inventory") return json({ results: [inventoryCopy(2, "unknown", "Mystery copy")], total: 1, quantities: { "sm9-33": 1 }, offset: 0, limit: 24 });
    if (url.pathname === "/api/v1/prices/copies") return json({ currency: "CLP", rates: noRates, results: [copyPrice(2, null, "variant_unknown", "unknown")] });
  }, true);
  render(<App initialEntries={["/collection?variant=unknown"]} />);
  expect(await screen.findByText("Mystery copy")).toBeVisible();
  expect(screen.getByText("Mostrando copias sin variante.")).toBeVisible();
  expect(screen.getByLabelText("Variante")).toHaveValue("unknown");
  expect(priceCalls(calls, "/api/v1/inventory")[0].url.searchParams.get("variant")).toBe("unknown");
  expect(screen.queryByRole("link", { name: "Rates By Exchange Rate API" })).not.toBeInTheDocument();
});

// --- Profile ---

function profileServer(value: () => Response | Promise<Response>, extra: Route = () => undefined) {
  return serve((url, options) => {
    if (url.pathname === "/api/v1/me/settings") return json({ preferred_currency: "CLP" });
    if (url.pathname === "/api/v1/prices/collection") return value();
    return extra(url, options);
  }, true);
}

test("profile shows the collection value, copies without variant and the top copies", async () => {
  let pending = 1;
  const calls = profileServer(() => json(valuation({ pending_count: pending, unpriced_by_reason: { variant_unknown: 2, ...(pending ? { pending: 1 } : {}) }, copy_count: 5 + pending, unpriced_count: 2 + pending })));
  const user = userEvent.setup();
  render(<App initialEntries={["/profile"]} />);
  const card = (await screen.findByRole("heading", { name: "Valor de la colección" })).closest("section")!;
  expect(await within(card).findByText("$1.112")).toBeVisible();
  expect(within(card).getByText("3 de 6 copias con precio")).toBeVisible();
  expect(within(card).getByRole("link", { name: "Indicar variantes" })).toHaveAttribute("href", "/collection?variant=unknown");
  expect(within(card).getByText(/2 copias sin variante no tienen precio/)).toBeVisible();
  const top = within(card).getByRole("list");
  expect(await within(top).findByText(/Pikachu & Zekrom-GX · Holográfica/)).toBeVisible();
  expect(within(top).getByText("$1.038")).toBeVisible();
  expect(within(top).getByRole("link", { name: "Ver copia" })).toHaveAttribute("href", `/collection/${copyId(1)}`);
  expect(within(card).getByRole("link", { name: "Rates By Exchange Rate API" })).toBeVisible();
  expect(within(card).getByText("1 precios aún se están actualizando.")).toBeVisible();
  pending = 0;
  await user.click(within(card).getByRole("button", { name: "Reintentar precios" }));
  await waitFor(() => expect(within(card).queryByText(/aún se están actualizando/)).not.toBeInTheDocument());
  expect(priceCalls(calls, "/api/v1/prices/collection")).toHaveLength(2);
});

test("without exchange rates the profile shows original totals and no attribution", async () => {
  profileServer(() => json(valuation({ total: null, original_totals: { EUR: "0.89", USD: "0.66" }, top: [], rates: noRates })));
  render(<App initialEntries={["/profile"]} />);
  const card = (await screen.findByRole("heading", { name: "Valor de la colección" })).closest("section")!;
  expect(await within(card).findByText(/EUR\s0,89 \+ US\$0,66/)).toBeVisible();
  expect(within(card).getByText("Conversión no disponible: se muestra el precio original.")).toBeVisible();
  expect(within(card).queryByRole("link", { name: "Rates By Exchange Rate API" })).not.toBeInTheDocument();
});

test("logging out discards a pending collection value", async () => {
  let finish!: (response: Response) => void;
  profileServer(() => new Promise<Response>((resolve) => { finish = resolve; }), (url) => url.pathname === "/api/v1/auth/logout" ? new Response(null, { status: 204 }) : undefined);
  const user = userEvent.setup();
  render(<App initialEntries={["/profile"]} />);
  await screen.findByRole("heading", { name: "Valor de la colección" });
  await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
  expect(await screen.findByRole("link", { name: "Iniciar sesión" })).toBeVisible();
  await act(async () => { finish(json(valuation())); });
  expect(screen.queryByText("$1.112")).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Valor de la colección" })).not.toBeInTheDocument();
});

test("price texts and amounts follow the English locale", async () => {
  profileServer(() => json(valuation()));
  const user = userEvent.setup();
  render(<App initialEntries={["/profile"]} />);
  await screen.findByText("$1.112");
  await user.click(screen.getByRole("button", { name: "English" }));
  const card = screen.getByRole("heading", { name: "Collection value" }).closest("section")!;
  expect(within(card).getByText(/^CLP\s1,112$/)).toBeVisible();
  expect(within(card).getByText("3 of 5 copies priced")).toBeVisible();
  expect(within(card).getByRole("link", { name: "Set variants" })).toBeVisible();
  expect(within(card).getByText(/Market reference price, the same for Spanish and English cards/)).toBeVisible();
});

// --- Binder value ---

function renderBinderValue(binderId: string, version: string) {
  const auth = { status: "authenticated" as const, user: { ...profile }, error: null, loggingOut: false, retrySession: vi.fn(), logout: vi.fn(), getCsrfToken: () => "csrf-test" };
  const currency = { currency: "CLP" as const, ready: true, saveFailed: false, setCurrency: vi.fn() };
  const tree = (v: string) => <LocaleProvider><AuthContext.Provider value={auth}><CurrencyContext.Provider value={currency}>
    <BinderValue binderId={binderId} version={v} /></CurrencyContext.Provider></AuthContext.Provider></LocaleProvider>;
  const view = render(tree(version));
  return { rerender: (v: string) => view.rerender(tree(v)) };
}

test("a binder shows its own total and refreshes when its contents change", async () => {
  const binder = "11111111-1111-4111-8111-111111111111";
  let empty = false;
  const request = vi.fn(async (input: string) => {
    expect(new URL(input).pathname).toBe(`/api/v1/binders/${binder}/value`);
    return json(empty ? valuation({ total: "0", copy_count: 0, priced_count: 0, unpriced_count: 0, unpriced_by_reason: {}, top: [], original_totals: {}, sources: {} })
      : valuation({ total: "1075", copy_count: 2, priced_count: 2, unpriced_count: 0, unpriced_by_reason: {}, top: [] }));
  });
  vi.stubGlobal("fetch", request);
  const view = renderBinderValue(binder, "0:a,1:b");
  expect(await screen.findByText("$1.075")).toBeVisible();
  // The attribution stays visible; the rest folds into "Detalles".
  expect(screen.getByRole("link", { name: "Rates By Exchange Rate API" })).toBeVisible();
  expect(screen.getByText("2 de 2 copias con precio")).not.toBeVisible();
  await userEvent.setup().click(screen.getByText("Detalles"));
  expect(screen.getByText("2 de 2 copias con precio")).toBeVisible();
  empty = true;
  view.rerender("");
  expect(await screen.findByText("Sin copias")).toBeVisible();
  expect(request).toHaveBeenCalledTimes(2);
});
