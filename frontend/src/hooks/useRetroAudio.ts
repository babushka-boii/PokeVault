import { useEffect, useRef, useState } from "react";
import { AUDIO_STORAGE_KEY, readAudioPreferences, RetroAudio, type Sound, type AudioPreferences } from "../audio/retroAudio";

export function useRetroAudio() {
  const engine = useRef<RetroAudio | null>(null);
  const [preferences, setPreferences] = useState(readAudioPreferences);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const audio = new RetroAudio();
    engine.current = audio;
    return () => { engine.current = null; audio.dispose(); };
  }, []);
  function update(next: AudioPreferences) {
    engine.current?.silence();
    setPreferences(next);
    try { localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(next)); } catch { /* Session-only settings. */ }
  }
  function play(sound: Sound) {
    const current = engine.current;
    void current?.play(sound, preferences).then((supported) => {
      if (engine.current === current) setUnavailable(!supported);
    });
  }
  return { preferences, update, play, unavailable };
}
