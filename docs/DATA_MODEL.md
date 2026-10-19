# PokéVault logical data model

This iteration defines identities and integrity rules only; it does not implement a database or migration.

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
