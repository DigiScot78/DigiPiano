import { useCallback, useState } from "react";
import { readPlaySettings, storePlaySettings, type PlaySettings } from "./settings";

export function usePlaySettings() {
  const storage = typeof window === "undefined" ? undefined : window.localStorage;
  const [settings, setSettingsState] = useState(() => readPlaySettings(storage));
  const setSettings = useCallback((update: Partial<PlaySettings>) => setSettingsState((current) => {
    const next = { ...current, ...update };
    storePlaySettings(storage, next);
    return next;
  }), [storage]);
  return { settings, setSettings };
}
