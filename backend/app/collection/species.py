"""Which Pokémon each catalog card shows, kept so ownership counts per species.

TCGdex is the only source of a card's species (``dex_ids``) and inventory stores
only card ids, so each card is resolved once and kept in ``card_species`` (shared
catalog data, with no user in it). Resolving is bounded: at most ``budget`` cards
are fetched per call, a few at a time, within a deadline; cards not resolved yet
are reported as ``pending``, never guessed.
"""

import asyncio
import re
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.cards.provider import CardNotFound, CardsUnavailable
from app.cards.schemas import IDENTIFIER_PATTERN
from app.db.models import CardSpecies
from app.pokemon.schemas import NATIONAL_DEX_TOTAL

_ID = re.compile(IDENTIFIER_PATTERN)
_CHUNK = 500


@dataclass(frozen=True)
class Resolution:
    species: dict[
        str, list[int]
    ]  # card id -> national numbers (empty: trainer, energy, unknown)
    pending: set[str]  # cards whose species could not be resolved yet


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _clean(dex_ids: Sequence[int]) -> list[int]:
    """Only real national numbers, once each, in the card's own order."""
    return [
        number
        for number in dict.fromkeys(dex_ids)
        if isinstance(number, int) and 1 <= number <= NATIONAL_DEX_TOTAL
    ]


class CardSpeciesService:
    def __init__(
        self,
        provider,
        *,
        clock=_utc_now,
        budget: int = 40,
        concurrency: int = 5,
        deadline: float = 12.0,
        ttl: timedelta = timedelta(days=30),
        retry_unknown: timedelta = timedelta(days=1),
    ) -> None:
        self._provider = provider
        self._clock = clock
        self._budget = budget
        self._concurrency = concurrency
        self._deadline = deadline
        self._ttl = ttl
        self._retry_unknown = retry_unknown

    async def resolve(self, factory, card_ids: Sequence[str]) -> Resolution:
        ids = [
            card
            for card in dict.fromkeys(card_ids)
            if len(card) <= 100 and _ID.fullmatch(card)
        ]
        if not ids:
            return Resolution({}, set())
        with factory() as session:
            rows = {}
            for start in range(0, len(ids), _CHUNK):
                rows.update(
                    {
                        row.card_id: row
                        for row in session.scalars(
                            select(CardSpecies).where(
                                CardSpecies.card_id.in_(ids[start : start + _CHUNK])
                            )
                        )
                    }
                )
            known = {
                card: (list(row.dex_ids), row.status, _aware(row.fetched_at))
                for card, row in rows.items()
            }
        now = self._clock()
        species = {card: dex for card, (dex, _, _) in known.items()}
        missing = [card for card in ids if card not in known]
        stale = [
            card
            for card, (_, status, fetched) in known.items()
            if now - fetched >= (self._ttl if status == "ok" else self._retry_unknown)
        ]
        fetched = await self._fetch((missing + stale)[: self._budget])
        self._save(factory, fetched, now)
        for card, (_, dex) in fetched.items():
            species[card] = dex
        return Resolution(species, {card for card in ids if card not in species})

    async def _fetch(self, cards: list[str]) -> dict[str, tuple[str, list[int]]]:
        if not cards:
            return {}
        gate = asyncio.Semaphore(self._concurrency)
        done: dict[str, tuple[str, list[int]]] = {}

        async def one(card: str) -> None:
            async with gate:
                try:
                    detail = await self._provider.get_card(card, "en")
                except CardNotFound:
                    done[card] = ("unknown", [])  # the catalog has no such card (yet)
                except CardsUnavailable:
                    return  # an outage: unresolved, not stored
                else:
                    done[card] = ("ok", _clean(detail.dex_ids))

        tasks = [asyncio.create_task(one(card)) for card in cards]
        _, running = await asyncio.wait(tasks, timeout=self._deadline)
        for task in running:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        return done

    @staticmethod
    def _save(
        factory, fetched: dict[str, tuple[str, list[int]]], now: datetime
    ) -> None:
        for card, (status, dex) in fetched.items():
            try:
                with factory.begin() as session:
                    row = session.get(CardSpecies, card)
                    if row is None:
                        session.add(
                            CardSpecies(
                                card_id=card, dex_ids=dex, status=status, fetched_at=now
                            )
                        )
                    else:
                        row.dex_ids, row.status, row.fetched_at = dex, status, now
            except IntegrityError, SQLAlchemyError:
                continue  # stored by another request, or a database blink: still valid
