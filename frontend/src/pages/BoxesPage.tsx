import { useState } from "react";
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

export function BoxesPage() {
  const { dictionary } = useLocale();
  const text = dictionary.boxes;
  const [page, setPage] = useState(0);
  const [focusRequest, setFocusRequest] = useState(0);
  const [selected, setSelected] = useState(0);
  const [wallpaper, setWallpaper] = useState<Wallpaper>("classic");
  const { state, retry } = useCatalogBox(page);
  const audio = useRetroAudio();
  const sprites = useSpriteMode();
  const pokemon = state.kind === "loaded" ? state.pokemon : [];
  const lastPage = Math.ceil(NATIONAL_DEX_TOTAL / BOX_SIZE) - 1;
  function switchBox(next: number) {
    setFocusRequest(0); setPage(next); setSelected(0); audio.play("switch");
  }
  function locate(match: SpeciesMatch) {
    const target = locatePokemon(match.national_dex_number);
    setPage(target.page); setSelected(target.slot);
    setFocusRequest((value) => value + 1);
    // One combined arrival effect avoids overlapping confirmation/transition tones.
    audio.play(target.page === page ? "confirm" : "switch");
  }
  return <section className="pc-page" aria-labelledby="boxes-title">
    <div className="pc-intro"><div><p className="eyebrow">{text.terminal}</p><h1 id="boxes-title">{text.title}</h1></div>
      <p className="pc-preview">{text.description}</p></div>
    <div className="pc-console">
      <SelectedPokemon pokemon={pokemon[selected]} />
      <section className={`pc-storage pc-wallpaper--${wallpaper}`} aria-labelledby="box-title">
        <header className="pc-box-header">
          <button type="button" aria-label={text.previous} disabled={page === 0} onClick={() => switchBox(page - 1)}>◀</button>
          <div><h2 id="box-title">{text.box} {String(page + 1).padStart(2, "0")}</h2>
            <span>#{String(page * BOX_SIZE + 1).padStart(3, "0")} — #{Math.min((page + 1) * BOX_SIZE, NATIONAL_DEX_TOTAL)}</span></div>
          <button type="button" aria-label={text.next} disabled={page === lastPage} onClick={() => switchBox(page + 1)}>▶</button>
          <BoxSearch choose={locate} sound={audio.play} />
        </header>
        <div className="pc-screen" aria-busy={state.kind === "loading"}>
          <StorageGrid spriteMode={sprites.effectiveMode} key={page} focusRequest={focusRequest} onFocused={() => setFocusRequest(0)} pokemon={pokemon} selected={selected} select={(index) => { setSelected(index); audio.play("select"); }} />
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
        onClick={() => { setWallpaper(preset); audio.play("confirm"); }}>{text[preset]}</button>)}
    </fieldset><AudioControls {...audio} /></div>
  </section>;
}
