export type AppTheme = "system" | "light" | "dark";
export type ResolvedAppTheme = "light" | "dark";
export type ScoreTheme = "paper" | "night";

export interface ScoreThemePreset {
  ink: string;
  page: string;
}

export const SCORE_THEME_PRESETS: Record<ScoreTheme, ScoreThemePreset> = {
  paper: { ink: "#29251f", page: "#f4ecd9" },
  night: { ink: "#e8edf2", page: "#171b22" },
};

export const APP_THEME_STORAGE_KEY = "piano.app-theme";
export const SCORE_THEME_STORAGE_KEY = "piano.score-theme";

export function resolveAppTheme(theme: AppTheme, systemDark: boolean): ResolvedAppTheme {
  return theme === "system" ? (systemDark ? "dark" : "light") : theme;
}

export function readAppTheme(storage: Pick<Storage, "getItem"> | undefined): AppTheme {
  const value = safeGet(storage, APP_THEME_STORAGE_KEY);
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function readScoreTheme(storage: Pick<Storage, "getItem"> | undefined): ScoreTheme {
  const value = safeGet(storage, SCORE_THEME_STORAGE_KEY);
  return value === "night" || value === "paper" ? value : "paper";
}

export function storeAppearance(storage: Pick<Storage, "setItem"> | undefined, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // Appearance persistence is optional.
  }
}

function safeGet(storage: Pick<Storage, "getItem"> | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
