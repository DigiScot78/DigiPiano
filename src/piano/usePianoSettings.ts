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
  const resetColors = useCallback(() => setSettings({
    expectedColor: DEFAULT_PIANO_COLORS.expected,
    correctColor: DEFAULT_PIANO_COLORS.correct,
    wrongColor: DEFAULT_PIANO_COLORS.wrong,
    seeNoteColor: DEFAULT_PIANO_COLORS.seeNote,
    playRightColor: DEFAULT_PIANO_COLORS.playRight,
    playLeftColor: DEFAULT_PIANO_COLORS.playLeft,
    synthesiaRightColor: DEFAULT_PIANO_COLORS.synthesiaRight,
    synthesiaLeftColor: DEFAULT_PIANO_COLORS.synthesiaLeft,
  }), [setSettings]);
  return { settings, setSettings, resetColors };
}
