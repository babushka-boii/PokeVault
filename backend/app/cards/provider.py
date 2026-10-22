import asyncio
from collections import OrderedDict
from collections.abc import Callable
from datetime import date
from time import monotonic
from typing import Annotated

import httpx2 as httpx
from pydantic import BaseModel, Field, HttpUrl

from app.cards.schemas import (
    Card,
    CardAbility,
    CardAttack,
    CardImageSource,
    CardModifier,
    CardPage,
    CardSerie,
    CardSet,
    CardSort,
    CardVariant,
    Category,
    Damage,
    Identifier,
    Language,
    SetLogoSource,
)
from app.pokemon.schemas import NATIONAL_DEX_TOTAL


class CardsUnavailable(Exception):
    """The provider cannot supply complete, verified card data."""


class CardNotFound(Exception):
    """Neither supported provider language contains the requested card."""


class _Brief(BaseModel):
    id: Identifier
    localId: str | int
    name: str = Field(min_length=1)

    @property
    def set_id(self) -> str:
        # Local identifiers can contain letters; set identifiers can contain hyphens.
        # Use the provider's explicit localId, not a guess about the final segment.
        suffix = f"-{self.localId}"
        if not self.id.endswith(suffix):
            raise ValueError("Conflicting brief identity")
        set_id = self.id[: -len(suffix)]
        return CardSerie(id=set_id, name=set_id).id


class _SetBrief(CardSerie):
    logo: HttpUrl | None = None
    symbol: HttpUrl | None = None


class _RawSet(_SetBrief):
    releaseDate: str | None = None
    serie: CardSerie | None = None


class _Variant(BaseModel):
    variantId: str | None = None
    type: str = Field(min_length=1)
    subtype: str | None = None
    stamp: list[str] | None = None


class _Attack(BaseModel):
    name: str | None = None
    cost: list[str] | None = None
    damage: Damage = None
    effect: str | None = None


class _Modifier(BaseModel):
    type: str
    value: Damage = None


# Provider associations are numeric National Dex identifiers, never name guesses.
DexId = Annotated[int, Field(ge=1, le=NATIONAL_DEX_TOTAL, strict=True)]


class _RawCard(_Brief):
    category: str
    set: _SetBrief
    dexId: list[DexId] | None = None
    image: HttpUrl | None = None
    rarity: str | None = None
    illustrator: str | None = None
    hp: int | None = Field(default=None, ge=0, strict=True)
    types: list[str] | None = None
    stage: str | None = None
    evolveFrom: str | None = None
    attacks: list[_Attack] | None = None
    abilities: list[CardAbility] | None = None
    variants_detailed: list[_Variant] | None = None
    variants: dict[str, bool] | None = None
    weaknesses: list[_Modifier] | None = None
    resistances: list[_Modifier] | None = None
    retreat: int | None = Field(default=None, ge=0, strict=True)
    regulationMark: str | None = None


def _category(value: str) -> Category:
    categories: dict[str, Category] = {
        "Pokemon": "Pokemon",
        "Pokémon": "Pokemon",
        "Trainer": "Trainer",
        "Entrenador": "Trainer",
        "Energy": "Energy",
        "Energía": "Energy",
    }
    try:
        return categories[value]
    except KeyError as error:
        raise ValueError("Unknown card category") from error


def _validate_asset(value: HttpUrl | None) -> None:
    if value is not None and (
        value.scheme != "https"
        or value.host != "assets.tcgdex.net"
        or value.port != 443
        or value.username is not None
        or value.password is not None
        or value.query is not None
        or value.fragment is not None
    ):
        raise ValueError("Unexpected official asset origin")


def _validate_identity(data: _RawCard, card_id: str) -> None:
    if data.id != card_id or f"{data.set.id}-{data.localId}" != card_id:
        raise ValueError("Unexpected card identity")
    _category(data.category)
    for asset in (data.image, data.set.logo, data.set.symbol):
        _validate_asset(asset)


def _asset_url(value: HttpUrl | None) -> HttpUrl | None:
    return HttpUrl(f"{str(value).rstrip('/')}.png") if value is not None else None


def _image_source(value: HttpUrl, resource_language: Language) -> CardImageSource:
    base = str(value).rstrip("/")
    variant = base.rsplit("/", 1)[-1]
    if variant in {
        f"{quality}.{extension}"
        for quality in ("low", "high")
        for extension in ("webp", "png", "jpg")
    }:
        base = base.rsplit("/", 1)[0]
    asset_language = value.path.split("/")[1]
    return CardImageSource(
        base_url=base,
        language=asset_language
        if asset_language in ("es", "en")
        else resource_language,
    )


def _release_date(value: str | None) -> str | None:
    if value is None:
        return None
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        return None
    # Only the documented yyyy-mm-dd representation establishes a release date.
    return value if parsed.isoformat() == value else None


def _normalize_set(
    english: _RawSet | _SetBrief,
    spanish: _SetBrief | None,
    language: Language,
    series: dict[str, CardSerie],
) -> CardSet:
    selected = spanish if language == "es" and spanish is not None else english
    selected_language: Language = "es" if selected is spanish else "en"
    sources = []
    candidates = [(selected, selected_language)]
    if selected is not english:
        candidates.append((english, "en"))
    for raw, asset_language in candidates:
        if raw.logo is not None:
            source = SetLogoSource(url=_asset_url(raw.logo), language=asset_language)
            if not any(existing.url == source.url for existing in sources):
                sources.append(source)
    serie = english.serie if isinstance(english, _RawSet) else None
    if language == "es" and serie is not None:
        serie = series.get(serie.id, serie)
    return CardSet(
        id=selected.id,
        name=selected.name,
        name_language=selected_language,
        logo_url=sources[0].url if sources else None,
        symbol_url=_asset_url(selected.symbol or english.symbol),
        logo_sources=sources,
        serie=serie,
        release_date=(
            _release_date(english.releaseDate) if isinstance(english, _RawSet) else None
        ),
    )


def _normalize(
    selected: _RawCard,
    identity: _RawCard,
    language: Language,
    available_languages: list[Language],
    resources: list[tuple[_RawCard | None, Language]],
    card_set: CardSet,
) -> Card:
    sources = []
    for raw, raw_language in resources:
        if raw is not None and raw.image is not None:
            source = _image_source(raw.image, raw_language)
            if not any(existing.base_url == source.base_url for existing in sources):
                sources.append(source)
    image = str(sources[0].base_url).rstrip("/") if sources else None
    category = _category(identity.category)
    variants = [
        CardVariant(
            id=variant.variantId,
            type=variant.type,
            subtype=variant.subtype,
            stamps=variant.stamp or [],
        )
        for variant in selected.variants_detailed or []
    ]
    if not variants:
        variants = [
            CardVariant(type=kind)
            for kind, available in (selected.variants or {}).items()
            if available
        ]
    return Card(
        id=selected.id,
        name=selected.name,
        dex_ids=(identity.dexId or []) if category == "Pokemon" else [],
        image_url=f"{image}/high.webp" if image else None,
        thumbnail_url=f"{image}/low.webp" if image else None,
        image_sources=sources,
        image_language=sources[0].language if sources else None,
        set=card_set,
        local_id=str(selected.localId),
        rarity=selected.rarity,
        category=category,
        language=language,
        available_languages=available_languages,
        illustrator=selected.illustrator,
        hp=selected.hp,
        types=selected.types or [],
        stage=selected.stage,
        evolve_from=selected.evolveFrom,
        attacks=[
            CardAttack(
                name=attack.name,
                cost=attack.cost or [],
                damage=attack.damage,
                effect=attack.effect,
            )
            for attack in selected.attacks or []
        ],
        abilities=selected.abilities or [],
        variants=variants,
        weaknesses=[
            CardModifier(
                type=item.type,
                value=str(item.value) if item.value is not None else None,
            )
            for item in selected.weaknesses or []
        ],
        resistances=[
            CardModifier(
                type=item.type,
                value=str(item.value) if item.value is not None else None,
            )
            for item in selected.resistances or []
        ],
        retreat=selected.retreat,
        regulation_mark=selected.regulationMark,
    )


class CardProvider:
    """TCGdex adapter with bounded discovery and current-page card enrichment.

    Exact English species briefs (at most 2000) form a five-minute LRU index.
    Complete, metadata-only English sets (at most 512) come from GraphQL; REST
    supplies Spanish set/series names. No full-catalog card details are fetched.
    Dates and stable ties are ordered before pagination; unknown dates stay last.
    Index overflow/inconsistency fails explicitly, never becomes a partial list.
    Resources, views, pages, species indexes and set catalogs have bounded caches;
    refreshes coalesce and no more than five HTTP requests run concurrently.
    """

    def __init__(
        self,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        clock: Callable[[], float] = monotonic,
    ) -> None:
        self._transport = transport
        self._clock = clock
        self._lock = asyncio.Lock()
        self._metadata_lock = asyncio.Lock()
        self._semaphore = asyncio.Semaphore(5)
        self._raw: OrderedDict[tuple[str, Language], tuple[float, _RawCard | None]] = (
            OrderedDict()
        )
        self._cards: OrderedDict[tuple[str, Language], tuple[float, Card]] = (
            OrderedDict()
        )
        self._pages: OrderedDict[
            tuple[int, Language, int, int, str | None, CardSort], tuple[float, CardPage]
        ] = OrderedDict()
        self._indexes: OrderedDict[int, tuple[float, list[_Brief]]] = OrderedDict()
        self._catalogs: OrderedDict[Language, tuple[float, dict[str, CardSet]]] = (
            OrderedDict()
        )

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url="https://api.tcgdex.net/v2/",
            timeout=5,
            transport=self._transport,
            follow_redirects=False,
        )

    async def _get(
        self, client: httpx.AsyncClient, path: str, **kwargs
    ) -> httpx.Response:
        async with self._semaphore:
            return await client.get(path, **kwargs)

    def _store(
        self, cache: OrderedDict, key: object, value: object, capacity: int
    ) -> None:
        cache[key] = (self._clock() + 300, value)
        cache.move_to_end(key)
        while len(cache) > capacity:
            cache.popitem(last=False)

    def _cached(self, cache: OrderedDict, key: object) -> tuple[bool, object]:
        entry = cache.get(key)
        if entry is not None and self._clock() < entry[0]:
            cache.move_to_end(key)
            return True, entry[1]
        return False, None

    def _discard_card(self, card_id: str) -> None:
        for cache in (self._raw, self._cards):
            for key in list(cache):
                if key[0] == card_id:
                    del cache[key]

    async def _catalog(
        self, client: httpx.AsyncClient, language: Language
    ) -> dict[str, CardSet]:
        async with self._metadata_lock:
            found, cached = self._cached(self._catalogs, language)
            if found:
                return cached
            found, english = self._cached(self._catalogs, "en")
            if not found:
                async with self._semaphore:
                    response = await client.post(
                        "graphql",
                        json={
                            "query": (
                                "{ sets { id name releaseDate logo symbol "
                                "serie { id name } } }"
                            )
                        },
                    )
                response.raise_for_status()
                body = response.json()
                if not isinstance(body, dict) or body.get("errors"):
                    raise ValueError("Invalid set metadata response")
                rows = body.get("data", {}).get("sets")
                if not isinstance(rows, list) or not 0 < len(rows) <= 512:
                    raise ValueError("Invalid set metadata count")
                raw = [_RawSet.model_validate(row) for row in rows]
                if len({row.id for row in raw}) != len(raw):
                    raise ValueError("Duplicate set metadata")
                for row in raw:
                    _validate_asset(row.logo)
                    _validate_asset(row.symbol)
                english = {row.id: _normalize_set(row, None, "en", {}) for row in raw}
                self._store(self._catalogs, "en", english, 2)
            if language == "en":
                return english
            async with asyncio.TaskGroup() as group:
                sets_task = group.create_task(self._get(client, "es/sets"))
                series_task = group.create_task(self._get(client, "es/series"))
            sets_response, series_response = sets_task.result(), series_task.result()
            sets_response.raise_for_status()
            series_response.raise_for_status()
            set_rows, series_rows = sets_response.json(), series_response.json()
            if (
                not isinstance(set_rows, list)
                or len(set_rows) > 512
                or not isinstance(series_rows, list)
                or len(series_rows) > 64
            ):
                raise ValueError("Invalid localized set metadata")
            localized = [_SetBrief.model_validate(row) for row in set_rows]
            series = [CardSerie.model_validate(row) for row in series_rows]
            if len({row.id for row in localized}) != len(localized) or len(
                {row.id for row in series}
            ) != len(series):
                raise ValueError("Duplicate localized metadata")
            for row in localized:
                _validate_asset(row.logo)
                _validate_asset(row.symbol)
            localized_by_id = {row.id: row for row in localized}
            series_by_id = {row.id: row for row in series}
            catalog = {}
            for set_id, original in english.items():
                translated = localized_by_id.get(set_id)
                result = original.model_copy(deep=True)
                if translated is not None:
                    result.name = translated.name
                    result.name_language = "es"
                    sources = (
                        [SetLogoSource(url=_asset_url(translated.logo), language="es")]
                        if translated.logo is not None
                        else []
                    )
                    sources.extend(
                        source
                        for source in original.logo_sources
                        if not any(source.url == item.url for item in sources)
                    )
                    result.logo_sources = sources
                    result.logo_url = sources[0].url if sources else None
                    result.symbol_url = (
                        _asset_url(translated.symbol) or original.symbol_url
                    )
                if result.serie is not None:
                    result.serie = series_by_id.get(result.serie.id, result.serie)
                catalog[set_id] = result
            self._store(self._catalogs, "es", catalog, 2)
            return catalog

    async def _resource(
        self, client: httpx.AsyncClient, card_id: str, language: Language
    ) -> _RawCard | None:
        key = (card_id, language)
        found, cached = self._cached(self._raw, key)
        if found:
            return cached
        response = await self._get(client, f"{language}/cards/{card_id}")
        if response.status_code == 404:
            data = None
        else:
            response.raise_for_status()
            data = _RawCard.model_validate(response.json())
            _validate_identity(data, card_id)
        self._store(self._raw, key, data, 256)
        return data

    async def _load_card(
        self,
        client: httpx.AsyncClient,
        card_id: str,
        language: Language,
        *,
        require_english: bool = False,
    ) -> Card:
        found, cached = self._cached(self._cards, (card_id, language))
        if found:
            if require_english and "en" not in cached.available_languages:
                self._discard_card(card_id)
                raise ValueError("Discovered English card is missing")
            return cached.model_copy(deep=True)
        # Both identities are checked before either image is offered as an alternative.
        async with asyncio.TaskGroup() as group:
            en_task = group.create_task(self._resource(client, card_id, "en"))
            es_task = group.create_task(self._resource(client, card_id, "es"))
        english, spanish = en_task.result(), es_task.result()
        if english is None and require_english:
            self._discard_card(card_id)
            raise ValueError("Discovered English card is missing")
        if english is None and spanish is None:
            raise CardNotFound
        if (
            english is not None
            and spanish is not None
            and (
                english.set.id != spanish.set.id
                or str(english.localId) != str(spanish.localId)
                or _category(english.category) != _category(spanish.category)
                or (spanish.dexId and set(spanish.dexId) != set(english.dexId or []))
            )
        ):
            self._raw.pop((card_id, "es"), None)
            raise ValueError("Conflicting translated card identity")
        identity = english if english is not None else spanish
        selected = spanish if language == "es" and spanish is not None else english
        if selected is None:
            selected = spanish
        selected_language: Language = "es" if selected is spanish else "en"
        available: list[Language] = []
        if english is not None:
            available.append("en")
        if spanish is not None:
            available.append("es")
        resources = [(english, "en"), (spanish, "es")]
        if selected_language == "es":
            resources.reverse()
        catalog = await self._catalog(client, language)
        card_set = catalog.get(selected.set.id)
        if card_set is None:
            # Direct details can exist outside the English discovery catalog.
            card_set = _normalize_set(
                english.set if english is not None else selected.set,
                spanish.set if spanish is not None else None,
                selected_language,
                {},
            )
        card = _normalize(
            selected, identity, selected_language, available, resources, card_set
        )
        self._store(self._cards, (card_id, language), card, 256)
        return card.model_copy(deep=True)

    async def get_card(self, card_id: str, language: Language = "es") -> Card:
        async with self._lock:
            try:
                async with asyncio.timeout(15), self._client() as client:
                    return await self._load_card(client, card_id, language)
            except (
                ExceptionGroup,
                httpx.HTTPError,
                TimeoutError,
                ValueError,
                TypeError,
                AttributeError,
            ) as error:
                raise CardsUnavailable from error

    async def _briefs(
        self, client: httpx.AsyncClient, params: dict[str, str | int], limit: int
    ) -> list[_Brief]:
        response = await self._get(client, "en/cards", params=params)
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, list) or len(data) > limit:
            raise ValueError("Invalid card page")
        briefs = [_Brief.model_validate(row) for row in data]
        if len({brief.id for brief in briefs}) != len(briefs):
            raise ValueError("Duplicate cards in page")
        for brief in briefs:
            if not brief.set_id:
                raise ValueError("Missing brief set identity")
        return briefs

    async def _species_index(
        self, client: httpx.AsyncClient, number: int
    ) -> list[_Brief]:
        found, cached = self._cached(self._indexes, number)
        if found:
            return cached
        params = {"dexId": f"eq:{number}", "sort:field": "id", "sort:order": "ASC"}
        rows = []
        for page in [1, 2]:
            batch = await self._briefs(
                client,
                {**params, "pagination:page": page, "pagination:itemsPerPage": 1000},
                1000,
            )
            rows.extend(batch)
            if len({row.id for row in rows}) != len(rows):
                raise ValueError("Repeated species index page")
            if len(batch) < 1000:
                probe = await self._briefs(
                    client,
                    {
                        **params,
                        "pagination:page": len(rows) + 1,
                        "pagination:itemsPerPage": 1,
                    },
                    1,
                )
                if probe:
                    raise ValueError("Truncated species index")
                self._store(self._indexes, number, rows, 32)
                return rows
        probe = await self._briefs(
            client,
            {**params, "pagination:page": 2001, "pagination:itemsPerPage": 1},
            1,
        )
        if probe:
            raise ValueError("Species index exceeds verified bound")
        self._store(self._indexes, number, rows, 32)
        return rows

    @staticmethod
    def _sort_key(brief: _Brief, sort: CardSort, sets: dict[str, CardSet]) -> tuple:
        if sort == "id":
            return (brief.id,)
        if sort == "name":
            return (brief.name, brief.id)
        released = sets[brief.set_id].release_date
        ordinal = date.fromisoformat(released).toordinal() if released else 0
        if sort == "newest":
            ordinal = -ordinal
        local = str(brief.localId)
        local_key = (0, int(local)) if local.isdecimal() else (1, local)
        return (released is None, ordinal, brief.set_id, local_key, brief.id)

    async def list_for_pokemon(
        self,
        number: int,
        language: Language = "es",
        page: int = 1,
        page_size: int = 12,
        set_id: str | None = None,
        sort: CardSort = "name",
    ) -> CardPage:
        key = (number, language, page, page_size, set_id, sort)
        async with self._lock:
            found, cached = self._cached(self._pages, key)
            if found:
                return cached.model_copy(deep=True)
            try:
                async with asyncio.timeout(15), self._client() as client:
                    index = await self._species_index(client, number)
                    catalog = await self._catalog(client, language) if index else {}
                    matching_set_ids = {brief.set_id for brief in index}
                    if not matching_set_ids.issubset(catalog):
                        # A set/date index cannot honestly claim complete options here.
                        # Recheck metadata on retry after a new upstream expansion.
                        self._catalogs.clear()
                        raise ValueError("Missing matching set metadata")
                    sets = sorted(
                        (catalog[identifier] for identifier in matching_set_ids),
                        key=lambda row: (row.name.casefold(), row.id),
                    )
                    matching = [
                        brief
                        for brief in index
                        if set_id is None or brief.set_id == set_id
                    ]
                    matching.sort(
                        key=lambda brief: self._sort_key(brief, sort, catalog)
                    )
                    offset = (page - 1) * page_size
                    briefs = matching[offset : offset + page_size]
                    async with asyncio.TaskGroup() as group:
                        tasks = [
                            group.create_task(
                                self._load_card(
                                    client, brief.id, language, require_english=True
                                )
                            )
                            for brief in briefs
                        ]
                    cards = [task.result() for task in tasks]
                    invalid_ids = {
                        card.id
                        for card in cards
                        if card.category != "Pokemon"
                        or number not in card.dex_ids
                        or (set_id is not None and card.set.id != set_id)
                    }
                    if invalid_ids:
                        for card_id in invalid_ids:
                            self._discard_card(card_id)
                        self._indexes.pop(number, None)
                        raise ValueError("Unverified species membership")
                    result = CardPage(
                        results=cards,
                        page=page,
                        page_size=page_size,
                        has_more=offset + page_size < len(matching),
                        sets=sets,
                    )
            except (
                ExceptionGroup,
                CardNotFound,
                httpx.HTTPError,
                TimeoutError,
                ValueError,
                TypeError,
                AttributeError,
            ) as error:
                raise CardsUnavailable from error
            self._store(self._pages, key, result, 64)
            return result.model_copy(deep=True)
