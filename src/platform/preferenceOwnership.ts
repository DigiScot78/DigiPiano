import { AUDIO_SETTINGS_KEY } from "../audio/settings";
import { LEARNING_SETTINGS_STORAGE_KEY, type LearningSettings } from "../learning/settings";
import { WORKSPACE_LAYOUT_SETTINGS_KEY } from "../layout/workspace";
import { PIANO_SHORTCUTS_STORAGE_KEY } from "../midi/pianoShortcuts";
import { PIANO_SETTINGS_KEY } from "../piano/piano";
import { PLAY_SETTINGS_KEY } from "../playback/settings";
import { APP_THEME_STORAGE_KEY, SCORE_MARKER_STORAGE_KEY, SCORE_THEME_STORAGE_KEY } from "../theme/appearance";
import { DOMAIN_SCHEMA_VERSION, type AccountPreferencesDto } from "./domain";

export const ACCOUNT_PREFERENCE_STORAGE_KEYS = [LEARNING_SETTINGS_STORAGE_KEY] as const;
export const DEVICE_PREFERENCE_STORAGE_KEYS = [
  AUDIO_SETTINGS_KEY,
  PLAY_SETTINGS_KEY,
  PIANO_SETTINGS_KEY,
  PIANO_SHORTCUTS_STORAGE_KEY,
  WORKSPACE_LAYOUT_SETTINGS_KEY,
  APP_THEME_STORAGE_KEY,
  SCORE_THEME_STORAGE_KEY,
  SCORE_MARKER_STORAGE_KEY,
  "piano.selected-midi-input",
] as const;

export function accountPreferencesFromLearningSettings(settings: LearningSettings): AccountPreferencesDto {
  return { schemaVersion: DOMAIN_SCHEMA_VERSION, learning: { tempoBuildUp: settings.tempoBuildUp } };
}

export function learningSettingsFromAccountPreferences(preferences: AccountPreferencesDto): LearningSettings {
  return { version: 1, tempoBuildUp: preferences.learning.tempoBuildUp };
}
