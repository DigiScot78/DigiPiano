import { useCallback, useState } from "react";
import { DEFAULT_PIANO_COLORS, readPianoSettings, storePianoSettings, type PianoSettings } from "./piano";

export function usePianoSettings() {
  const storage = typeof window === "undefined" ? undefined : window.localStorage;
  const [settings, setSettingsState] = useState(() => readPianoSettings(storage));
  const setSettings = useCallback((update: Partial<PianoSettings> | ((current: PianoSettings) => PianoSettings)) => {
    setSettingsState((current) => {
      const next = typeof update === "function" ? update(current) : { ...current, ...update };
      storePianoSettings(storage, next);
      return next;
    });
  }, [storage]);
  const resetColors = useCallback(() => setSettings({ expectedColor: DEFAULT_PIANO_COLORS.expected, correctColor: DEFAULT_PIANO_COLORS.correct, wrongColor: DEFAULT_PIANO_COLORS.wrong }), [setSettings]);
  return { settings, setSettings, resetColors };
}
