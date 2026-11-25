import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "../app/App";
import { jsonResponse as json } from "../test/tcgFixtures";
import { valuation } from "../test/priceFixtures";

afterEach(() => vi.unstubAllGlobals());
function setup(fail = false) {
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.pathname.endsWith("/auth/me")) return json({ user: { id: "ash", display_name: "Ash", email: null, email_verified: true, picture_url: null }, csrf_token: "test" });
    if (url.pathname.endsWith("/me/settings")) return json({ preferred_currency: "CLP" });
    if (url.pathname.endsWith("/prices/collection")) return fail ? json({}, 503) : json(valuation({ currency: url.searchParams.get("currency") === "USD" ? "USD" : "CLP", top: [] }));
    if (url.pathname.endsWith("/inventory")) return json({ results: [], total: url.searchParams.has("variant") ? 0 : 5, quantities: url.searchParams.has("variant") ? {} : { "sm9-33": 3, "sv01-1": 2 }, offset: 0, limit: 24 });
    return json({}, 404);
  }));
  render(<App initialEntries={["/collection?variant=unknown"]} />);
}
test("shows whole-collection counts and value even when the active filter has no matches", async () => {
  setup();
  const header = await screen.findByRole("region", { name: "Resumen de toda tu colección" });
  expect(await within(header).findByText("5")).toBeVisible();
  expect(within(header).getByText("2")).toBeVisible();
  expect(await within(header).findByText("$1.112")).toBeVisible();
  expect(within(header).getByText("Cartas distintas")).toBeVisible();
  expect(within(header).getByRole("link", { name: "Rates By Exchange Rate API" })).toBeVisible();
  await userEvent.setup().selectOptions(within(header).getByLabelText("Moneda"), "USD");
  expect(await within(header).findByText(/1[,.]112[,.]00/)).toBeVisible();
});
test("keeps counts available when valuation fails and offers retry without a fake zero", async () => {
  setup(true);
  const header = await screen.findByRole("region", { name: "Resumen de toda tu colección" });
  expect(await within(header).findByText("5")).toBeVisible();
  expect(await within(header).findByRole("button", { name: /Reintentar/ })).toBeVisible();
  expect(within(header).queryByText(/^\$0$/)).not.toBeInTheDocument();
});
