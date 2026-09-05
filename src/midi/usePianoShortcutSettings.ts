import { useCallback, useState } from "react";
import { DEFAULT_PIANO_SHORTCUT_SETTINGS, readPianoShortcutSettings, storePianoShortcutSettings, type PianoShortcutSettingsUpdate } from "./pianoShortcuts";

export function usePianoShortcutSettings() {
  const storage = typeof window === "undefined" ? undefined : window.localStorage;
  const [settings, setSettingsState] = useState(() => readPianoShortcutSettings(storage));
  const setSettings = useCallback((update: PianoShortcutSettingsUpdate) => setSettingsState((current) => {
    const next = { ...current, ...update, bindings: update.bindings ? { ...current.bindings, ...update.bindings } : current.bindings };
    storePianoShortcutSettings(storage, next);
    return next;
  }), [storage]);
  const reset = useCallback(() => { storePianoShortcutSettings(storage, DEFAULT_PIANO_SHORTCUT_SETTINGS); setSettingsState(DEFAULT_PIANO_SHORTCUT_SETTINGS); }, [storage]);
  return { settings, setSettings, reset };
}
