import { describe, expect, it } from "vitest";
import { DEFAULT_LEARNING_SETTINGS, LEARNING_SETTINGS_STORAGE_KEY } from "../learning/settings";
import { AUDIO_SETTINGS_KEY } from "../audio/settings";
import { PIANO_SETTINGS_KEY } from "../piano/piano";
import { accountPreferencesFromLearningSettings, ACCOUNT_PREFERENCE_STORAGE_KEYS, DEVICE_PREFERENCE_STORAGE_KEYS, learningSettingsFromAccountPreferences } from "./preferenceOwnership";

describe("preference ownership", () => {
  it("round-trips learner choices through the account-safe contract", () => {
    const settings = { ...DEFAULT_LEARNING_SETTINGS, tempoBuildUp: "steady" as const };
    const account = accountPreferencesFromLearningSettings(settings);
    expect(account).toEqual({ schemaVersion: 1, learning: { tempoBuildUp: "steady" } });
    expect(learningSettingsFromAccountPreferences(account)).toEqual(settings);
  });

  it("keeps hardware and presentation storage outside account preferences", () => {
    expect(ACCOUNT_PREFERENCE_STORAGE_KEYS).toEqual([LEARNING_SETTINGS_STORAGE_KEY]);
    expect(DEVICE_PREFERENCE_STORAGE_KEYS).toContain(AUDIO_SETTINGS_KEY);
    expect(DEVICE_PREFERENCE_STORAGE_KEYS).toContain(PIANO_SETTINGS_KEY);
    expect(DEVICE_PREFERENCE_STORAGE_KEYS).toContain("piano.selected-midi-input");
    expect(new Set([...ACCOUNT_PREFERENCE_STORAGE_KEYS, ...DEVICE_PREFERENCE_STORAGE_KEYS]).size).toBe(ACCOUNT_PREFERENCE_STORAGE_KEYS.length + DEVICE_PREFERENCE_STORAGE_KEYS.length);
  });
});
