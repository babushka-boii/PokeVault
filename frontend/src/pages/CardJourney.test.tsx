import { withUnauthenticatedSession } from "../test/authSession";
import { render, screen, within } from "@testing-library/react";
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

test('Boxes → species gallery → card → gallery → original selected box and wallpaper', async () => {
  const request = mockBackend();
  localStorage.setItem('pokevault.spriteMode', 'animated');
  const user = userEvent.setup();
  render(<App initialEntries={['/boxes?box=19&pokemon=559&wallpaper=ocean']} />);
  await screen.findByRole('heading', { name: 'Scraggy' });
  await user.click(screen.getByRole('link', { name: 'Ver cartas TCG' }));
  await user.click(await screen.findByRole('link', { name: /Scraggy/ }));
  expect(await screen.findByText('bw1-68')).toBeVisible();
  await user.click(screen.getByRole('link', { name: 'Volver a la galería' }));
  await screen.findByRole('link', { name: /Scraggy/ });
  await user.click(screen.getByRole('link', { name: 'Volver' }));
  expect(await screen.findByRole('heading', { name: 'Caja 19' })).toBeVisible();
  const grid = screen.getByRole('grid');
  await screen.findByRole('button', { name: '#559 Scraggy' });
  expect(within(grid).getAllByRole('gridcell')[18]).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('button', { name: 'Océano' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('radio', { name: 'Animados' })).toBeChecked();
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
