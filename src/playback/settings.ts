export interface PlaySettings {
  countdownSeconds: number;
  fallbackBpm: number;
  hitToleranceMs: number;
  showHitsWhilePlaying: boolean;
  playFullscreen: boolean;
}

export const PLAY_SETTINGS_KEY = "piano.play-settings";
export const DEFAULT_PLAY_SETTINGS: PlaySettings = { countdownSeconds: 3, fallbackBpm: 120, hitToleranceMs: 250, showHitsWhilePlaying: false, playFullscreen: false };

export function readPlaySettings(storage: Pick<Storage, "getItem"> | undefined): PlaySettings {
  let value: unknown;
  try { value = JSON.parse(storage?.getItem(PLAY_SETTINGS_KEY) ?? "null"); } catch { return DEFAULT_PLAY_SETTINGS; }
  if (!value || typeof value !== "object") return DEFAULT_PLAY_SETTINGS;
  const candidate = value as Partial<PlaySettings> & { autoHideSidebarOnPlay?: unknown };
  return {
    countdownSeconds: integerInRange(candidate.countdownSeconds, 0, 10, 3),
    fallbackBpm: integerInRange(candidate.fallbackBpm, 30, 300, 120),
    hitToleranceMs: integerInRange(candidate.hitToleranceMs, 0, 1000, 250),
    showHitsWhilePlaying: typeof candidate.showHitsWhilePlaying === "boolean" ? candidate.showHitsWhilePlaying : false,
    playFullscreen: typeof candidate.playFullscreen === "boolean"
      ? candidate.playFullscreen
      : typeof candidate.autoHideSidebarOnPlay === "boolean" ? candidate.autoHideSidebarOnPlay : false,
  };
}

export function storePlaySettings(storage: Pick<Storage, "setItem"> | undefined, settings: PlaySettings): void {
  try { storage?.setItem(PLAY_SETTINGS_KEY, JSON.stringify(settings)); } catch { /* Preferences are optional. */ }
}

function integerInRange(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}
