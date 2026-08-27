import { useCallback, useEffect, useState } from "react";
import {
  APP_THEME_STORAGE_KEY,
  readAppTheme,
  readScoreTheme,
  resolveAppTheme,
  SCORE_THEME_STORAGE_KEY,
  storeAppearance,
  type AppTheme,
  type ScoreTheme,
} from "./appearance";

export function useAppearanceSettings() {
  const storage = typeof window === "undefined" ? undefined : window.localStorage;
  const [appTheme, setAppThemeState] = useState<AppTheme>(() => readAppTheme(storage));
  const [scoreTheme, setScoreThemeState] = useState<ScoreTheme>(() => readScoreTheme(storage));
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

  return { appTheme, resolvedAppTheme, scoreTheme, setAppTheme, setScoreTheme };
}
