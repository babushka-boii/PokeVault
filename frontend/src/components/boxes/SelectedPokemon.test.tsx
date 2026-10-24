import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { LocaleProvider, useLocale } from "../../i18n/LocaleProvider";
import { SelectedPokemon } from "./SelectedPokemon";
import type { Pokemon } from "../../services/pokemon";

const bulbasaur: Pokemon = { national_dex_number: 1, name: 'bulbasaur', types: ['grass', 'poison'], sprite_url: null };
const detail = { ...bulbasaur, name: 'Bulbasaur', name_language: 'es', height_m: .7, weight_kg: 6.9,
  abilities: [{ name: 'Espesura', is_hidden: false, language: 'es' }, { name: 'Clorofila', is_hidden: true, language: 'es' }],
  description: 'Una semilla crece en su lomo.', description_language: 'es' };
afterEach(() => vi.unstubAllGlobals());

test('loads details only for the selected entry and shows localized measures and abilities', async () => {
  const request = vi.fn().mockResolvedValue(new Response(JSON.stringify(detail)));
  vi.stubGlobal('fetch', request);
  render(<LocaleProvider><SelectedPokemon pokemon={bulbasaur} /></LocaleProvider>);
  expect(await screen.findByText('Espesura')).toBeVisible();
  expect(screen.getByText('Clorofila')).toBeVisible();
  expect(screen.getByText('0,7 m')).toBeVisible();
  expect(screen.getByText('6,9 kg')).toBeVisible();
  expect(screen.getByText(detail.description)).toBeVisible();
  expect(request).toHaveBeenCalledWith('http://localhost:8000/api/v1/pokemon/1?language=es', expect.any(Object));
  expect(request).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Colección TCG')).not.toBeInTheDocument();
});

test('old detail requests cannot overwrite newer selection and repeated selections use cache', async () => {
  let resolveOld!: (value: Response) => void;
  const request = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveOld = resolve; }))
    .mockResolvedValue(new Response(JSON.stringify({ ...detail, national_dex_number: 2, name: 'Ivysaur', height_m: 1 })));
  vi.stubGlobal('fetch', request);
  const view = render(<LocaleProvider><SelectedPokemon pokemon={bulbasaur} /></LocaleProvider>);
  const second = { ...bulbasaur, national_dex_number: 2, name: 'ivysaur' };
  view.rerender(<LocaleProvider><SelectedPokemon pokemon={second} /></LocaleProvider>);
  expect(await screen.findByText('1 m')).toBeVisible();
  await act(async () => resolveOld(new Response(JSON.stringify(detail))));
  expect(screen.queryByText('0,7 m')).not.toBeInTheDocument();
  view.rerender(<LocaleProvider><SelectedPokemon /></LocaleProvider>);
  view.rerender(<LocaleProvider><SelectedPokemon pokemon={second} /></LocaleProvider>);
  await waitFor(() => expect(screen.getByText('1 m')).toBeVisible());
  expect(request).toHaveBeenCalledTimes(2);
});

test('explicitly labels English fallback and missing hidden ability, supports retry', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('secret'))
    .mockResolvedValue(new Response(JSON.stringify({ ...detail, description_language: 'en', abilities: [] }))));
  const user = userEvent.setup();
  render(<LocaleProvider><SelectedPokemon pokemon={bulbasaur} /></LocaleProvider>);
  expect(await screen.findByRole('alert')).not.toHaveTextContent('secret');
  await user.click(screen.getByRole('button', { name: 'Reintentar detalles' }));
  expect(await screen.findByText('Descripción disponible en inglés.')).toBeVisible();
  expect(screen.getAllByText('No disponible').length).toBeGreaterThan(0);
});

test('missing descriptions remain explicit and multiple normal abilities are preserved', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...detail,
    description: null, description_language: null, abilities: [
      { name: 'Habilidad A', is_hidden: false, language: 'es' },
      { name: 'Habilidad B', is_hidden: false, language: 'es' },
    ],
  }))));
  render(<LocaleProvider><SelectedPokemon pokemon={bulbasaur} /></LocaleProvider>);
  expect(await screen.findByText('No hay descripción disponible.')).toBeVisible();
  expect(screen.getByText('Habilidad A')).toBeVisible();
  expect(screen.getByText('Habilidad B')).toBeVisible();
  expect(screen.getByText('No disponible')).toBeVisible();
  expect(screen.queryByText('Descripción disponible en inglés.')).not.toBeInTheDocument();
});


test('switching language loads matching description and formats English units', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => Promise.resolve(new Response(JSON.stringify(
    url.endsWith('language=en') ? { ...detail, name_language: 'en', description: 'A seed grows on its back.', description_language: 'en',
      abilities: [{ name: 'Overgrow', is_hidden: false, language: 'en' }, { name: 'Chlorophyll', is_hidden: true, language: 'en' }] } : detail,
  )))));
  function DetailsWithLanguage() {
    const { toggleLocale } = useLocale();
    return <><button type="button" onClick={toggleLocale}>Switch</button><SelectedPokemon pokemon={bulbasaur} /></>;
  }
  const user = userEvent.setup();
  render(<LocaleProvider><DetailsWithLanguage /></LocaleProvider>);
  await screen.findByText('Espesura');
  await user.click(screen.getByRole('button', { name: 'Switch' }));
  expect(await screen.findByText('Overgrow')).toBeVisible();
  expect(screen.getByText('Chlorophyll')).toBeVisible();
  expect(screen.getByText('0.7 m')).toBeVisible();
  expect(screen.getByText('6.9 kg')).toBeVisible();
  expect(screen.getByText('A seed grows on its back.')).toHaveAttribute('lang', 'en');
  expect(screen.queryByText(detail.description)).not.toBeInTheDocument();
});
