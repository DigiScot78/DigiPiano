import { describe, expect, it } from "vitest";
import { readAppTheme, readScoreMarkerSettings, readScoreTheme, resolvedScoreMarkerColor, resolveAppTheme, SCORE_MARKER_STORAGE_KEY } from "./appearance";

describe("appearance settings", () => {
  it("uses system app theme and paper score defaults", () => {
    const storage = { getItem: () => null };
    expect(readAppTheme(storage)).toBe("system");
    expect(readScoreTheme(storage)).toBe("paper");
  });

  it("ignores invalid persisted themes", () => {
    const storage = { getItem: () => "invalid" };
    expect(readAppTheme(storage)).toBe("system");
    expect(readScoreTheme(storage)).toBe("paper");
  });

  it("resolves system theme without changing explicit choices", () => {
    expect(resolveAppTheme("system", true)).toBe("dark");
    expect(resolveAppTheme("system", false)).toBe("light");
    expect(resolveAppTheme("light", true)).toBe("light");
    expect(resolveAppTheme("dark", false)).toBe("dark");
  });

  it("reads, validates, and resolves marker appearance", () => {
    const storage = { getItem: (key: string) => key === SCORE_MARKER_STORAGE_KEY ? JSON.stringify({ color: "#a1b2c3", opacity: 37, restOpacity: 12 }) : null };
    expect(readScoreMarkerSettings(storage)).toEqual({ color: "#a1b2c3", opacity: 37, restOpacity: 12 });
    expect(readScoreMarkerSettings({ getItem: () => JSON.stringify({ color: "red", opacity: 101 }) })).toEqual({ color: "theme", opacity: 9, restOpacity: 4 });
    expect(resolvedScoreMarkerColor({ color: "theme", opacity: 9, restOpacity: 4 }, "night")).toBe("#5eb3cb");
  });
});
