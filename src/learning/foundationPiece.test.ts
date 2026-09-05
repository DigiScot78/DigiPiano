import { describe, expect, it } from "vitest";
import { foundationPieceResult } from "./foundationPiece";

const events = [{ midiNotes: [60], beats: 1, onset: 0 }, { midiNotes: [48, 60], beats: 2, onset: 1000 }];
const rests = [{ onset: 3000, beats: 2 }];
describe("foundation complete-piece feedback", () => {
  it("assesses a chord as one written event and the rest after it", () => {
    const result = foundationPieceResult(events, rests, [{ note: 60, at: 0, releasedAt: 1000 }, { note: 48, at: 1000, releasedAt: 3000 }, { note: 60, at: 1060, releasedAt: 3020 }]);
    expect(result.passed).toBe(true); expect(result.notes.map((note) => note.status)).toEqual(["correct", "correct"]); expect(result.rests[0].status).toBe("quiet");
  });
  it("identifies an incomplete chord and sound during the rest", () => {
    const result = foundationPieceResult(events, rests, [{ note: 60, at: 0, releasedAt: 1000 }, { note: 48, at: 1000, releasedAt: 3000 }, { note: 64, at: 3800, releasedAt: 4100 }]);
    expect(result.notes[1].status).toBe("missed"); expect(result.rests[0].status).toBe("sound"); expect(result.passed).toBe(false);
  });
});
