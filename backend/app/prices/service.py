"""Reference prices on demand: stored snapshots first, bounded refreshes, no blocking.

* Snapshots are fresh for 24 h. Stale or missing ones are refreshed, at most
  ``refresh_budget`` per call (missing first, then oldest), within
  ``refresh_deadline`` seconds. Unfinished refreshes keep running and serve the next
  request; the caller gets the stale value or ``pending``.
* After a TCGdex failure no refresh is attempted for ``provider_cooldown`` so an
  outage never turns every request into 40 timeouts.
* Rates follow ``store.rates_refresh_allowed`` (24 h cache, 20 min retry gap).
* Nothing here filters by user: callers pass only the authenticated user's copies.
"""

import asyncio
import logging
from collections import Counter, OrderedDict
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy.exc import SQLAlchemyError

from app.cards.provider import CardsUnavailable
from app.prices import store
from app.prices.api_schemas import (
    CardPrices,
    CopyPrice,
    CopyPrices,
    Quote,
    RatesInfo,
    TargetCurrency,
    Valuation,
    VariantPrice,
)
from app.prices.conversion import convert, round_for, total
from app.prices.normalize import normalize_pricing
from app.prices.rates import RatesUnavailable
from app.prices.schemas import (
    ExchangeRates,
    NoPrice,
    NoPriceReason,
    PriceQuote,
    PriceSnapshot,
)
from app.prices.selection import select_price

logger = logging.getLogger(__name__)
PRICED_VARIANTS = ("normal", "reverse", "holo")
_NO_DATA = PriceSnapshot(status="no_data")
_FAILED = object()
# Unknown card ids are remembered in memory only: the public card endpoint must not let
# anyone fill the database with snapshots for invented identifiers.
MISSING_CAPACITY = 2048


@dataclass(frozen=True)
class CopyRef:
    copy_id: UUID
    card_id: str
    variant: str


@dataclass(frozen=True)
class SnapshotResult:
    snapshot: PriceSnapshot | None = None
    stale: bool = False
    reason: NoPriceReason | None = None


@dataclass(frozen=True)
class RatesResult:
    rates: ExchangeRates | None
    stale: bool = False

    def info(self) -> RatesInfo:
        if self.rates is None:
            return RatesInfo(available=False)
        return RatesInfo(
            available=True, stale=self.stale, updated_at=self.rates.updated_at
        )


@dataclass(frozen=True)
class _Priced:
    ref: CopyRef
    quote: PriceQuote
    stale: bool
    converted: Decimal | None


def _plain(value: Decimal) -> str:
    return format(value.normalize(), "f")


def _utc_now() -> datetime:
    return datetime.now(UTC)


class PriceService:
    def __init__(
        self,
        provider,
        rates_client,
        *,
        clock: Callable[[], datetime] = _utc_now,
        refresh_budget: int = 40,
        refresh_deadline: float = 10.0,
        provider_cooldown: timedelta = timedelta(seconds=60),
    ) -> None:
        self._provider = provider
        self._rates_client = rates_client
        self._clock = clock
        self._budget = refresh_budget
        self._deadline = refresh_deadline
        self._cooldown = provider_cooldown
        self._provider_down_until: datetime | None = None
        self._inflight: dict[str, asyncio.Task] = {}
        self._missing: OrderedDict[str, datetime] = OrderedDict()
        self._rates_lock = asyncio.Lock()

    # --- Snapshots ---

    async def snapshots(
        self, factory, card_ids: Sequence[str]
    ) -> dict[str, SnapshotResult]:
        ids = list(dict.fromkeys(card_ids))
        if not ids:
            return {}
        now = self._clock()
        with factory.begin() as session:
            stored = store.get_snapshots(session, ids)
        results: dict[str, SnapshotResult] = {}
        missing: list[str] = []
        stale: list[str] = []
        for card_id in ids:
            found = stored.get(card_id)
            if found is None and self._known_missing(card_id, now):
                results[card_id] = SnapshotResult(_NO_DATA)
            elif found is None:
                missing.append(card_id)
            elif store.is_fresh(found.fetched_at, now, store.SNAPSHOT_TTL):
                results[card_id] = SnapshotResult(found.snapshot)
            else:
                stale.append(card_id)
        stale.sort(key=lambda card_id: stored[card_id].fetched_at)
        provider_down = (
            self._provider_down_until is not None and now < self._provider_down_until
        )
        attempted = [] if provider_down else (missing + stale)[: self._budget]
        outcomes = await self._refresh_many(factory, attempted)
        for card_id in missing + stale:
            outcome = outcomes.get(card_id)
            if isinstance(outcome, PriceSnapshot):
                results[card_id] = SnapshotResult(outcome)
            elif card_id in stored:
                results[card_id] = SnapshotResult(stored[card_id].snapshot, stale=True)
            elif provider_down or outcome is _FAILED:
                results[card_id] = SnapshotResult(reason="source_unavailable")
            else:  # over budget or still refreshing in the background
                results[card_id] = SnapshotResult(reason="pending")
        return results

    async def _refresh_many(self, factory, card_ids: list[str]) -> dict[str, object]:
        if not card_ids:
            return {}
        tasks = {card_id: self._refresh_task(factory, card_id) for card_id in card_ids}
        done, _ = await asyncio.wait(set(tasks.values()), timeout=self._deadline)
        return {
            card_id: task.result() for card_id, task in tasks.items() if task in done
        }

    def _known_missing(self, card_id: str, now: datetime) -> bool:
        seen = self._missing.get(card_id)
        if seen is None:
            return False
        if not store.is_fresh(seen, now, store.SNAPSHOT_TTL):
            del self._missing[card_id]
            return False
        return True

    def _remember_missing(self, card_id: str) -> None:
        self._missing[card_id] = self._clock()
        self._missing.move_to_end(card_id)
        while len(self._missing) > MISSING_CAPACITY:
            self._missing.popitem(last=False)

    def _refresh_task(self, factory, card_id: str) -> asyncio.Task:
        task = self._inflight.get(card_id)
        if task is None:
            task = asyncio.create_task(self._refresh(factory, card_id))
            self._inflight[card_id] = task
            task.add_done_callback(lambda _: self._inflight.pop(card_id, None))
        return task

    async def _refresh(self, factory, card_id: str) -> object:
        try:
            raw = await self._provider.card_pricing(card_id)
        except Exception as error:  # noqa: BLE001 - a price never breaks a page
            if not isinstance(error, CardsUnavailable):
                logger.warning("Unexpected pricing failure (%s)", type(error).__name__)
            self._provider_down_until = self._clock() + self._cooldown
            return _FAILED
        if raw is None:  # not in the catalog: never persisted (see MISSING_CAPACITY)
            self._remember_missing(card_id)
            return _NO_DATA
        snapshot = normalize_pricing(raw.pricing, raw.variants)
        try:
            with factory.begin() as session:
                store.save_snapshot(session, card_id, snapshot, self._clock())
        except SQLAlchemyError:
            # E.g. another process saved the same card first; the value is still valid.
            logger.warning("Could not store a price snapshot")
        return snapshot

    # --- Rates ---

    async def rates(self, factory) -> RatesResult:
        with factory.begin() as session:
            stored = store.get_rates(session)
        if store.rates_refresh_allowed(stored, self._clock()):
            async with self._rates_lock:
                with factory.begin() as session:  # re-check after waiting
                    stored = store.get_rates(session)
                if store.rates_refresh_allowed(stored, self._clock()):
                    stored = await self._refresh_rates(factory, stored)
        if stored is None or stored.rates is None:
            return RatesResult(None)
        fresh = store.is_fresh(stored.fetched_at, self._clock(), store.RATES_TTL)
        return RatesResult(stored.rates, stale=not fresh)

    async def _refresh_rates(self, factory, stored):
        try:
            rates = await self._rates_client.fetch()
        except RatesUnavailable as error:
            logger.warning("Exchange rates unavailable (%s)", error)
            rates = None
        try:
            with factory.begin() as session:
                if rates is None:
                    store.record_rates_failure(session, self._clock())
                else:
                    store.save_rates(session, rates, self._clock())
            with factory.begin() as session:
                return store.get_rates(session)
        except SQLAlchemyError:
            logger.warning("Could not store exchange rates")
            if rates is None:
                return stored
            return store.StoredRates(rates, self._clock(), self._clock())

    # --- Valuation ---

    async def _evaluate(
        self, factory, refs: Sequence[CopyRef], currency: TargetCurrency
    ) -> tuple[list[CopyPrice], list[_Priced], RatesResult]:
        priceable = [ref.card_id for ref in refs if ref.variant in PRICED_VARIANTS]
        snapshots = await self.snapshots(factory, priceable)
        outcomes: list[tuple[CopyRef, PriceQuote | NoPrice, bool]] = []
        for ref in refs:
            result = snapshots.get(ref.card_id)
            if ref.variant not in PRICED_VARIANTS:
                outcomes.append((ref, select_price(_NO_DATA, ref.variant), False))
            elif result.snapshot is None:
                outcomes.append((ref, NoPrice(result.reason), False))
            else:
                selected = select_price(result.snapshot, ref.variant)
                outcomes.append((ref, selected, result.stale))
        needs_rates = any(isinstance(value, PriceQuote) for _, value, _ in outcomes)
        rates = await self.rates(factory) if needs_rates else RatesResult(None)
        prices: list[CopyPrice] = []
        priced: list[_Priced] = []
        for ref, value, stale in outcomes:
            base = {
                "copy_id": ref.copy_id,
                "card_id": ref.card_id,
                "variant": ref.variant,
            }
            if isinstance(value, NoPrice):
                prices.append(CopyPrice(**base, reason=value.reason))
                continue
            converted = (
                convert(value.amount, value.currency, currency, rates.rates)
                if rates.rates is not None
                else None
            )
            priced.append(_Priced(ref, value, stale, converted))
            prices.append(
                CopyPrice(**base, price=self._quote(value, stale, converted, currency))
            )
        return prices, priced, rates

    @staticmethod
    def _quote(
        quote: PriceQuote,
        stale: bool,
        converted: Decimal | None,
        currency: TargetCurrency,
    ) -> Quote:
        return Quote(
            amount=None if converted is None else str(round_for(currency, converted)),
            currency=currency,
            original_amount=_plain(quote.amount),
            original_currency=quote.currency,
            source=quote.source,
            metric=quote.metric,
            updated_at=quote.updated_at,
            stale=stale,
        )

    async def copy_prices(
        self, factory, refs: Sequence[CopyRef], currency: TargetCurrency
    ) -> CopyPrices:
        prices, _, rates = await self._evaluate(factory, refs, currency)
        return CopyPrices(currency=currency, results=prices, rates=rates.info())

    async def value(
        self, factory, refs: Sequence[CopyRef], currency: TargetCurrency, *, top: int
    ) -> Valuation:
        prices, priced, rates = await self._evaluate(factory, refs, currency)
        return self._aggregate(prices, priced, rates, currency, top)

    async def values_by_group(
        self,
        factory,
        groups: Mapping[UUID, Sequence[CopyRef]],
        currency: TargetCurrency,
    ) -> tuple[dict[UUID, Valuation], RatesResult]:
        """Value several groups (binders) with one evaluation and one refresh budget.

        Each copy belongs to at most one group; every group total is summed before
        rounding, exactly like ``value``.
        """
        refs = [ref for group in groups.values() for ref in group]
        prices, priced, rates = await self._evaluate(factory, refs, currency)
        price_by_copy = {item.copy_id: item for item in prices}
        priced_by_copy = {item.ref.copy_id: item for item in priced}
        values = {}
        for group_id, group in groups.items():
            ids = [ref.copy_id for ref in group]
            values[group_id] = self._aggregate(
                [price_by_copy[i] for i in ids],
                [priced_by_copy[i] for i in ids if i in priced_by_copy],
                rates,
                currency,
                0,
            )
        return values, rates

    @staticmethod
    def _aggregate(prices, priced, rates, currency, top) -> Valuation:
        reasons = Counter(item.reason for item in prices if item.reason is not None)
        originals: dict[str, list[Decimal]] = {}
        for item in priced:
            originals.setdefault(item.quote.currency, []).append(item.quote.amount)
        if not priced:
            grand_total: str | None = str(round_for(currency, Decimal(0)))
        elif rates.rates is None:
            grand_total = None
        else:
            grand_total = str(
                round_for(currency, total(item.converted for item in priced))
            )
        by_id = {item.copy_id: item for item in prices}
        ranked = (
            sorted(priced, key=lambda item: (-item.converted, str(item.ref.copy_id)))
            if rates.rates is not None
            else []
        )
        return Valuation(
            currency=currency,
            total=grand_total,
            original_totals={
                code: str(round_for(code, total(amounts)))
                for code, amounts in sorted(originals.items())
            },
            copy_count=len(prices),
            priced_count=len(priced),
            unpriced_count=len(prices) - len(priced),
            unpriced_by_reason=dict(sorted(reasons.items())),
            pending_count=reasons.get("pending", 0),
            stale_count=sum(item.stale for item in priced),
            sources=dict(sorted(Counter(i.quote.source for i in priced).items())),
            top=[by_id[item.ref.copy_id] for item in ranked[:top]],
            rates=rates.info(),
            items=prices,
        )

    async def card_prices(
        self, factory, card_id: str, currency: TargetCurrency
    ) -> CardPrices:
        refs = [CopyRef(UUID(int=0), card_id, variant) for variant in PRICED_VARIANTS]
        prices, _, rates = await self._evaluate(factory, refs, currency)
        return CardPrices(
            card_id=card_id,
            currency=currency,
            variants=[
                VariantPrice(variant=item.variant, price=item.price, reason=item.reason)
                for item in prices
            ],
            rates=rates.info(),
        )
