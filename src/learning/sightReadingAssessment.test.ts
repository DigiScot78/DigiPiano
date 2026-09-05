import { describe, expect, it } from "vitest";
import type { PerformanceResult, PlaybackPlan } from "../playback/playback";
import { calculateSightReadingAssessment } from "./sightReadingAssessment";

const event = (eventIndex: number, onsetMs: number, note: number) => ({ eventIndex, onsetMs, endMs: onsetMs + 400, event: { id: `${eventIndex}`, partId: "P1", measureNumber: 1, startQuarter: eventIndex, durationQuarters: 1, midiNotes: [note], staffNumbers: [1], voiceNumbers: ["1"], sourceNoteIds: [`${note}`], noteDetails: [{ midiNote: note, staffNumber: 1, voiceNumber: "1", sourceNoteId: `${note}` }] } });
const plan: PlaybackPlan = { startQuarter: 0, endQuarter: 4, durationMs: 2000, events: [event(0, 0, 60), event(1, 500, 62), event(2, 1000, 64), event(3, 1500, 65)] };
const result = (id: number, eventIndex: number, expectedNote: number, playedNote = expectedNote): PerformanceResult => ({ id, slotId: playedNote === expectedNote ? `${eventIndex}:${expectedNote}` : `mistake:${id}`, expectedNote, playedNote, playedAtMs: id, scoreQuarter: eventIndex, eventIndex, timingErrorMs: 0, result: playedNote === expectedNote ? "correct" : "wrong" });

describe("sight-reading assessment", () => {
  it("rewards accurate coverage across every reading moment", () => {
    expect(calculateSightReadingAssessment(plan, [result(1, 0, 60), result(2, 1, 62), result(3, 2, 64), result(4, 3, 65)])).toEqual({ score: 100, noteAccuracy: 100, continuity: 100, notesRead: 4, totalNotes: 4, momentsPlayed: 4, totalMoments: 4, wrongNotes: 0, missedNotes: 0 });
  });

  it("reports forward continuity separately from note accuracy", () => {
    expect(calculateSightReadingAssessment(plan, [result(1, 0, 60), result(2, 1, 62, 61), result(3, 2, 64, 63), result(4, 3, 65)])).toMatchObject({ score: 63, noteAccuracy: 50, continuity: 100, notesRead: 2, momentsPlayed: 4 });
  });

  it("reduces continuity when reading moments are skipped", () => {
    expect(calculateSightReadingAssessment(plan, [result(1, 0, 60), result(2, 3, 65)])).toMatchObject({ continuity: 50, momentsPlayed: 2, totalMoments: 4 });
  });
});
