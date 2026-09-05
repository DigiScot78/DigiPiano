import { describe, expect, it } from "vitest";
import { AUDIO_SETTINGS_KEY, DEFAULT_AUDIO_SETTINGS, readAudioSettings } from "./settings";

describe("audio settings", () => {
  it("uses audible defaults without storage", () => expect(readAudioSettings(undefined)).toEqual(DEFAULT_AUDIO_SETTINGS));
  it("reads valid persisted settings", () => expect(readAudioSettings({ getItem: (key) => key === AUDIO_SETTINGS_KEY ? JSON.stringify({ muted: true, volume: 32, metronomeEnabled: true, metronomeVolume: 48 }) : null })).toEqual({ muted: true, volume: 32, metronomeEnabled: true, metronomeVolume: 48 }));
  it("falls back for invalid settings", () => expect(readAudioSettings({ getItem: () => JSON.stringify({ muted: "yes", volume: 101 }) })).toEqual(DEFAULT_AUDIO_SETTINGS));
});
