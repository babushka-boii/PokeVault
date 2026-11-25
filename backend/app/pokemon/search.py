from app.pokemon.catalog import SpeciesCatalog, get_catalog, normalize_name
from app.pokemon.schemas import (
    NATIONAL_DEX_TOTAL,
    SpeciesMatch,
    SpeciesMatches,
    sprite_url,
)


class SpeciesIndex:
    """Name and number search over the fixed index: no network, no failure mode."""

    def __init__(self, catalog: SpeciesCatalog | None = None) -> None:
        self._catalog = catalog

    @property
    def catalog(self) -> SpeciesCatalog:
        return self._catalog or get_catalog()

    async def search(self, query: str, limit: int) -> SpeciesMatches:
        query = query.strip()
        numeric = query.removeprefix("#")
        if numeric.isascii() and numeric.isdigit():
            number = int(numeric)
            if not 1 <= number <= NATIONAL_DEX_TOTAL:
                return SpeciesMatches(results=[])
        else:
            number = None
        normalized = normalize_name(query)
        if not normalized:
            return SpeciesMatches(results=[])
        catalog = self.catalog
        found = []
        for row, (english, spanish) in zip(catalog.rows, catalog.keys, strict=True):
            if number is not None:
                if row.number != number:
                    continue
            elif normalized not in english and normalized not in spanish:
                continue
            exact = normalized in (english, spanish)
            found.append((not exact, row.number, row))
        found.sort(key=lambda item: item[:2])
        return SpeciesMatches(
            results=[
                SpeciesMatch(
                    national_dex_number=row.number,
                    name=row.name_en,
                    name_es=row.name_es,
                    types=row.types,
                    sprite_url=sprite_url(row.number),
                )
                for _, _, row in found[:limit]
            ]
        )
