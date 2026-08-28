export interface WorkspaceLayoutSettings {
  sidebarOpen: boolean;
  sidebarWidth: number;
  panelOpenScoreMargin: number;
  panelDockedScoreMargin: number;
}

export const WORKSPACE_LAYOUT_SETTINGS_KEY = "piano.workspace-layout";
export const SIDEBAR_MIN_WIDTH = 240;
export const SIDEBAR_MAX_WIDTH = 640;
export const SCORE_MARGIN_MIN = 8;
export const SCORE_MARGIN_MAX = 300;
export const DEFAULT_WORKSPACE_LAYOUT_SETTINGS: WorkspaceLayoutSettings = {
  sidebarOpen: true,
  sidebarWidth: 320,
  panelOpenScoreMargin: 50,
  panelDockedScoreMargin: 50,
};

export function readWorkspaceLayoutSettings(storage: Pick<Storage, "getItem"> | undefined): WorkspaceLayoutSettings {
  let value: unknown;
  try { value = JSON.parse(storage?.getItem(WORKSPACE_LAYOUT_SETTINGS_KEY) ?? "null"); } catch { return DEFAULT_WORKSPACE_LAYOUT_SETTINGS; }
  if (!value || typeof value !== "object") return DEFAULT_WORKSPACE_LAYOUT_SETTINGS;
  const candidate = value as Partial<WorkspaceLayoutSettings>;
  const legacyMargin = integerInRange((candidate as Partial<WorkspaceLayoutSettings> & { scoreMargin?: number }).scoreMargin, SCORE_MARGIN_MIN, SCORE_MARGIN_MAX, DEFAULT_WORKSPACE_LAYOUT_SETTINGS.panelOpenScoreMargin);
  return {
    sidebarOpen: typeof candidate.sidebarOpen === "boolean" ? candidate.sidebarOpen : true,
    sidebarWidth: integerInRange(candidate.sidebarWidth, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH, DEFAULT_WORKSPACE_LAYOUT_SETTINGS.sidebarWidth),
    panelOpenScoreMargin: integerInRange(candidate.panelOpenScoreMargin, SCORE_MARGIN_MIN, SCORE_MARGIN_MAX, legacyMargin),
    panelDockedScoreMargin: integerInRange(candidate.panelDockedScoreMargin, SCORE_MARGIN_MIN, SCORE_MARGIN_MAX, legacyMargin),
  };
}

export function storeWorkspaceLayoutSettings(storage: Pick<Storage, "setItem"> | undefined, settings: WorkspaceLayoutSettings): void {
  try { storage?.setItem(WORKSPACE_LAYOUT_SETTINGS_KEY, JSON.stringify(settings)); } catch { /* Layout persistence is optional. */ }
}

export function isSidebarVisible(settings: WorkspaceLayoutSettings, hiddenForPlayback: boolean): boolean {
  return settings.sidebarOpen && !hiddenForPlayback;
}

export function scoreMarginForLayout(settings: WorkspaceLayoutSettings, sidebarVisible: boolean): number {
  return sidebarVisible ? settings.panelOpenScoreMargin : settings.panelDockedScoreMargin;
}

function integerInRange(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}
