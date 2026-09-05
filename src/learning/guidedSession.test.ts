import { describe, expect, it } from "vitest";
import type { ScoreEvent } from "../music/scoreTypes";
import type { GuidedLessonSection } from "./guidedPractice";
import { guidedStepsForSection } from "./guidedSession";

const section: GuidedLessonSection = { id: "lesson-1", startIndex: 0, endIndex: 0, startMeasure: 1, endMeasure: 1, status: "not-started", attempts: 0, resetVersion: 0, tempoPercent: 60, targetTempoPercent: 100, qualifyingTargetRuns: 0 };

function event(staves: number[]): ScoreEvent {
  return { id: "event", partId: "P1", measureNumber: 1, startQuarter: 0, durationQuarters: 1, midiNotes: staves.map((staff) => 59 + staff), staffNumbers: staves, voiceNumbers: ["1"], sourceNoteIds: staves.map(String), noteDetails: staves.map((staff) => ({ midiNote: 59 + staff, staffNumber: staff, voiceNumber: "1", sourceNoteId: String(staff) })) };
}

describe("guided session steps", () => {
  it("omits left-hand and both-hand stages for right-hand-only material", () => {
    expect(guidedStepsForSection([event([1])], section)).toEqual(["listen", "right", "tempo"]);
  });

  it("omits right-hand and both-hand stages for left-hand-only material", () => {
    expect(guidedStepsForSection([event([2])], section)).toEqual(["listen", "left", "tempo"]);
  });

  it("keeps all stages when both hands occur in the lesson", () => {
    expect(guidedStepsForSection([event([1, 2])], section)).toEqual(["listen", "right", "left", "both", "tempo"]);
  });
});
