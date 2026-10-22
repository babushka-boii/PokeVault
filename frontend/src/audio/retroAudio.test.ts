import { afterEach, expect, test, vi } from "vitest";
import { readAudioPreferences, RetroAudio } from "./retroAudio";

afterEach(() => vi.unstubAllGlobals());

function fakeAudio(restricted = false) {
  const voices: { frequency: { setValueAtTime: ReturnType<typeof vi.fn> }; stop: ReturnType<typeof vi.fn> }[] = [];
  const resume = vi.fn().mockImplementation(() => restricted ? Promise.reject(new Error("blocked")) : Promise.resolve());
  const close = vi.fn().mockResolvedValue(undefined);
  const create = vi.fn().mockImplementation(function () {
    return {
      state: restricted ? "suspended" : "running", currentTime: 0, destination: {}, resume, close,
      createGain: () => ({ gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }),
      createOscillator: () => {
        const voice = { type: "", frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() };
        voices.push(voice); return voice;
      },
    };
  });
  vi.stubGlobal("AudioContext", create);
  return { create, voices, resume, close };
}

test("does not initialize audio while muted or silent; reuses context, throttles and closes", async () => {
  const { create, voices, close } = fakeAudio();
  const audio = new RetroAudio();
  await audio.play("select", { enabled: false, volume: .15 });
  await audio.play("select", { enabled: true, volume: 0 });
  expect(create).not.toHaveBeenCalled();
  await audio.play("select", { enabled: true, volume: .15 });
  await audio.play("select", { enabled: true, volume: .15 });
  expect(voices).toHaveLength(1);
  audio.silence();
  expect(voices[0].stop).toHaveBeenCalledTimes(2);
  audio.dispose();
  expect(close).toHaveBeenCalledOnce();
});

test("restricted audio rejects gracefully with no unhandled promise", async () => {
  const { voices, resume } = fakeAudio(true);
  const audio = new RetroAudio();
  await expect(audio.play("switch", { enabled: true, volume: .15 })).resolves.toBe(false);
  expect(resume).toHaveBeenCalledOnce();
  expect(voices).toHaveLength(0);
  audio.dispose();
});

test("invalid stored preferences use safe defaults and volume is clamped", () => {
  localStorage.setItem("pokevault.audio", '{broken');
  expect(readAudioPreferences()).toEqual({ enabled: false, volume: .15 });
  localStorage.setItem("pokevault.audio", '{"enabled":true,"volume":500}');
  expect(readAudioPreferences()).toEqual({ enabled: true, volume: 1 });
});
