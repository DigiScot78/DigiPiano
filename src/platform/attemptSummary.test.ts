import { describe, expect, it } from "vitest";
import type { CompletedPlaybackRun } from "../playback/playback";
import { buildAttemptSummary, localScoreVersionId } from "./attemptSummary";

const completedRun: CompletedPlaybackRun = {
  id: 7,
  plan: {
    startQuarter: 4,
    endQuarter: 6,
    durationMs: 2000,
    events: [{
      eventIndex: 3,
      onsetMs: 0,
      endMs: 1000,
      event: { id: "e1", partId: "P1", measureNumber: 2, startQuarter: 4, durationQuarters: 1, midiNotes: [60], staffNumbers: [1], voiceNumbers: ["1"], sourceNoteIds: ["n1"], noteDetails: [{ midiNote: 60, staffNumber: 1, voiceNumber: "1", sourceNoteId: "n1" }] },
    }],
  },
  results: [{ id: 1, slotId: "3:60", expectedNote: 60, playedNote: 60, playedAtMs: 20, scoreQuarter: 4, eventIndex: 3, timingErrorMs: 20, staffNumber: 1, result: "correct" }],
  activeDurationMs: 2050,
  idealDurationMs: 2000,
  playMode: "pause-each-note",
  handMode: "right",
  tempoPercent: 80,
  range: { startIndex: 3, endIndex: 3 },
};

describe("buildAttemptSummary", () => {
  it("builds a stable v1 persistence summary while retaining the UI performance shape", () => {
    const result = buildAttemptSummary({ completedRun, scoreVersionId: "score-v1", attemptId: "attempt-7", idempotencyKey: "session:attempt-7", startedAt: "2026-09-05T10:00:00.000Z", completedAt: "2026-09-05T10:00:02.050Z" });
    expect(result.summary).toMatchObject({ schemaVersion: 1, scoringVersion: 1, attemptId: "attempt-7", hand: "right", mode: "pause-at-each-note", tempoPercent: 80, score: 100, hits: 1, misses: 0 });
    expect(result.summary.scope.start).toMatchObject({ schemaVersion: 1, scoreVersionId: "score-v1", partId: "P1", measureNumber: 2, absoluteQuarter: 4, staffNumber: 1, voiceNumber: "1", sourceNoteId: "n1", cachedEventIndex: 3 });
    expect(result.performance).toMatchObject({ score: 100, playMode: "pause-each-note", handMode: "right", tempoPercent: 80, range: { startIndex: 3, endIndex: 3 } });
  });

  it("derives deterministic local identities from content rather than filenames", () => {
    expect(localScoreVersionId("<score>A</score>")).toBe(localScoreVersionId("<score>A</score>"));
    expect(localScoreVersionId("<score>A</score>")).not.toBe(localScoreVersionId("<score>B</score>"));
  });
});
