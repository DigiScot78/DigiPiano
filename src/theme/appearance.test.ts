import { describe, expect, it } from "vitest";
import { readAppTheme, readScoreTheme, resolveAppTheme } from "./appearance";

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
});
