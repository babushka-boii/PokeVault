import { withUnauthenticatedSession } from "../test/authSession";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "../app/App";
import { bulbasaurCard, scraggyCard, tcgPage } from "../test/tcgFixtures";

const pokemon = (number: number) => ({
  national_dex_number: number,
  name: number === 1 ? 'bulbasaur' : number === 559 ? 'scraggy' : `pokemon-${number}`,
  types: number === 559 ? ['dark', 'fighting'] : ['grass'], sprite_url: null,
});
function printing(number: number) {
  return number === 1 ? bulbasaurCard : scraggyCard;
}
afterEach(() => vi.unstubAllGlobals());

function mockBackend() {
  const request = vi.fn().mockImplementation((value: string) => {
    const url = new URL(value);
    const catalog = url.pathname.match(/^\/api\/v1\/pokemon\/(\d+)\/cards$/);
    const details = url.pathname.match(/^\/api\/v1\/pokemon\/(\d+)$/);
    let payload: unknown;
    if (catalog) payload = tcgPage([printing(Number(catalog[1]))]);
    else if (details) payload = { ...pokemon(Number(details[1])), name_language: 'en', height_m: .7, weight_kg: 6.9, abilities: [], description: null, description_language: null };
    else if (url.pathname.startsWith('/api/v1/cards/')) payload = printing(url.pathname.endsWith('base1-44') ? 1 : 559);
    else {
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const count = Number(url.searchParams.get('limit') ?? 20);
      payload = { results: Array.from({ length: count }, (_, index) => pokemon(offset + index + 1)) };
    }
    return Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));
  });
  vi.stubGlobal('fetch', withUnauthenticatedSession(request));
  return request;
}

test('an old box link → species gallery → card → gallery → back to the Pokédex', async () => {
  const request = mockBackend();
  const user = userEvent.setup();
  render(<App initialEntries={['/boxes?box=19&pokemon=559&wallpaper=ocean']} />);
  // The retired box URL names species #559, so it opens that gallery directly.
  await user.click(await screen.findByRole('link', { name: /Scraggy/ }));
  expect(await screen.findByText('bw1-68')).toBeVisible();
  await user.click(screen.getByRole('link', { name: 'Volver a la galería' }));
  await screen.findByRole('link', { name: /Scraggy/ });
  await user.click(screen.getByRole('link', { name: 'Volver' }));
  expect(await screen.findByRole('heading', { name: 'Pokédex' })).toBeVisible();
  expect(request.mock.calls.every(([url]) => url.startsWith('http://localhost:8000/api/v1/'))).toBe(true);
});

test('Pokédex exposes a separate card action and returns to Pokédex', async () => {
  mockBackend();
  const user = userEvent.setup();
  render(<App initialEntries={['/pokedex']} />);
  await screen.findByRole('heading', { name: 'Bulbasaur' });
  await user.click(screen.getAllByRole('link', { name: 'Ver cartas TCG' })[0]);
  await screen.findByRole('link', { name: /Bulbasaur/ });
  await user.click(screen.getByRole('link', { name: 'Volver' }));
  expect(await screen.findByRole('heading', { name: 'Pokédex' })).toBeVisible();
});
