import { useCallback, useState } from "react";
import { readLearningSettings, storeLearningSettings, type LearningSettings } from "./settings";

export function useLearningSettings() {
  const storage = typeof window === "undefined" ? undefined : window.localStorage;
  const [settings, setSettingsState] = useState(() => readLearningSettings(storage));
  const setSettings = useCallback((update: Partial<LearningSettings>) => setSettingsState((current) => {
    const next = { ...current, ...update };
    storeLearningSettings(storage, next);
    return next;
  }), [storage]);
  return { settings, setSettings };
}
