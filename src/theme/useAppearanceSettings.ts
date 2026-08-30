import { useCallback, useEffect, useState } from "react";
import {
  APP_THEME_STORAGE_KEY,
  DEFAULT_SCORE_MARKER_SETTINGS,
  readAppTheme,
  readScoreMarkerSettings,
  readScoreTheme,
  resolveAppTheme,
  SCORE_MARKER_STORAGE_KEY,
  SCORE_THEME_STORAGE_KEY,
  storeAppearance,
  type AppTheme,
  type ScoreMarkerSettings,
  type ScoreTheme,
} from "./appearance";

export function useAppearanceSettings() {
  const storage = typeof window === "undefined" ? undefined : window.localStorage;
  const [appTheme, setAppThemeState] = useState<AppTheme>(() => readAppTheme(storage));
  const [scoreTheme, setScoreThemeState] = useState<ScoreTheme>(() => readScoreTheme(storage));
  const [scoreMarkerSettings, setScoreMarkerSettingsState] = useState<ScoreMarkerSettings>(() => readScoreMarkerSettings(storage));
  const [systemDark, setSystemDark] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const resolvedAppTheme = resolveAppTheme(appTheme, systemDark);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    setSystemDark(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.appTheme = resolvedAppTheme;
    document.documentElement.dataset.scoreTheme = scoreTheme;
  }, [resolvedAppTheme, scoreTheme]);

  const setAppTheme = useCallback((theme: AppTheme) => {
    storeAppearance(storage, APP_THEME_STORAGE_KEY, theme);
    setAppThemeState(theme);
  }, [storage]);

  const setScoreTheme = useCallback((theme: ScoreTheme) => {
    storeAppearance(storage, SCORE_THEME_STORAGE_KEY, theme);
    setScoreThemeState(theme);
  }, [storage]);

  const setScoreMarkerSettings = useCallback((update: Partial<ScoreMarkerSettings>) => {
    setScoreMarkerSettingsState((current) => {
      const next = { ...current, ...update };
      try { storage?.setItem(SCORE_MARKER_STORAGE_KEY, JSON.stringify(next)); } catch { /* Appearance persistence is optional. */ }
      return next;
    });
  }, [storage]);

  const resetScoreMarkerSettings = useCallback(() => {
    try { storage?.setItem(SCORE_MARKER_STORAGE_KEY, JSON.stringify(DEFAULT_SCORE_MARKER_SETTINGS)); } catch { /* Appearance persistence is optional. */ }
    setScoreMarkerSettingsState(DEFAULT_SCORE_MARKER_SETTINGS);
  }, [storage]);

  return { appTheme, resolvedAppTheme, scoreTheme, scoreMarkerSettings, setAppTheme, setScoreTheme, setScoreMarkerSettings, resetScoreMarkerSettings };
}
