export type TempoBuildUpPreset = "gentle" | "steady" | "at-tempo";

export interface LearningSettings { version: 1; tempoBuildUp: TempoBuildUpPreset }

export const LEARNING_SETTINGS_STORAGE_KEY = "piano.learning-settings";
export const DEFAULT_LEARNING_SETTINGS: LearningSettings = { version: 1, tempoBuildUp: "gentle" };

export const TEMPO_BUILD_UP_PRESETS: Record<TempoBuildUpPreset, { label: string; description: string; startingTempo: number }> = {
  gentle: { label: "Gentle", description: "60, 70, 80, 90, 100%", startingTempo: 60 },
  steady: { label: "Steady", description: "80, 90, 100%", startingTempo: 80 },
  "at-tempo": { label: "At tempo", description: "Start and remain at 100%", startingTempo: 100 },
};

export function readLearningSettings(storage: Pick<Storage, "getItem"> | undefined): LearningSettings {
  try {
    const value = JSON.parse(storage?.getItem(LEARNING_SETTINGS_STORAGE_KEY) ?? "null") as Partial<LearningSettings> | null;
    const tempoBuildUp = value?.tempoBuildUp;
    return { version: 1, tempoBuildUp: tempoBuildUp === "steady" || tempoBuildUp === "at-tempo" ? tempoBuildUp : "gentle" };
  } catch { return DEFAULT_LEARNING_SETTINGS; }
}

export function storeLearningSettings(storage: Pick<Storage, "setItem"> | undefined, settings: LearningSettings): void {
  try { storage?.setItem(LEARNING_SETTINGS_STORAGE_KEY, JSON.stringify(settings)); } catch { /* Optional preference. */ }
}
