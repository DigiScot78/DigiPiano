import { describe, expect, it } from "vitest";
import { foundationRestResult } from "./foundationRests";

const notes = [{ midi: 60, beats: 1, onset: 0 }, { midi: 60, beats: 2, onset: 2000 }, { midi: 62, beats: 2, onset: 4000 }];
const rests = [{ onset: 1000, beats: 1 }, { onset: 6000, beats: 2 }];

describe("foundation rest feedback", () => {
  it("accepts complete notes and silence throughout both rests", () => {
    const result = foundationRestResult(notes, rests, [{ note: 60, at: 0, releasedAt: 1000 }, { note: 60, at: 2000, releasedAt: 4000 }, { note: 62, at: 4000, releasedAt: 6000 }]);
    expect(result.passed).toBe(true);
    expect(result.rests.map((rest) => rest.status)).toEqual(["quiet", "quiet"]);
  });
  it("marks the exact rest crossed by a held or newly played key", () => {
    const held = foundationRestResult(notes, rests, [{ note: 60, at: 0, releasedAt: 1600 }, { note: 60, at: 2000, releasedAt: 4000 }, { note: 62, at: 4000, releasedAt: 6000 }]);
    expect(held.rests.map((rest) => rest.status)).toEqual(["sound", "quiet"]);
    const played = foundationRestResult(notes, rests, [{ note: 60, at: 0, releasedAt: 1000 }, { note: 60, at: 2000, releasedAt: 4000 }, { note: 62, at: 4000, releasedAt: 6000 }, { note: 64, at: 6900, releasedAt: 7100 }]);
    expect(played.rests.map((rest) => rest.status)).toEqual(["quiet", "sound"]);
  });
});
