import json
import unittest
from pathlib import Path

from research.providers.provider_validation.models import (
    CardCategory,
    CardRecord,
    SpeciesRecord,
)
from research.providers.provider_validation.pokeapi import (
    normalize_pokemon,
    normalize_species,
    validate_species_links,
)


SAMPLES = Path(__file__).with_name("samples")


def load_sample(name: str) -> dict[str, object]:
    return json.loads((SAMPLES / name).read_text(encoding="utf-8"))


def card(external_id: str, category: CardCategory, dex_ids: tuple[int, ...]) -> CardRecord:
    return CardRecord(
        external_id=external_id,
        local_id="1",
        name=external_id,
        category=category,
        set_external_id="sample",
        dex_ids=dex_ids,
        image_url=None,
        variants=(),
        prices=(),
    )


def species(national_dex_number: int, slug: str) -> SpeciesRecord:
    return SpeciesRecord(
        national_dex_number=national_dex_number,
        slug=slug,
        names=(("en", slug.title()),),
        generation="sample-generation",
    )


class PokeAPINormalizationTests(unittest.TestCase):
    def test_normalizes_species_identity_generation_and_supported_names(self) -> None:
        result = normalize_species(load_sample("pokeapi_species_furret.json"))

        self.assertEqual(162, result.national_dex_number)
        self.assertEqual("furret", result.slug)
        self.assertEqual("generation-ii", result.generation)
        self.assertEqual((("en", "Furret"), ("es", "Furret")), result.names)

    def test_missing_spanish_name_is_not_fabricated(self) -> None:
        payload = load_sample("pokeapi_species_furret.json")
        payload["names"] = [
            {"language": {"name": "en"}, "name": "Furret"}
        ]

        result = normalize_species(payload)

        self.assertEqual((("en", "Furret"),), result.names)
        self.assertNotIn("es", dict(result.names))

    def test_normalizes_ordered_types_and_default_sprite(self) -> None:
        result = normalize_pokemon(load_sample("pokeapi_pokemon_furret.json"))

        self.assertEqual(162, result.national_dex_number)
        self.assertEqual(("normal",), result.types)
        self.assertEqual(
            "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/162.png",
            result.default_sprite_url,
        )

    def test_missing_default_sprite_remains_none(self) -> None:
        payload = load_sample("pokeapi_pokemon_furret.json")
        payload["sprites"] = {"front_default": None}

        result = normalize_pokemon(payload)

        self.assertIsNone(result.default_sprite_url)


class CrossProviderSpeciesTests(unittest.TestCase):
    def setUp(self) -> None:
        self.species_by_id = {
            25: species(25, "pikachu"),
            162: species(162, "furret"),
            644: species(644, "zekrom"),
        }

    def test_accepts_single_multiple_and_non_pokemon_species_links(self) -> None:
        cards = (
            card("swsh3-136", CardCategory.POKEMON, (162,)),
            card("sm9-33", CardCategory.POKEMON, (25, 644)),
            card("base1-88", CardCategory.TRAINER, ()),
            card("base1-99", CardCategory.ENERGY, ()),
        )

        self.assertEqual((), validate_species_links(cards, self.species_by_id))

    def test_reports_card_and_missing_dex_id(self) -> None:
        cards = (card("sm9-33", CardCategory.POKEMON, (25, 644)),)

        violations = validate_species_links(cards, {25: self.species_by_id[25]})

        self.assertEqual(("card sm9-33 references missing species 644",), violations)


if __name__ == "__main__":
    unittest.main()
