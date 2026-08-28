import { describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE_LAYOUT_SETTINGS, isSidebarVisible, readWorkspaceLayoutSettings, scoreMarginForLayout, WORKSPACE_LAYOUT_SETTINGS_KEY } from "./workspace";

describe("workspace layout settings", () => {
  it("uses defaults without storage", () => expect(readWorkspaceLayoutSettings(undefined)).toEqual(DEFAULT_WORKSPACE_LAYOUT_SETTINGS));
  it("reads valid persisted settings", () => expect(readWorkspaceLayoutSettings({ getItem: (key) => key === WORKSPACE_LAYOUT_SETTINGS_KEY ? JSON.stringify({ sidebarOpen: false, sidebarWidth: 480, panelOpenScoreMargin: 80, panelDockedScoreMargin: 140 }) : null })).toEqual({ sidebarOpen: false, sidebarWidth: 480, panelOpenScoreMargin: 80, panelDockedScoreMargin: 140 }));
  it("migrates the legacy margin into both layouts", () => expect(readWorkspaceLayoutSettings({ getItem: () => JSON.stringify({ sidebarOpen: true, sidebarWidth: 320, scoreMargin: 120 }) })).toEqual({ sidebarOpen: true, sidebarWidth: 320, panelOpenScoreMargin: 120, panelDockedScoreMargin: 120 }));
  it("falls back for invalid values", () => expect(readWorkspaceLayoutSettings({ getItem: () => JSON.stringify({ sidebarOpen: "yes", sidebarWidth: 900, scoreMargin: 0 }) })).toEqual(DEFAULT_WORKSPACE_LAYOUT_SETTINGS));
  it("keeps playback hiding separate from the saved panel preference", () => {
    expect(isSidebarVisible(DEFAULT_WORKSPACE_LAYOUT_SETTINGS, true)).toBe(false);
    expect(isSidebarVisible({ ...DEFAULT_WORKSPACE_LAYOUT_SETTINGS, sidebarOpen: false }, false)).toBe(false);
  });
  it("selects the margin for the effective panel layout", () => {
    const settings = { ...DEFAULT_WORKSPACE_LAYOUT_SETTINGS, panelOpenScoreMargin: 40, panelDockedScoreMargin: 160 };
    expect(scoreMarginForLayout(settings, true)).toBe(40);
    expect(scoreMarginForLayout(settings, false)).toBe(160);
  });
});
