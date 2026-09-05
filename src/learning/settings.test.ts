import { describe, expect, it } from "vitest";
import { DEFAULT_LEARNING_SETTINGS, readLearningSettings, storeLearningSettings } from "./settings";

describe("learning settings", () => {
  it("defaults malformed and missing values to the gentle tempo build-up", () => {
    expect(readLearningSettings(undefined)).toEqual(DEFAULT_LEARNING_SETTINGS);
    expect(readLearningSettings({ getItem: () => JSON.stringify({ tempoBuildUp: "unknown" }) })).toEqual(DEFAULT_LEARNING_SETTINGS);
  });

  it("reads and stores a selected preset", () => {
    expect(readLearningSettings({ getItem: () => JSON.stringify({ version: 1, tempoBuildUp: "steady" }) }).tempoBuildUp).toBe("steady");
    let stored = "";
    storeLearningSettings({ setItem: (_key, value) => { stored = value; } }, { version: 1, tempoBuildUp: "at-tempo" });
    expect(JSON.parse(stored).tempoBuildUp).toBe("at-tempo");
  });
});
