from collections.abc import Mapping
from decimal import Decimal, InvalidOperation

from .models import (
    CardCategory,
    CardRecord,
    PriceObservation,
    ProviderDataError,
    SetRecord,
    VariantRecord,
)


CATEGORY_MAP = {
    "Pokemon": CardCategory.POKEMON,
    "Pokémon": CardCategory.POKEMON,
    "Trainer": CardCategory.TRAINER,
    "Entrenador": CardCategory.TRAINER,
    "Energy": CardCategory.ENERGY,
    "Energía": CardCategory.ENERGY,
}
SIMPLE_VARIANTS = (
    ("normal", "normal"),
    ("reverse", "reverse"),
    ("holo", "holo"),
    ("firstEdition", "first-edition"),
    ("wPromo", "w-promo"),
)
PRICE_METADATA_KEYS = {"unit", "updated", "idProduct", "productId"}


def normalize_card(payload: Mapping[str, object], language: str) -> CardRecord:
    card = _mapping(payload, "card")
    external_id = _string(card.get("id"), "card.id")
    local_id = _local_id(card.get("localId"))
    name = _string(card.get("name"), "card.name")
    raw_category = _string(card.get("category"), "card.category")
    try:
        category = CATEGORY_MAP[raw_category]
    except KeyError as error:
        raise ProviderDataError(
            f"unsupported {language} card category: {raw_category}"
        ) from error

    card_set = _mapping(card.get("set"), "card.set")
    set_external_id = _string(card_set.get("id"), "card.set.id")
    dex_ids = _dex_ids(card.get("dexId"), category)
    image_url = _optional_string(card.get("image"), "card.image")
    variants = _variants(card)
    prices = _price_observations(card.get("pricing"), default_finish=None)

    return CardRecord(
        external_id=external_id,
        local_id=local_id,
        name=name,
        category=category,
        set_external_id=set_external_id,
        dex_ids=dex_ids,
        image_url=image_url,
        variants=variants,
        prices=prices,
    )


def normalize_set(payload: Mapping[str, object]) -> SetRecord:
    tcg_set = _mapping(payload, "set")
    counts = _mapping(tcg_set.get("cardCount"), "set.cardCount")
    return SetRecord(
        external_id=_string(tcg_set.get("id"), "set.id"),
        name=_string(tcg_set.get("name"), "set.name"),
        official_count=_integer(counts.get("official"), "set.cardCount.official"),
        total_count=_integer(counts.get("total"), "set.cardCount.total"),
    )


def _variants(card: Mapping[str, object]) -> tuple[VariantRecord, ...]:
    detailed = card.get("variants_detailed")
    if detailed is not None:
        if type(detailed) is not list:
            raise ProviderDataError("card.variants_detailed must be an array")
        return tuple(_detailed_variant(item) for item in detailed)

    simple = _mapping(card.get("variants"), "card.variants")
    variants: list[VariantRecord] = []
    for provider_key, finish in SIMPLE_VARIANTS:
        available = simple.get(provider_key, False)
        if type(available) is not bool:
            raise ProviderDataError(f"card.variants.{provider_key} must be boolean")
        if available:
            variants.append(VariantRecord(None, finish, None, (), ()))
    return tuple(variants)


def _detailed_variant(value: object) -> VariantRecord:
    variant = _mapping(value, "card.variants_detailed[]")
    finish = _string(variant.get("type"), "variant.type")
    provider_id = _optional_string(variant.get("variantId"), "variant.variantId")
    subtype = _optional_string(variant.get("subtype"), "variant.subtype")
    raw_stamps = variant.get("stamp", variant.get("stamps", []))
    if type(raw_stamps) is not list or any(type(stamp) is not str for stamp in raw_stamps):
        raise ProviderDataError("variant stamps must be an array of strings")
    return VariantRecord(
        provider_id=provider_id,
        finish=finish,
        subtype=subtype,
        stamps=tuple(raw_stamps),
        prices=_price_observations(variant.get("pricing"), default_finish=finish),
    )


def _price_observations(
    value: object, default_finish: str | None
) -> tuple[PriceObservation, ...]:
    if value is None:
        return ()
    pricing = _mapping(value, "pricing")
    observations: list[PriceObservation] = []
    for source in sorted(pricing):
        raw_source = pricing[source]
        if raw_source is None:
            continue
        source_data = _mapping(raw_source, f"pricing.{source}")
        currency = _string(source_data.get("unit"), f"pricing.{source}.unit")
        updated_at = _optional_string(
            source_data.get("updated"), f"pricing.{source}.updated"
        )
        nested_finishes = [
            (key, nested)
            for key, nested in source_data.items()
            if key not in PRICE_METADATA_KEYS and isinstance(nested, Mapping)
        ]
        if nested_finishes:
            for finish, metrics in sorted(nested_finishes):
                observations.append(
                    PriceObservation(
                        source=source,
                        currency=currency,
                        updated_at=updated_at,
                        finish=finish,
                        metrics=_price_metrics(metrics, source),
                    )
                )
        else:
            observations.append(
                PriceObservation(
                    source=source,
                    currency=currency,
                    updated_at=updated_at,
                    finish=default_finish,
                    metrics=_price_metrics(source_data, source),
                )
            )
    return tuple(observations)


def _price_metrics(
    values: Mapping[str, object], source: str
) -> tuple[tuple[str, Decimal | None], ...]:
    metrics: list[tuple[str, Decimal | None]] = []
    for name in sorted(values):
        if name in PRICE_METADATA_KEYS:
            continue
        value = values[name]
        if value is None:
            metrics.append((name, None))
            continue
        if type(value) not in {int, float, str}:
            raise ProviderDataError(f"pricing.{source}.{name} must be numeric or null")
        try:
            metrics.append((name, Decimal(str(value))))
        except InvalidOperation as error:
            raise ProviderDataError(
                f"pricing.{source}.{name} must be numeric or null"
            ) from error
    return tuple(metrics)


def _dex_ids(value: object, category: CardCategory) -> tuple[int, ...]:
    if category is not CardCategory.POKEMON:
        return ()
    if value is None:
        return ()
    if type(value) is not list or any(type(dex_id) is not int for dex_id in value):
        raise ProviderDataError("card.dexId must be an array of integers")
    return tuple(value)


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


def _local_id(value: object) -> str:
    if type(value) is str and value:
        return value
    if type(value) is int:
        return str(value)
    raise ProviderDataError("card.localId must be a non-empty string or integer")


def _integer(value: object, field: str) -> int:
    if type(value) is not int:
        raise ProviderDataError(f"{field} must be an integer")
    return value
