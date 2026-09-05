import { useCallback, useState } from "react";
import { readAudioSettings, storeAudioSettings, type AudioSettings } from "./settings";

export function useAudioSettings() {
  const storage = typeof window === "undefined" ? undefined : window.localStorage;
  const [settings, setSettingsState] = useState(() => readAudioSettings(storage));
  const setSettings = useCallback((update: Partial<AudioSettings>) => setSettingsState((current) => {
    const next = { ...current, ...update };
    storeAudioSettings(storage, next);
    return next;
  }), [storage]);
  return { settings, setSettings };
}
