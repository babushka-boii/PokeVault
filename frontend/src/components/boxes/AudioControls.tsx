import { useLocale } from "../../i18n/LocaleProvider";
import type { AudioPreferences } from "../../audio/retroAudio";

export function AudioControls({ preferences, update, unavailable }: {
  preferences: AudioPreferences; update: (next: AudioPreferences) => void; unavailable: boolean;
}) {
  const { dictionary: { boxes: text } } = useLocale();
  return <fieldset className="pc-audio">
    <legend>{text.audio}</legend>
    <label><input type="checkbox" checked={preferences.enabled}
      onChange={(event) => update({ ...preferences, enabled: event.target.checked })} />{text.sound}</label>
    <label>{text.volume}<input type="range" min="0" max="100" value={Math.round(preferences.volume * 100)}
      onChange={(event) => update({ ...preferences, volume: Number(event.target.value) / 100 })} /></label>
    {unavailable && <span role="status">{text.audioUnavailable}</span>}
  </fieldset>;
}
