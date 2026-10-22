import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useLocale } from "../i18n/LocaleProvider";
import { BOX_SIZE, NATIONAL_DEX_TOTAL, locatePokemon, type SpeciesMatch } from "../services/pokemon";
import { useCatalogBox } from "../hooks/useCatalogBox";
import { useSpriteMode } from "../hooks/useSpriteMode";
import { useRetroAudio } from "../hooks/useRetroAudio";
import { BoxSearch } from "../components/boxes/BoxSearch";
import { AudioControls } from "../components/boxes/AudioControls";
import { SelectedPokemon } from "../components/boxes/SelectedPokemon";
import { StorageGrid } from "../components/boxes/StorageGrid";
import { wallpapers, type Wallpaper } from "../components/boxes/wallpapers";
import "../components/boxes/boxes.css";

function readBoxLocation(params: URLSearchParams) {
  const box = Number(params.get("box"));
  const lastBox = Math.ceil(NATIONAL_DEX_TOTAL / BOX_SIZE);
  const page = Number.isInteger(box) && box >= 1 && box <= lastBox ? box - 1 : 0;
  const number = Number(params.get("pokemon"));
  const first = page * BOX_SIZE + 1;
  const last = Math.min(first + BOX_SIZE - 1, NATIONAL_DEX_TOTAL);
  const selected = Number.isInteger(number) && number >= first && number <= last ? number - first : 0;
  const wallpaper = wallpapers.find((preset) => preset === params.get("wallpaper")) ?? "classic";
  return { page, selected, wallpaper };
}

function boxSearchParams(page: number, selected: number, wallpaper: Wallpaper): URLSearchParams {
  return new URLSearchParams({
    box: String(page + 1), pokemon: String(page * BOX_SIZE + selected + 1), wallpaper,
  });
}

export function BoxesPage() {
  const { dictionary } = useLocale();
  const text = dictionary.boxes;
  const [params, setParams] = useSearchParams();
  const { page, selected, wallpaper } = readBoxLocation(params);
  // URL transitions can commit later than local state; only the target grid consumes focus.
  const [focusRequest, setFocusRequest] = useState<{ page: number; selected: number } | undefined>(
    () => params.has("pokemon") ? { page, selected } : undefined,
  );
  const { state, retry } = useCatalogBox(page);
  const audio = useRetroAudio();
  const sprites = useSpriteMode();
  const pokemon = state.kind === "loaded" ? state.pokemon : [];
  const lastPage = Math.ceil(NATIONAL_DEX_TOTAL / BOX_SIZE) - 1;
  const returnTo = `/boxes?${boxSearchParams(page, selected, wallpaper)}`;
  const cardCatalogHref = pokemon[selected]
    ? `/pokemon/${pokemon[selected].national_dex_number}/cards?${new URLSearchParams({ returnTo })}`
    : undefined;
  function updateLocation(nextPage: number, nextSelected: number, nextWallpaper = wallpaper) {
    setParams(boxSearchParams(nextPage, nextSelected, nextWallpaper), { replace: true });
  }
  function switchBox(next: number) {
    setFocusRequest(undefined); updateLocation(next, 0); audio.play("switch");
  }
  function locate(match: SpeciesMatch) {
    const target = locatePokemon(match.national_dex_number);
    updateLocation(target.page, target.slot);
    setFocusRequest({ page: target.page, selected: target.slot });
    // One combined arrival effect avoids overlapping confirmation/transition tones.
    audio.play(target.page === page ? "confirm" : "switch");
  }
  return <section className="pc-page" aria-labelledby="boxes-title">
    <div className="pc-intro"><div><p className="eyebrow">{text.terminal}</p><h1 id="boxes-title">{text.title}</h1></div>
      <p className="pc-preview">{text.description}</p></div>
    <div className="pc-console">
      <SelectedPokemon pokemon={pokemon[selected]} cardCatalogHref={cardCatalogHref} />
      <section className={`pc-storage pc-wallpaper--${wallpaper}`} aria-labelledby="box-title">
        <header className="pc-box-header">
          <button type="button" aria-label={text.previous} disabled={page === 0} onClick={() => switchBox(page - 1)}>◀</button>
          <div><h2 id="box-title">{text.box} {String(page + 1).padStart(2, "0")}</h2>
            <span>#{String(page * BOX_SIZE + 1).padStart(3, "0")} — #{Math.min((page + 1) * BOX_SIZE, NATIONAL_DEX_TOTAL)}</span></div>
          <button type="button" aria-label={text.next} disabled={page === lastPage} onClick={() => switchBox(page + 1)}>▶</button>
          <BoxSearch choose={locate} sound={audio.play} />
        </header>
        <div className="pc-screen" aria-busy={state.kind === "loading"}>
          <StorageGrid spriteMode={sprites.effectiveMode} key={page}
            focusRequest={focusRequest?.page === page && focusRequest.selected === selected ? 1 : 0}
            onFocused={() => setFocusRequest(undefined)} pokemon={pokemon} selected={selected}
            select={(index) => { updateLocation(page, index); audio.play("select"); }} />
          {state.kind === "loading" && <p className="pc-message" role="status">{dictionary.pokedex.loading}</p>}
          {state.kind === "error" && <div className="pc-message"><p role="alert">{dictionary.pokedex.error}</p>
            <button type="button" onClick={retry}>{dictionary.status.retry}</button></div>}
          {state.kind === "loaded" && !pokemon.length && <p className="pc-message" role="status">{dictionary.pokedex.empty}</p>}
        </div>
        <footer className="pc-help">{text.keyboard}</footer>
      </section>
    </div>
    <div className="pc-settings">
      <fieldset className="pc-sprite-modes"><legend>{text.sprites}</legend>
        <label><input type="radio" name="sprite-mode" checked={sprites.mode === "static"}
          onChange={() => sprites.setMode("static")} />{text.staticSprites}</label>
        <label><input type="radio" name="sprite-mode" checked={sprites.mode === "animated"}
          onChange={() => sprites.setMode("animated")} />{text.animatedSprites}</label>
        {sprites.reducedMotion && <p>{text.reducedMotion}</p>}
      </fieldset>
      <fieldset className="pc-wallpapers"><legend>{text.wallpaper}</legend>
      {wallpapers.map((preset) => <button key={preset} type="button" aria-pressed={wallpaper === preset}
        onClick={() => { updateLocation(page, selected, preset); audio.play("confirm"); }}>{text[preset]}</button>)}
    </fieldset><AudioControls {...audio} /></div>
  </section>;
}
