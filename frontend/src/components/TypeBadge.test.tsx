import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { LocaleProvider } from "../i18n/LocaleProvider";
import { pokemonTypes } from "../services/pokemon";
import { TypeBadge } from "./TypeBadge";
import { dictionaries } from "../i18n/dictionaries";

test.each(pokemonTypes)('renders original %s symbol and localized banner', (type) => {
  const view = render(<LocaleProvider><TypeBadge type={type} /></LocaleProvider>);
  const badge = screen.getByText(dictionaries.es.pokemonTypes[type]).closest('.type-badge');
  expect(badge).toHaveAttribute('data-type', type);
  expect(badge?.querySelector('svg path')).toHaveAttribute('d');
  expect(view.container.querySelector('.pokemon-type')).toBeNull();
});

test('supports two English types together without image labels', () => {
  localStorage.setItem('pokevault.locale', 'en');
  render(<LocaleProvider><TypeBadge type="grass" /><TypeBadge type="poison" /></LocaleProvider>);
  expect(screen.getByText('Grass')).toBeVisible();
  expect(screen.getByText('Poison')).toBeVisible();
});
