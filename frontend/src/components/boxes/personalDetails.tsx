import { Link } from "react-router-dom";
import { useLocale } from "../../i18n/LocaleProvider";
import type { InventoryCopy } from "../../services/inventory";
import type { TcgCard } from "../../services/cards";
import type { SpriteMode } from "../../services/menuIcons";
import { PersonalIcon } from "./personalGrid";

export function PersonalDetails({ copy, card, position, mode }: { copy?: InventoryCopy; card?: TcgCard; position: number; mode: SpriteMode }) {
  const { dictionary } = useLocale(); const text = dictionary.personalBoxes; const inventory = dictionary.inventory;
  return <aside className="pc-details" aria-label={text.selected}>
    <p className="pc-caption">{text.selected}</p>
    <div className="pc-portrait">{copy ? <PersonalIcon card={card} mode={mode} /> : <span className="pc-missing">◇</span>}</div>
    <div className="pc-details-heading"><p className="eyebrow">{text.position} {position + 1}</p>
      <h2>{copy ? card?.name ?? copy.card_id : `${dictionary.boxes.emptySlot} ${position + 1}`}</h2></div>
    {copy ? <div className="pc-facts">
      {card && <><p>{dictionary.cards[card.category === "Trainer" ? "categoryTrainer" : card.category === "Energy" ? "categoryEnergy" : "categoryPokemon"]}</p>
        <p lang={card.set.name_language}>{card.set.name} · {card.local_id}</p>
        {card.category === "Pokemon" && <p>{card.dex_ids.length ? card.dex_ids.map((id) => `#${id}`).join(", ") : text.noSpecies}</p>}
      </>}
      <dl className="pc-copy-facts">
        <div><dt>{inventory.cardId}</dt><dd>{copy.card_id}</dd></div>
        <div><dt>{text.copyId}</dt><dd>{copy.id}</dd></div>
        <div><dt>{inventory.condition}</dt><dd>{inventory.conditions[copy.condition]}</dd></div>
        <div><dt>{inventory.language}</dt><dd>{inventory.languages[copy.language]}</dd></div>
        <div><dt>{inventory.variant}</dt><dd>{inventory.variants[copy.variant]}</dd></div>
        <div><dt>{inventory.date}</dt><dd>{copy.acquired_on ?? dictionary.cards.unavailable}</dd></div>
      </dl>
      {copy.notes && <p className="pc-copy-notes">{copy.notes}</p>}
      <p className="pc-copy-links"><Link to={`/collection/${copy.id}`}>{inventory.edit}</Link><Link to={`/cards/${encodeURIComponent(copy.card_id)}`}>{text.printing}</Link></p>
      <p className="pc-language-note">{inventory.physicalNote}</p>
    </div> : <p className="pc-facts">{text.chooseSlot}</p>}
  </aside>;
}
