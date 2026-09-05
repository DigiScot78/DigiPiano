export type AppTheme = "system" | "light" | "dark";
export type ResolvedAppTheme = "light" | "dark";
export type ScoreTheme = "paper" | "night";
export type ScoreMarkerColor = "theme" | `#${string}`;

export interface ScoreMarkerSettings {
  color: ScoreMarkerColor;
  opacity: number;
  restOpacity: number;
}

export interface ScoreThemePreset {
  ink: string;
  page: string;
}

export const SCORE_THEME_PRESETS: Record<ScoreTheme, ScoreThemePreset> = {
  paper: { ink: "#29251f", page: "#f4ecd9" },
  night: { ink: "#e8edf2", page: "#171b22" },
};

export const DEFAULT_SCORE_MARKER_SETTINGS: ScoreMarkerSettings = { color: "theme", opacity: 9, restOpacity: 4 };

export const APP_THEME_STORAGE_KEY = "piano.app-theme";
export const SCORE_THEME_STORAGE_KEY = "piano.score-theme";
export const SCORE_MARKER_STORAGE_KEY = "piano.score-marker";

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

export function readScoreMarkerSettings(storage: Pick<Storage, "getItem"> | undefined): ScoreMarkerSettings {
  try {
    const parsed = JSON.parse(storage?.getItem(SCORE_MARKER_STORAGE_KEY) ?? "null") as Partial<ScoreMarkerSettings> | null;
    if (!parsed) return DEFAULT_SCORE_MARKER_SETTINGS;
    const color = parsed.color === "theme" || (typeof parsed.color === "string" && /^#[0-9a-f]{6}$/i.test(parsed.color)) ? parsed.color as ScoreMarkerColor : DEFAULT_SCORE_MARKER_SETTINGS.color;
    const opacity = typeof parsed.opacity === "number" && Number.isFinite(parsed.opacity) && parsed.opacity >= 0 && parsed.opacity <= 100 ? parsed.opacity : DEFAULT_SCORE_MARKER_SETTINGS.opacity;
    const restOpacity = typeof parsed.restOpacity === "number" && Number.isFinite(parsed.restOpacity) && parsed.restOpacity >= 0 && parsed.restOpacity <= 100 ? parsed.restOpacity : DEFAULT_SCORE_MARKER_SETTINGS.restOpacity;
    return { color, opacity, restOpacity };
  } catch {
    return DEFAULT_SCORE_MARKER_SETTINGS;
  }
}

export function resolvedScoreMarkerColor(settings: ScoreMarkerSettings, scoreTheme: ScoreTheme): string {
  return settings.color === "theme" ? (scoreTheme === "night" ? "#5eb3cb" : "#1d5f74") : settings.color;
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
