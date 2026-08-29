import { describe, expect, it } from "vitest";
import { DEFAULT_PLAY_SETTINGS, PLAY_SETTINGS_KEY, readPlaySettings } from "./settings";

describe("play settings", () => {
  it("uses defaults without storage", () => expect(readPlaySettings(undefined)).toEqual(DEFAULT_PLAY_SETTINGS));
  it("reads valid persisted settings", () => expect(readPlaySettings({ getItem: (key) => key === PLAY_SETTINGS_KEY ? JSON.stringify({ countdownSeconds: 5, fallbackBpm: 80, hitToleranceMs: 400, showHitsWhilePlaying: true, playFullscreen: true }) : null })).toEqual({ countdownSeconds: 5, fallbackBpm: 80, hitToleranceMs: 400, showHitsWhilePlaying: true, playFullscreen: true }));
  it("migrates the legacy auto-hide preference to fullscreen", () => expect(readPlaySettings({ getItem: () => JSON.stringify({ autoHideSidebarOnPlay: true }) }).playFullscreen).toBe(true));
  it("prefers the new fullscreen preference over the legacy value", () => expect(readPlaySettings({ getItem: () => JSON.stringify({ playFullscreen: false, autoHideSidebarOnPlay: true }) }).playFullscreen).toBe(false));
  it("falls back for invalid values", () => expect(readPlaySettings({ getItem: () => JSON.stringify({ countdownSeconds: 11, fallbackBpm: 2, hitToleranceMs: -1 }) })).toEqual(DEFAULT_PLAY_SETTINGS));
});
