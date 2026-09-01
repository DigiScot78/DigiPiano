import { describe, expect, it } from "vitest";
import type { PerformanceResult, PlaybackPlan } from "./playback";
import { addPerformanceToHistory, calculatePerformanceScore, exercisePerformanceKey, paceGraceMs } from "./performanceScore";

const event = (eventIndex: number, notes: number[]) => ({ eventIndex, onsetMs: eventIndex * 500, endMs: eventIndex * 500 + 400, event: { id: `${eventIndex}`, partId: "P1", measureNumber: 1, startQuarter: eventIndex, durationQuarters: 1, midiNotes: notes, staffNumbers: [1], voiceNumbers: ["1"], sourceNoteIds: notes.map(String), noteDetails: notes.map((midiNote) => ({ midiNote, staffNumber: 1, voiceNumber: "1", sourceNoteId: String(midiNote) })) } });
const plan: PlaybackPlan = { startQuarter: 0, endQuarter: 2, durationMs: 1000, events: [event(0, [60, 64]), event(1, [62])] };
const result = (id: number, expectedNote: number, playedNote: number, outcome: "correct" | "wrong", eventIndex = 0, timingErrorMs = 0): PerformanceResult => ({ id, slotId: outcome === "correct" ? `${eventIndex}:${expectedNote}` : `mistake:${id}`, expectedNote, playedNote, playedAtMs: id, scoreQuarter: 0, eventIndex, timingErrorMs, result: outcome });

describe("performance scoring", () => {
  it("awards 100 for all expected slots without mistakes", () => expect(calculatePerformanceScore(plan, [result(1, 60, 60, "correct"), result(2, 64, 64, "correct"), result(3, 62, 62, "correct", 1)])).toMatchObject({ score: 100, totalNotes: 3, hits: 3, misses: 0, badNotes: 0, hitRate: 100 }));
  it("uses accuracy alone in tempo Play and separates pitch from timing mistakes", () => expect(calculatePerformanceScore(plan, [result(1, 60, 60, "correct", 0, -40), result(2, 64, 65, "wrong"), result(3, 62, 62, "wrong", 1, 400)])).toEqual({ score: 33, accuracyScore: 33, activeDurationMs: 1000, idealDurationMs: 1000, totalNotes: 3, hits: 1, misses: 2, badNotes: 2, wrongPitches: 1, mistimedNotes: 1, hitRate: 33.3, averageTimingErrorMs: 40 }));
  it("scores an unattended tempo Play run at zero", () => expect(calculatePerformanceScore(plan, [])).toMatchObject({ score: 0, accuracyScore: 0 }));
  it("weights accuracy at 80 percent and proportionally reduces pace beyond grace", () => expect(calculatePerformanceScore(plan, [result(1, 60, 60, "correct"), result(2, 64, 64, "correct"), result(3, 62, 62, "correct", 1)], 2000, "practice")).toMatchObject({ score: 95, accuracyScore: 100, paceScore: 75, activeDurationMs: 2000, idealDurationMs: 1000 }));
  it("uses the larger of 500ms or five percent as full-credit pace grace", () => {
    expect(paceGraceMs(4000)).toBe(500);
    expect(paceGraceMs(20_000)).toBe(1000);
    expect(calculatePerformanceScore(plan, [], 1500, "practice").paceScore).toBe(100);
    expect(calculatePerformanceScore(plan, [], 1501, "practice").paceScore).toBe(99);
  });
  it("deduplicates written slots and correct completions", () => expect(calculatePerformanceScore({ ...plan, events: [event(0, [60, 60])] }, [result(1, 60, 60, "correct"), result(2, 60, 60, "correct")])).toMatchObject({ totalNotes: 1, hits: 1, score: 100 }));
  it("tracks last, best, averages, and cumulative totals", () => {
    const first = { ...calculatePerformanceScore(plan, []), playMode: "play" as const, handMode: "both" as const, tempoPercent: 100 };
    const second = { ...calculatePerformanceScore(plan, [result(1, 60, 60, "correct")]), playMode: "play" as const, handMode: "both" as const, tempoPercent: 100 };
    const history = addPerformanceToHistory(addPerformanceToHistory(undefined, first), second);
    expect(history).toMatchObject({ attempts: 2, last: second, best: second, averageScore: 25, totalNotes: 6, hits: 1, misses: 5 });
  });
  it("keys history by score content, range, hand, and mode", () => {
    const base = exercisePerformanceKey("xml", "score.mxl", undefined, "both", "play");
    expect(exercisePerformanceKey("xml", "score.mxl", { startIndex: 1, endIndex: 2 }, "both", "play")).not.toBe(base);
    expect(exercisePerformanceKey("xml", "score.mxl", undefined, "right", "play")).not.toBe(base);
    expect(exercisePerformanceKey("xml", "score.mxl", undefined, "both", "practice")).not.toBe(base);
    expect(exercisePerformanceKey("xml", "score.mxl", undefined, "both", "play", 75)).not.toBe(base);
    expect(exercisePerformanceKey("other", "score.mxl", undefined, "both", "play")).not.toBe(base);
  });
});
