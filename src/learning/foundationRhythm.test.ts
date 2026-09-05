import { describe, expect, it } from "vitest";
import { rhythmResult, timedFoundationResult } from "./foundationRhythm";

describe("foundation rhythm teaching feedback", () => {
  it("accepts relaxed timing and a clear release for each half note", () => {
    expect(rhythmResult("halves", [{ note: 60, at: 100, releasedAt: 1900 }, { note: 60, at: 2080, releasedAt: 4100 }]).passed).toBe(true);
  });
  it("does not count correct pitches alone as a successful rhythm", () => {
    const result = rhythmResult("halves", [{ note: 60, at: 0, releasedAt: 300 }, { note: 60, at: 2000, releasedAt: 2400 }]);
    expect(result.issue).toContain("Released early");
    expect(result.notes.map((note) => note.status)).toEqual(["early", "early"]);
  });
  it("requires the last release and notices missed attacks or extra pitches", () => {
    expect(rhythmResult("halves", [{ note: 60, at: 0, releasedAt: 2000 }, { note: 60, at: 2000 }]).issue).toContain("Held too long");
    expect(rhythmResult("halves", [{ note: 60, at: 0, releasedAt: 4000 }]).passed).toBe(false);
    expect(rhythmResult("halves", [{ note: 60, at: 0, releasedAt: 2000 }, { note: 61, at: 1000, releasedAt: 1200 }, { note: 60, at: 2000, releasedAt: 4000 }]).issue).toContain("one key press");
  });
  it("reports the result against each written note", () => {
    const result = rhythmResult("quarters", [
      { note: 60, at: 0, releasedAt: 1000 },
      { note: 60, at: 1000, releasedAt: 1500 },
      { note: 60, at: 2000, releasedAt: 3400 },
    ]);
    expect(result.notes.map((note) => note.status)).toEqual(["correct", "early", "late", "missed"]);
  });
  it("matches both pitch and duration in a changing-note phrase", () => {
    const expected = [{ midi: 60, beats: 1, onset: 0 }, { midi: 62, beats: 1, onset: 1000 }, { midi: 64, beats: 2, onset: 2000 }];
    const result = timedFoundationResult(expected, [
      { note: 60, at: 0, releasedAt: 1000 },
      { note: 61, at: 1000, releasedAt: 2000 },
      { note: 64, at: 2000, releasedAt: 4000 },
    ]);
    expect(result.notes.map((note) => note.status)).toEqual(["correct", "missed", "correct"]);
    expect(result.passed).toBe(false);
  });
});
