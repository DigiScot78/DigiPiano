import { describe, expect, it } from "vitest";
import { diagnoseGuidedAttempts, guidedDiagnosisRange, type GuidedAttemptEvidence } from "./guidedDiagnosis";
import type { ScoreEvent } from "../music/scoreTypes";

const attempt = (measures: GuidedAttemptEvidence["measures"]): GuidedAttemptEvidence => ({ sectionId: "section-1", resetVersion: 0, step: "tempo", handMode: "both", tempoPercent: 100, measures });
const measure = (measureNumber: number, values: Partial<GuidedAttemptEvidence["measures"][number]> = {}): GuidedAttemptEvidence["measures"][number] => ({ measureNumber, expectedNotes: 8, correctNotes: 8, missedNotes: 0, wrongNotes: 0, mistimedNotes: 0, rightIssues: 0, leftIssues: 0, timingErrorsMs: [], ...values });

describe("guided diagnosis", () => {
  it("selects the measure with the strongest concrete error evidence", () => {
    const diagnosis = diagnoseGuidedAttempts([attempt([measure(3, { wrongNotes: 2, rightIssues: 2 }), measure(4, { missedNotes: 2, leftIssues: 2 })])]);
    expect(diagnosis).toMatchObject({ measureNumber: 4, hand: "left", missedNotes: 2 });
  });

  it("combines attempts and only names a clearly dominant hand", () => {
    const diagnosis = diagnoseGuidedAttempts([
      attempt([measure(5, { wrongNotes: 2, rightIssues: 2 })]),
      attempt([measure(5, { missedNotes: 1, leftIssues: 1 })]),
    ]);
    expect(diagnosis).toMatchObject({ measureNumber: 5, attempts: 2, hand: "right", wrongNotes: 2, missedNotes: 1 });
  });

  it("does not invent a concern for error-free evidence", () => {
    expect(diagnoseGuidedAttempts([attempt([measure(1)])])).toBeUndefined();
  });

  it("scopes a detour to playable events in the diagnosed measure and lesson", () => {
    const events = [1, 2, 2, 3].map((measureNumber, index) => ({ id: String(index), partId: "P1", measureNumber, startQuarter: index, durationQuarters: 1, midiNotes: [60 + index], staffNumbers: [1], voiceNumbers: ["1"], sourceNoteIds: [String(index)], noteDetails: [{ midiNote: 60 + index, staffNumber: 1, voiceNumber: "1", sourceNoteId: String(index) }] })) satisfies ScoreEvent[];
    const section = { id: "s", startIndex: 1, endIndex: 3, startMeasure: 2, endMeasure: 3, status: "complete", attempts: 1, resetVersion: 0, tempoPercent: 100, targetTempoPercent: 100, qualifyingTargetRuns: 2 } as const;
    expect(guidedDiagnosisRange(events, section, 2)).toEqual({ startIndex: 1, endIndex: 2 });
  });
});
