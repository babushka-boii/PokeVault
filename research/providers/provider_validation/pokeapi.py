from collections.abc import Mapping, Sequence

from .models import (
    CardCategory,
    CardRecord,
    PokemonRecord,
    ProviderDataError,
    SpeciesRecord,
)


SUPPORTED_NAME_LANGUAGES = ("en", "es")


def normalize_species(payload: Mapping[str, object]) -> SpeciesRecord:
    species = _mapping(payload, "species")
    generation = _mapping(species.get("generation"), "species.generation")
    raw_names = species.get("names")
    if type(raw_names) is not list:
        raise ProviderDataError("species.names must be an array")

    localized_names: dict[str, str] = {}
    for raw_name in raw_names:
        name_entry = _mapping(raw_name, "species.names[]")
        language = _mapping(name_entry.get("language"), "species.names[].language")
        language_code = _string(language.get("name"), "species.names[].language.name")
        if language_code in SUPPORTED_NAME_LANGUAGES:
            localized_names[language_code] = _string(
                name_entry.get("name"), "species.names[].name"
            )

    names = tuple(
        (language, localized_names[language])
        for language in SUPPORTED_NAME_LANGUAGES
        if language in localized_names
    )
    return SpeciesRecord(
        national_dex_number=_integer(species.get("id"), "species.id"),
        slug=_string(species.get("name"), "species.name"),
        names=names,
        generation=_string(generation.get("name"), "species.generation.name"),
    )


def normalize_pokemon(payload: Mapping[str, object]) -> PokemonRecord:
    pokemon = _mapping(payload, "pokemon")
    raw_types = pokemon.get("types")
    if type(raw_types) is not list:
        raise ProviderDataError("pokemon.types must be an array")

    ordered_types: list[tuple[int, str]] = []
    for raw_type in raw_types:
        type_entry = _mapping(raw_type, "pokemon.types[]")
        type_data = _mapping(type_entry.get("type"), "pokemon.types[].type")
        ordered_types.append(
            (
                _integer(type_entry.get("slot"), "pokemon.types[].slot"),
                _string(type_data.get("name"), "pokemon.types[].type.name"),
            )
        )
    ordered_types.sort(key=lambda item: item[0])

    sprites = _mapping(pokemon.get("sprites"), "pokemon.sprites")
    sprite_url = _optional_string(
        sprites.get("front_default"), "pokemon.sprites.front_default"
    )
    return PokemonRecord(
        national_dex_number=_integer(pokemon.get("id"), "pokemon.id"),
        types=tuple(name for _, name in ordered_types),
        default_sprite_url=sprite_url,
    )


def validate_species_links(
    cards: Sequence[CardRecord],
    species_by_id: Mapping[int, SpeciesRecord],
) -> tuple[str, ...]:
    violations: list[str] = []
    for card in cards:
        if card.category is not CardCategory.POKEMON:
            continue
        for dex_id in card.dex_ids:
            if dex_id not in species_by_id:
                violations.append(
                    f"card {card.external_id} references missing species {dex_id}"
                )
    return tuple(violations)


def _mapping(value: object, field: str) -> Mapping[str, object]:
    if not isinstance(value, Mapping) or any(type(key) is not str for key in value):
        raise ProviderDataError(f"{field} must be an object")
    return value


def _string(value: object, field: str) -> str:
    if type(value) is not str or not value:
        raise ProviderDataError(f"{field} must be a non-empty string")
    return value


def _optional_string(value: object, field: str) -> str | None:
    if value is None:
        return None
    return _string(value, field)


def _integer(value: object, field: str) -> int:
    if type(value) is not int:
        raise ProviderDataError(f"{field} must be an integer")
    return value
