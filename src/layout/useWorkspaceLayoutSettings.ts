import { useCallback, useState } from "react";
import { readWorkspaceLayoutSettings, storeWorkspaceLayoutSettings, type WorkspaceLayoutSettings } from "./workspace";

export function useWorkspaceLayoutSettings() {
  const storage = typeof window === "undefined" ? undefined : window.localStorage;
  const [settings, setSettingsState] = useState(() => readWorkspaceLayoutSettings(storage));
  const setSettings = useCallback((update: Partial<WorkspaceLayoutSettings> | ((current: WorkspaceLayoutSettings) => WorkspaceLayoutSettings)) => {
    setSettingsState((current) => {
      const next = typeof update === "function" ? update(current) : { ...current, ...update };
      storeWorkspaceLayoutSettings(storage, next);
      return next;
    });
  }, [storage]);
  return { settings, setSettings };
}
