import { describe, expect, it } from "vitest";
import type { ScoreEvent } from "../music/scoreTypes";
import { activeExpectedNotes, activePlaybackEvent, createPlaybackPlan, millisecondsBetweenQuarters, missedPerformanceNotes, scorePerformanceAttempt, scoreQuarterAtElapsed, shouldShowPerformanceResults } from "./playback";

const events: ScoreEvent[] = [
  event("a", 0, 1, [60], 1),
  event("b", 2, 0.5, [62, 65], 1),
  event("c", 3, 1, [48], 2),
];

describe("playback timing", () => {
  it("integrates elapsed time across tempo changes", () => expect(millisecondsBetweenQuarters(0, 4, [{ quarter: 2, bpm: 60, source: "sound" }], 120)).toBe(3000));
  it("creates a hand-filtered selection plan", () => {
    const plan = createPlaybackPlan(events, [], 120, "right", { startIndex: 0, endIndex: 2 });
    expect(plan?.events.map((item) => item.eventIndex)).toEqual([0, 1]);
    expect(plan?.durationMs).toBe(1250);
  });
  it("keeps the cursor while clearing expected notes in a gap", () => {
    const plan = createPlaybackPlan(events, [], 120, "both")!;
    expect(activePlaybackEvent(plan, 700)?.eventIndex).toBe(0);
    expect(activeExpectedNotes(plan, 700)).toEqual([]);
    expect(activeExpectedNotes(plan, 1050)).toEqual([62, 65]);
    expect(scoreQuarterAtElapsed(plan, 1000, [], 120)).toBeCloseTo(2);
  });
});

describe("performance scoring", () => {
  const plan = createPlaybackPlan(events, [], 120, "both")!;
  it("marks matching pitches within tolerance correct", () => expect(scorePerformanceAttempt(62, 1100, 5000, 1, plan, [], 120, 250)).toMatchObject({ eventIndex: 1, expectedNote: 62, playedNote: 62, timingErrorMs: 100, result: "correct" }));
  it("marks an out-of-tolerance first hit red on the expected pitch", () => expect(scorePerformanceAttempt(62, 1200, 5000, 1, plan, [], 120, 100)).toMatchObject({ eventIndex: 1, expectedNote: 62, timingErrorMs: 200, result: "wrong" }));
  it("anchors unexpected pitches to the nearest expected pitch in the current event", () => expect(scorePerformanceAttempt(61, 1050, 5000, 1, plan, [], 120, 250)).toMatchObject({ eventIndex: 1, expectedNote: 62, playedNote: 61, result: "wrong" }));
  it("locks the first result and ignores repeated hits for that written note", () => {
    const first = scorePerformanceAttempt(62, 900, 5000, 1, plan, [], 120, 250)!;
    expect(scorePerformanceAttempt(62, 1100, 5100, 2, plan, [], 120, 250, [first])).toBeUndefined();
  });
  it("retains multiple wrong hits at their played pitch and score time", () => {
    const first = scorePerformanceAttempt(61, 1050, 5000, 1, plan, [], 120, 250)!;
    const second = scorePerformanceAttempt(61, 1150, 5100, 2, plan, [], 120, 250, [first])!;
    expect([first, second].map((result) => result.playedNote)).toEqual([61, 61]);
    expect(second.scoreQuarter).toBeGreaterThan(first.scoreQuarter);
    expect(new Set([first.slotId, second.slotId]).size).toBe(2);
  });
  it("does not count an out-of-tolerance mistake as completing the expected note", () => {
    const mistake = scorePerformanceAttempt(62, 1200, 5000, 1, plan, [], 120, 100)!;
    expect(missedPerformanceNotes(plan, [mistake]).some((item) => item.eventIndex === 1 && item.note === 62)).toBe(true);
  });
  it("ignores repeated valid hits but retains mistimed repeats in their own time region", () => {
    const repeatedPlan = createPlaybackPlan([event("e1", 0, 1, [64], 1), event("e2", 4, 1, [64], 1)], [], 120, "both")!;
    const first = scorePerformanceAttempt(64, 100, 5000, 1, repeatedPlan, [], 120, 250)!;
    expect(scorePerformanceAttempt(64, 200, 5100, 2, repeatedPlan, [], 120, 250, [first])).toBeUndefined();
    expect(scorePerformanceAttempt(64, 300, 5200, 3, repeatedPlan, [], 120, 250, [first])).toMatchObject({ eventIndex: 0, result: "wrong" });
    expect(scorePerformanceAttempt(64, 1200, 6200, 4, repeatedPlan, [], 120, 250, [first])).toMatchObject({ eventIndex: 1, result: "wrong" });
  });
  it("marks only notes with no pitch attempt as missed", () => {
    const first = scorePerformanceAttempt(60, 200, 5000, 1, plan, [], 120, 250)!;
    const second = scorePerformanceAttempt(62, 1100, 5000, 2, plan, [], 120, 250, [first])!;
    expect(missedPerformanceNotes(plan, [first, second]).map((item) => [item.eventIndex, item.note])).toEqual([[1, 65], [2, 48]]);
  });
});

describe("performance result visibility", () => {
  it("defers results while playing by default", () => {
    expect(shouldShowPerformanceResults("playing", false)).toBe(false);
    expect(shouldShowPerformanceResults("playing", true)).toBe(true);
    expect(shouldShowPerformanceResults("idle", false)).toBe(true);
    expect(shouldShowPerformanceResults("waiting-restart", false)).toBe(true);
  });
});

function event(id: string, startQuarter: number, durationQuarters: number, notes: number[], staffNumber: number): ScoreEvent {
  return { id, partId: "P1", measureNumber: 1, startQuarter, durationQuarters, midiNotes: notes, staffNumbers: [staffNumber], voiceNumbers: ["1"], sourceNoteIds: notes.map(String), noteDetails: notes.map((midiNote) => ({ midiNote, staffNumber, voiceNumber: "1", sourceNoteId: String(midiNote) })) };
}
