# PokéVault logical data model

The original model below defines the planned inventory domain. Iteration 5A
implements only the authentication subset described at the end of this file;
catalog and inventory entities remain conceptual unless stated otherwise.

```mermaid
erDiagram
    DataProvider ||--o{ PokemonSpecies : supplies
    DataProvider ||--o{ TcgSet : supplies
    PokemonSpecies ||--o{ SpeciesName : localized_as
    PokemonSpecies ||--o{ CardSpecies : appears_on
    TcgSet ||--o{ SetName : localized_as
    TcgSet ||--o{ CardPrinting : contains
    CardPrinting ||--o{ CardName : localized_as
    CardPrinting ||--o{ CardSpecies : links
    AppUser ||--|| UserSettings : configures
    AppUser ||--o{ OwnedCardCopy : owns
    AppUser ||--o{ CollectionBox : owns
    CollectionBox ||--o{ BoxMembership : contains
    OwnedCardCopy ||--o| BoxMembership : placed_in

    DataProvider { string code PK string base_url string terms_url datetime last_reviewed_at }
    PokemonSpecies { uuid id PK int national_dex_number UK string canonical_slug string generation string sprite_url string provider_code FK string provider_external_id }
    SpeciesName { uuid species_id FK string language_code string name }
    TcgSet { uuid id PK string provider_code FK string external_id date release_date int official_count int total_count }
    SetName { uuid set_id FK string language_code string name }
    CardPrinting { uuid id PK uuid set_id FK string provider_external_id string local_number string category string rarity string image_url }
    CardName { uuid card_id FK string language_code string name }
    CardSpecies { uuid card_id FK uuid species_id FK int display_order }
    AppUser { uuid id PK string auth_subject UK }
    UserSettings { uuid user_id PK string display_name string locale string avatar_key uuid favorite_species_id FK }
    OwnedCardCopy { uuid id PK uuid user_id FK uuid card_id FK string condition string language string finish date acquired_on string notes }
    CollectionBox { uuid id PK uuid user_id FK string name int display_position string wallpaper_key }
    BoxMembership { uuid user_id FK uuid box_id FK uuid owned_copy_id FK int position }
```

## Entities and constraints

- `DataProvider` stores provenance. Provider plus external ID is unique for `PokemonSpecies`, `TcgSet`, and `CardPrinting`; National Dex number is also unique for species.
- `SpeciesName`, `SetName`, and `CardName` are unique per parent and language. Localized labels never serve as canonical enum identifiers.
- `CardSpecies` preserves display order and is unique by card/species. Pokémon printings may link to multiple species; Trainer and Energy printings have none. Missing provider links remain unresolved rather than guessed.
- `AppUser` is identified by a unique external authentication subject. `UserSettings` is one-to-one and may reference a favorite species.
- `OwnedCardCopy` represents one physical card. `CollectionBox` is a user-owned manual ordering container; species grouping is a query/view concern.
- `BoxMembership` carries `user_id`. Composite foreign keys `(box_id, user_id)` and `(owned_copy_id, user_id)` prevent cross-user membership, and `(box_id, owned_copy_id)` is unique. Deleting a box cascades to memberships only, never to owned copies.

Prices are evidence in this feasibility iteration, not persisted model entities: currency and observation time must be designed before monetary storage. Deferred extensions include price snapshots, transactions and lines, wishlist, decks, scans and candidates, smart-box rules, trade state, and sale state. Physical-copy identity must remain stable when those tables are introduced.

## Runtime TCG catalog boundary (2026-10-22)

The new public catalog adapter does not persist domain rows or change this ERD.
TCGdex `id` maps to the future CardPrinting provider/external-ID identity; language
is metadata/localized content, not a different printing ID. `set.id` and `localId`
remain separate fields. The complete provider `dexId` array maps to the existing
many-to-many CardSpecies concept, including Pikachu & Zekrom (#25/#644). Missing
links remain unresolved; Trainer/Energy normalize to no species associations.

Card DTOs expose recorded variants and optional official fields without owned-copy
quantity, purchase cost or valuation. `available_languages` means resources verified
in the response, not all physical printing languages. The current English discovery
pool also includes Pocket entries; a future inventory slice must explicitly define
physical/digital eligibility rather than treating every public catalog entry as a
physical owned copy. Durable catalog synchronization remains a separate increment.

## Iteration 5A — Persisted authentication subset (2026-10-24)

Alembic revision `0002` follows and preserves `0001`. It adds:

| Table | Persisted fields and integrity |
| --- | --- |
| `users` | UUID `id`; unique case-sensitive Google `google_sub`; mutable display name, nullable email/picture URL, verified-email Boolean; timezone-aware created/updated timestamps. Email is not an identity key or unique account constraint. |
| `user_settings` | One-to-one `user_id` PK/FK; preferred language (ES/EN), optional customized display name, trainer avatar identifier and favorite National Dex ID. No avatar catalog or species table is invented. |
| `auth_sessions` | Opaque-token SHA-256 digest PK, user FK, created/expiry timestamps. No reusable session secret or Google token is stored. |
| `oauth_transactions` | State digest PK, browser-binding digest, nonce, PKCE verifier and created/expiry timestamps. These are short-lived server-only authorization transactions, atomically consumed on callback. |

User-dependent rows cascade on user deletion. Application user IDs remain stable
across repeat logins and email changes. New account/settings/session persistence
is transactional, with database subject uniqueness handling concurrent sign-ins.
The migration can be downgraded to `0001`; doing so intentionally removes auth
records while retaining technical metadata. Do not downgrade a populated user
database casually. Integration tests exercise reversal only in disposable schemas.

The original ERD's `AppUser` concept maps to implemented `User`/`users`.
Favorite Pokémon uses a bounded National Dex reference until a persistent species
catalog exists. Optional preferences are foundations, not settings-editing APIs.
Future inventory must FK the internal UUID and enforce same-user membership as
specified above; no owned-copy/collection/wishlist tables are added in 5A.
