export type Sound = "select" | "switch" | "confirm" | "back" | "invalid";
export type AudioPreferences = { enabled: boolean; volume: number };
const defaults: AudioPreferences = { enabled: false, volume: 0.15 };
export const AUDIO_STORAGE_KEY = "pokevault.audio";

export function readAudioPreferences(): AudioPreferences {
  try {
    const value = JSON.parse(localStorage.getItem(AUDIO_STORAGE_KEY) ?? "null");
    if (typeof value?.enabled === "boolean" && typeof value.volume === "number" && Number.isFinite(value.volume)) {
      return { enabled: value.enabled, volume: Math.max(0, Math.min(1, value.volume)) };
    }
  } catch { /* Storage can be unavailable or contain invalid JSON. */ }
  return { ...defaults };
}

const tones: Record<Sound, [number, number, number]> = {
  select: [620, 780, 0.055], switch: [280, 560, 0.12],
  confirm: [520, 1040, 0.18], back: [520, 260, 0.09], invalid: [130, 110, 0.07],
};

export class RetroAudio {
  private context?: AudioContext;
  private voice?: OscillatorNode;
  private lastPlayed = -Infinity;
  private disposed = false;
  private revision = 0;

  silence() {
    this.revision++;
    try { this.voice?.stop(); } catch { /* Already stopped. */ }
    this.voice = undefined;
  }

  async play(sound: Sound, preferences: AudioPreferences): Promise<boolean> {
    if (this.disposed || !preferences.enabled || preferences.volume <= 0) return true;
    const now = performance.now();
    if (now - this.lastPlayed < 75) return true;
    this.lastPlayed = now;
    const revision = this.revision;
    try {
      if (!this.context) {
        if (typeof window.AudioContext !== "function") return false;
        this.context = new window.AudioContext();
      }
      const context = this.context;
      if (context.state === "suspended") await context.resume();
      if (context.state !== "running") return false;
      if (this.disposed || revision !== this.revision) return true;
      this.silence();
      const [start, end, duration] = tones[sound];
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = sound === "select" ? "triangle" : "square";
      oscillator.frequency.setValueAtTime(start, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(end, context.currentTime + duration);
      gain.gain.setValueAtTime(0, context.currentTime);
      gain.gain.linearRampToValueAtTime(preferences.volume * 0.16, context.currentTime + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      this.voice = oscillator;
      oscillator.start();
      oscillator.stop(context.currentTime + duration + 0.01);
      return true;
    } catch { return false; }
  }

  dispose() {
    this.disposed = true;
    this.silence();
    try { void this.context?.close().catch(() => undefined); } catch { /* Unsupported close. */ }
    this.context = undefined;
  }
}
