export interface AudioSettings {
  muted: boolean;
  volume: number;
  metronomeEnabled: boolean;
  metronomeVolume: number;
}

export const AUDIO_SETTINGS_KEY = "piano.audio-settings";
export const DEFAULT_AUDIO_SETTINGS: AudioSettings = { muted: false, volume: 65, metronomeEnabled: false, metronomeVolume: 55 };

export function readAudioSettings(storage: Pick<Storage, "getItem"> | undefined): AudioSettings {
  let value: unknown;
  try { value = JSON.parse(storage?.getItem(AUDIO_SETTINGS_KEY) ?? "null"); } catch { return DEFAULT_AUDIO_SETTINGS; }
  if (!value || typeof value !== "object") return DEFAULT_AUDIO_SETTINGS;
  const candidate = value as Partial<AudioSettings>;
  return {
    muted: typeof candidate.muted === "boolean" ? candidate.muted : false,
    volume: integerInRange(candidate.volume, 0, 100, DEFAULT_AUDIO_SETTINGS.volume),
    metronomeEnabled: typeof candidate.metronomeEnabled === "boolean" ? candidate.metronomeEnabled : false,
    metronomeVolume: integerInRange(candidate.metronomeVolume, 0, 100, DEFAULT_AUDIO_SETTINGS.metronomeVolume),
  };
}

export function storeAudioSettings(storage: Pick<Storage, "setItem"> | undefined, settings: AudioSettings): void {
  try { storage?.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(settings)); } catch { /* Preferences are optional. */ }
}

function integerInRange(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}
