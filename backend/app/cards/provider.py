import asyncio
import hashlib
from collections import OrderedDict
from collections.abc import Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
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
from app.cards.set_schemas import (
    SetCard,
    SetChecklist,
    SetDetail,
    SetPage,
    SetSort,
    SetSummary,
)
from app.pokemon.schemas import NATIONAL_DEX_TOTAL


class CardsUnavailable(Exception):
    """The provider cannot supply complete, verified card data."""


class CardNotFound(Exception):
    """Neither supported provider language contains the requested card."""


class SetNotFound(Exception):
    """The requested identity is absent from the supported physical catalog."""


# Positive classifications observed in the official metadata verification.
# New/absent series are explicit exclusions, never assumed to be physical.
PHYSICAL_SERIES = frozenset(
    {
        "base",
        "bw",
        "col",
        "dp",
        "ecard",
        "ex",
        "gym",
        "hgss",
        "lc",
        "mc",
        "me",
        "misc",
        "neo",
        "pl",
        "pop",
        "sm",
        "sv",
        "swsh",
        "tk",
        "xy",
    }
)


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


class _SetCardCount(BaseModel):
    total: int | None = Field(default=None, ge=0, strict=True)
    official: int | None = Field(default=None, ge=0, strict=True)


class _CountSetBrief(_SetBrief):
    cardCount: _SetCardCount | None = None


class _SetMembershipBrief(BaseModel):
    id: Identifier
    localId: str | Annotated[int, Field(ge=0, strict=True)]
    name: str = Field(min_length=1)
    image: HttpUrl | None = None


class _SetResource(_RawSet):
    cardCount: _SetCardCount | None = None
    cards: list[_SetMembershipBrief] = Field(max_length=2000)


@dataclass
class _SetRefreshGroup:
    """Only active callers share partial data or failures; never a TTL cache."""

    views: dict[Language, SetChecklist] = field(default_factory=dict)
    resources: dict[Language, _SetResource | None] = field(default_factory=dict)
    failures: dict[Language, Exception] = field(default_factory=dict)


def _checklist_status(raw: _SetResource) -> str:
    total = raw.cardCount.total if raw.cardCount is not None else None
    official = raw.cardCount.official if raw.cardCount is not None else None
    if not raw.cards and total == 0 and official in (None, 0):
        return "empty"
    if (
        raw.cards
        and total == len(raw.cards)
        and (official is None or official <= total)
    ):
        return "verified"
    return "incomplete"


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
        self._set_counts_lock = asyncio.Lock()
        self._set_slots = asyncio.Semaphore(12)
        self._set_locks: dict[str, tuple[asyncio.Lock, int, _SetRefreshGroup]] = {}
        self._set_count_indexes: OrderedDict[
            str, tuple[float, dict[str, _CountSetBrief]]
        ] = OrderedDict()
        self._set_resources: OrderedDict[
            tuple[str, Language], tuple[float, _SetResource | None]
        ] = OrderedDict()
        self._checklists: OrderedDict[
            tuple[str, Language], tuple[float, SetChecklist]
        ] = OrderedDict()

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
        self,
        cache: OrderedDict,
        key: object,
        value: object,
        capacity: int,
        *,
        expires_at: float | None = None,
    ) -> None:
        cache[key] = (
            self._clock() + 300 if expires_at is None else expires_at,
            value,
        )
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

    @asynccontextmanager
    async def _set_refresh(self, set_id: str):
        # At most twelve stable keys are tracked, including queued same-key users.
        # The shared HTTP semaphore still limits all card/set traffic to five.
        async with self._set_slots:
            lock, users, refreshed = self._set_locks.get(
                set_id, (asyncio.Lock(), 0, _SetRefreshGroup())
            )
            self._set_locks[set_id] = (lock, users + 1, refreshed)
            try:
                async with lock:
                    yield refreshed
            finally:
                lock, users, refreshed = self._set_locks[set_id]
                if users == 1:
                    del self._set_locks[set_id]
                else:
                    self._set_locks[set_id] = (lock, users - 1, refreshed)

    async def _set_count_catalog(
        self, client: httpx.AsyncClient
    ) -> dict[str, _CountSetBrief]:
        async with self._set_counts_lock:
            found, cached = self._cached(self._set_count_indexes, "en")
            if found:
                return cached
            response = await self._get(client, "en/sets")
            response.raise_for_status()
            rows = response.json()
            if not isinstance(rows, list) or not 0 < len(rows) <= 512:
                raise ValueError("Invalid set count catalog")
            parsed = [_CountSetBrief.model_validate(row) for row in rows]
            if len({row.id for row in parsed}) != len(parsed):
                raise ValueError("Duplicate set count metadata")
            for row in parsed:
                _validate_asset(row.logo)
                _validate_asset(row.symbol)
            result = {row.id: row for row in parsed}
            self._store(self._set_count_indexes, "en", result, 1)
            return result

    async def _physical_catalog(
        self, client: httpx.AsyncClient, language: Language
    ) -> tuple[dict[str, SetSummary], int, int]:
        async with asyncio.TaskGroup() as group:
            metadata_task = group.create_task(self._catalog(client, language))
            counts_task = group.create_task(self._set_count_catalog(client))
        metadata, counts = metadata_task.result(), counts_task.result()
        if metadata.keys() != counts.keys():
            # A stale one-sided catalog must not silently omit a new expansion.
            self._catalogs.clear()
            self._set_count_indexes.clear()
            raise ValueError("Conflicting set catalogs")
        physical = {}
        pocket = unknown = 0
        for set_id, item in metadata.items():
            serie = item.serie.id if item.serie is not None else None
            if serie == "tcgp":
                pocket += 1
            elif serie not in PHYSICAL_SERIES:
                unknown += 1
            else:
                count = counts[set_id].cardCount
                physical[set_id] = SetSummary(
                    **item.model_dump(),
                    official_count=count.official if count else None,
                    provider_total=count.total if count else None,
                )
        return physical, pocket, unknown

    async def list_sets(
        self,
        language: Language = "es",
        page: int = 1,
        page_size: int = 12,
        q: str = "",
        series_id: str | None = None,
        sort: SetSort = "newest",
    ) -> SetPage:
        try:
            async with asyncio.timeout(15), self._client() as client:
                catalog, pocket, unknown = await self._physical_catalog(
                    client, language
                )
                query = q.strip().casefold()
                matching = [
                    item
                    for item in catalog.values()
                    if (
                        not query
                        or query in item.id.casefold()
                        or query in item.name.casefold()
                    )
                    and (series_id is None or item.serie.id == series_id)
                ]

                def key(item: SetSummary):
                    ordinal = (
                        date.fromisoformat(item.release_date).toordinal()
                        if item.release_date
                        else 0
                    )
                    return (
                        item.release_date is None,
                        -ordinal if sort == "newest" else ordinal,
                        item.id,
                    )

                matching.sort(key=key)
                series = {item.serie.id: item.serie for item in catalog.values()}
                offset = (page - 1) * page_size
                return SetPage(
                    results=matching[offset : offset + page_size],
                    total=len(matching),
                    page=page,
                    page_size=page_size,
                    series=sorted(
                        series.values(), key=lambda row: (row.name.casefold(), row.id)
                    ),
                    excluded_pocket=pocket,
                    excluded_unknown_series=unknown,
                )
        except (
            ExceptionGroup,
            httpx.HTTPError,
            TimeoutError,
            ValueError,
            TypeError,
            AttributeError,
        ) as error:
            raise CardsUnavailable from error

    async def _set_resource(
        self,
        client: httpx.AsyncClient,
        set_id: str,
        language: Language,
        serie_id: str,
    ) -> _SetResource | None:
        key = (set_id, language)
        found, cached = self._cached(self._set_resources, key)
        if found:
            return cached
        response = await self._get(client, f"{language}/sets/{set_id}")
        if response.status_code == 404 and language == "es":
            self._store(self._set_resources, key, None, 64)
            return None
        response.raise_for_status()
        raw = _SetResource.model_validate(response.json())
        if raw.id != set_id or (raw.serie is not None and raw.serie.id != serie_id):
            raise ValueError("Conflicting set identity")
        if len({card.id for card in raw.cards}) != len(raw.cards):
            raise ValueError("Duplicate set membership")
        for asset in (raw.logo, raw.symbol):
            _validate_asset(asset)
        for card in raw.cards:
            if not str(card.localId).strip():
                raise ValueError("Missing local card number")
            _validate_asset(card.image)
        if language == "en" and _checklist_status(raw) in ("verified", "empty"):
            # Revalidation establishes a new canonical snapshot. A translated
            # view/overlay must never survive it, including after LRU eviction.
            for view_key in list(self._checklists):
                if view_key[0] == set_id:
                    del self._checklists[view_key]
            self._set_resources.pop((set_id, "es"), None)
            self._store(self._set_resources, key, raw, 64)
        return raw

    async def _shared_set_resource(
        self,
        group: _SetRefreshGroup,
        client: httpx.AsyncClient,
        set_id: str,
        language: Language,
        serie_id: str,
    ) -> _SetResource | None:
        if language in group.failures:
            raise group.failures[language]
        if language not in group.resources:
            try:
                group.resources[language] = await self._set_resource(
                    client, set_id, language, serie_id
                )
            except (
                ExceptionGroup,
                httpx.HTTPError,
                TimeoutError,
                ValueError,
                TypeError,
                AttributeError,
            ) as error:
                # Cancellation deliberately propagates without sharing an error:
                # a surviving waiter can finish its own refresh immediately.
                group.failures[language] = error
                raise
        return group.resources[language]

    async def get_set_checklist(
        self, set_id: str, language: Language = "es"
    ) -> SetChecklist:
        try:
            CardSerie(id=set_id, name=set_id)
        except ValueError as error:
            raise SetNotFound from error
        key = (set_id, language)
        found, cached = self._cached(self._checklists, key)
        if found:
            return cached.model_copy(deep=True)
        try:
            async with asyncio.timeout(15), self._set_refresh(set_id) as refreshed:
                # Already-waiting callers share even an incomplete result. The
                # group disappears when its last caller leaves, so an ordinary
                # subsequent request immediately retries incomplete membership.
                if language in refreshed.views:
                    return refreshed.views[language].model_copy(deep=True)
                found, cached = self._cached(self._checklists, key)
                if found:
                    return cached.model_copy(deep=True)
                async with self._client() as client:
                    catalog, _, _ = await self._physical_catalog(client, language)
                    metadata = catalog.get(set_id)
                    if metadata is None:
                        raise SetNotFound
                    english = await self._shared_set_resource(
                        refreshed, client, set_id, "en", metadata.serie.id
                    )
                    spanish = (
                        await self._shared_set_resource(
                            refreshed, client, set_id, "es", metadata.serie.id
                        )
                        if language == "es"
                        else None
                    )
                english_by_id = {card.id: card for card in english.cards}
                spanish_by_id = (
                    {card.id: card for card in spanish.cards} if spanish else {}
                )
                if not spanish_by_id.keys() <= english_by_id.keys() or any(
                    str(card.localId) != str(english_by_id[card.id].localId)
                    for card in spanish_by_id.values()
                ):
                    self._set_resources.pop((set_id, "es"), None)
                    raise ValueError("Conflicting translated set membership")
                status = _checklist_status(english)
                normalized_set = _normalize_set(english, spanish, language, {})
                normalized_set.serie = metadata.serie
                revision = (
                    hashlib.sha256(
                        "\n".join(sorted(english_by_id)).encode()
                    ).hexdigest()
                    if status == "verified"
                    else None
                )
                cards = []
                for original in english.cards:
                    translated = spanish_by_id.get(original.id)
                    selected = translated or original
                    selected_language: Language = (
                        "es" if translated is not None else "en"
                    )
                    sources = []
                    for raw_card, resource_language in [
                        (translated, "es"),
                        (original, "en"),
                    ]:
                        if raw_card is not None and raw_card.image is not None:
                            source = _image_source(raw_card.image, resource_language)
                            if not any(
                                item.base_url == source.base_url for item in sources
                            ):
                                sources.append(source)
                    image = str(sources[0].base_url).rstrip("/") if sources else None
                    cards.append(
                        SetCard(
                            id=original.id,
                            name=selected.name,
                            local_id=str(original.localId),
                            language=selected_language,
                            image_url=f"{image}/high.webp" if image else None,
                            thumbnail_url=f"{image}/low.webp" if image else None,
                            image_sources=sources,
                            image_language=sources[0].language if sources else None,
                        )
                    )
                result = SetChecklist(
                    metadata=SetDetail(
                        **normalized_set.model_dump(),
                        official_count=english.cardCount.official
                        if english.cardCount
                        else None,
                        provider_total=english.cardCount.total
                        if english.cardCount
                        else None,
                        checklist_status=status,
                        checklist_size=len(cards),
                        checklist_revision=revision,
                    ),
                    cards=cards,
                )
                canonical_entry = self._set_resources.get((set_id, "en"))
                if status != "incomplete" and canonical_entry is not None:
                    localized_complete = (
                        spanish is None or _checklist_status(spanish) == "verified"
                    )
                    if spanish is not None and localized_complete:
                        self._store(self._set_resources, (set_id, "es"), spanish, 64)
                    # The fallback view is still a fully verified English
                    # checklist. Briefly cache partial translations to coalesce
                    # requests, without treating their raw membership as full.
                    lifetime = 300 if localized_complete else 60
                    self._store(
                        self._checklists,
                        key,
                        result,
                        32,
                        expires_at=min(
                            canonical_entry[0],
                            self._catalogs.get("en", (self._clock(), None))[0],
                            self._clock() + lifetime,
                        ),
                    )
                refreshed.views[language] = result
                return result.model_copy(deep=True)
        except (
            ExceptionGroup,
            httpx.HTTPError,
            TimeoutError,
            ValueError,
            TypeError,
            AttributeError,
        ) as error:
            raise CardsUnavailable from error

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
                self._catalogs.pop("es", None)
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
            self._store(
                self._catalogs,
                "es",
                catalog,
                2,
                expires_at=self._catalogs["en"][0],
            )
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
