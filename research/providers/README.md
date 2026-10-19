# Provider validation

This directory records the iteration-2 feasibility check for [TCGdex](https://tcgdex.dev/) and [PokéAPI](https://pokeapi.co/). The scope is deliberately fixed to the twelve cases in `manifest.json`; it is evidence for integration design, not a complete catalog import.

## Commands

- `python -m research.providers.validate_providers report` verifies fixture hashes and regenerates `REPORT.md` without network access. This is the normal, reproducible command.
- `python -m research.providers.validate_providers refresh` explicitly requests all twelve public HTTPS endpoints, validates invariants and cross-provider species links, then atomically replaces the fixtures and report. Exit code `0` means success; `1` means no complete valid refresh was produced.

Automated tests are offline. Each fixture contains `metadata` and a minimal `payload`. Metadata records case, provider, source URL, UTC retrieval time and the SHA-256 of canonical UTF-8 payload JSON. Responses are capped at 2 MiB, redirects must remain HTTPS on the original host, and a failed refresh preserves prior valid evidence.

The committed evidence was retrieved on 2026-10-19. It confirms the sampled identifiers, categories, species links, set counts, localization, variants, optional price fields, and image/sprite URLs. It does not establish complete API coverage, uptime, price fitness, or permission to redistribute Pokémon artwork. Technical accessibility is not asset-license approval; terms and licenses require a separate review before production use.
