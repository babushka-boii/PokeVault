import { withUnauthenticatedSession } from "../test/authSession";
import { withPokemonDetails } from "../test/pokemonDetails";
import { act, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { locatePokemon } from "../services/pokemon";
import { App } from "../app/App";

const suggestion = { national_dex_number: 559, name: "scraggy" };
function mockCatalog() {
  const request = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/search?')) return Promise.resolve(new Response(JSON.stringify({ results: [suggestion] })));
    const offset = Number(new URL(url).searchParams.get('offset'));
    return Promise.resolve(new Response(JSON.stringify({ results: Array.from({ length: 30 }, (_, i) => ({
      national_dex_number: offset + i + 1, name: offset + i + 1 === 559 ? 'scraggy' : `pokemon-${offset + i + 1}`,
      types: ['dark'], sprite_url: null,
    })) })));
  });
  vi.stubGlobal('fetch', withUnauthenticatedSession(withPokemonDetails(request)));
  return request;
}
afterEach(() => vi.unstubAllGlobals());

test('search locates Scraggy in Box 19 slot 19 with peers and focus, then reselects without refetch', async () => {
  const request = mockCatalog();
  const user = userEvent.setup();
  render(<App initialEntries={['/boxes']} />);
  await screen.findByRole('heading', { name: 'Pokemon-1' });
  await user.click(screen.getByRole('button', { name: 'Buscar Pokémon' }));
  const input = screen.getByRole('combobox');
  expect(input).toHaveFocus();
  await user.type(input, 'Scrag');
  await screen.findByRole('option', { name: /#559 Scraggy/ });
  await user.type(input, ' ');
  expect(screen.getByRole('option', { name: /#559 Scraggy/ })).toBeVisible();
  await user.keyboard('{ArrowDown}{Enter}');
  expect(await screen.findByRole('heading', { name: 'Scraggy' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Caja 19' })).toBeVisible();
  const grid = screen.getByRole('grid');
  expect(within(grid).getAllByRole('button')).toHaveLength(30);
  expect(within(grid).getAllByRole('gridcell')[18]).toHaveAttribute('aria-selected', 'true');
  await waitFor(() => expect(within(grid).getByRole('button', { name: '#559 Scraggy' })).toHaveFocus());
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  const pageCalls = request.mock.calls.filter(([url]) => !url.includes('/search?')).length;
  await user.click(screen.getByRole('button', { name: 'Buscar Pokémon' }));
  await user.type(screen.getByRole('combobox'), '#559');
  await user.click(await screen.findByRole('option'));
  expect(request.mock.calls.filter(([url]) => !url.includes('/search?'))).toHaveLength(pageCalls);
});

test('search clear and Escape preserve navigation and localize', async () => {
  mockCatalog();
  const user = userEvent.setup();
  render(<App initialEntries={['/boxes']} />);
  await user.click(screen.getByRole('button', { name: 'Caja siguiente' }));
  await user.click(screen.getByRole('button', { name: 'Buscar Pokémon' }));
  await user.type(screen.getByRole('combobox'), 'nope');
  await user.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
  expect(screen.getByRole('combobox')).toHaveValue('');
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Buscar Pokémon' })).toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'English' }));
  expect(screen.getByRole('button', { name: 'Search Pokémon' })).toBeVisible();
});


test.each([
  [1, 0, 0], [30, 0, 29], [31, 1, 0], [559, 18, 18], [1025, 34, 4],
])('locates National Dex %i at box index %i slot %i', (number, page, slot) => {
  expect(locatePokemon(number)).toEqual({ page, slot });
});

test('shows no results and sanitized network error with retry', async () => {
  const request = mockCatalog();
  const user = userEvent.setup();
  render(<App initialEntries={['/boxes']} />);
  await user.click(screen.getByRole('button', { name: 'Buscar Pokémon' }));
  request.mockResolvedValueOnce(new Response(JSON.stringify({ results: [] })));
  await user.type(screen.getByRole('combobox'), 'missing');
  expect(await screen.findByText('No se encontraron Pokémon.')).toBeVisible();
  request.mockRejectedValueOnce(new Error('private'));
  await user.clear(screen.getByRole('combobox'));
  await user.type(screen.getByRole('combobox'), 'scraggy');
  expect(await screen.findByRole('alert')).not.toHaveTextContent('private');
  await user.click(screen.getByRole('button', { name: 'Reintentar búsqueda' }));
  expect(await screen.findByRole('option', { name: /Scraggy/ })).toBeVisible();
});

test('debounces typing and ignores obsolete search responses', async () => {
  const request = mockCatalog();
  const user = userEvent.setup();
  let resolveOld!: (response: Response) => void;
  render(<App initialEntries={['/boxes']} />);
  await screen.findByRole('heading', { name: 'Pokemon-1' });
  await user.click(screen.getByRole('button', { name: 'Buscar Pokémon' }));
  request.mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveOld = resolve; }));
  await user.type(screen.getByRole('combobox'), 'pika');
  await waitFor(() => expect(resolveOld).toBeDefined());
  expect(request.mock.calls.filter(([url]) => url.includes('/search?'))).toHaveLength(1);
  await user.clear(screen.getByRole('combobox'));
  await user.type(screen.getByRole('combobox'), 'scraggy');
  await screen.findByRole('option', { name: /Scraggy/ });
  await act(async () => resolveOld(new Response(JSON.stringify({ results: [{ name: 'pikachu', national_dex_number: 25 }] }))));
  expect(screen.queryByRole('option', { name: /Pikachu/ })).not.toBeInTheDocument();
  expect(screen.getByRole('option', { name: /Scraggy/ })).toBeVisible();
});
