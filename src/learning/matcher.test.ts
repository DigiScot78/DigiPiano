import { describe, expect, it } from "vitest";
import { advanceWhenSatisfied, compareHeldNotesToEvent, initialLearningState } from "./matcher";
import type { ScoreEvent } from "../music/scoreTypes";

const single: ScoreEvent = {
  id: "single",
  partId: "P1",
  measureNumber: 1,
  startQuarter: 0,
  durationQuarters: 1,
  midiNotes: [60],
  staffNumbers: [1],
  voiceNumbers: ["1"],
  sourceNoteIds: [],
};

const chord: ScoreEvent = {
  ...single,
  id: "chord",
  midiNotes: [60, 64, 67],
};

describe("score event matching", () => {
  it("matches a single expected note", () => {
    expect(compareHeldNotesToEvent([60], single)).toEqual({
      satisfied: true,
      missingNotes: [],
      extraNotes: [],
    });
  });

  it("does not match a partial chord", () => {
    expect(compareHeldNotesToEvent([60, 64], chord)).toMatchObject({
      satisfied: false,
      missingNotes: [67],
    });
  });

  it("allows extra notes while reporting them", () => {
    expect(compareHeldNotesToEvent([60, 64, 67, 70], chord)).toEqual({
      satisfied: true,
      missingNotes: [],
      extraNotes: [70],
    });
  });

  it("advances only when the current event is satisfied", () => {
    const events = [single, chord];
    const waiting = advanceWhenSatisfied(initialLearningState(), events, [61]);
    expect(waiting.currentIndex).toBe(0);

    const advanced = advanceWhenSatisfied(initialLearningState(), events, [60]);
    expect(advanced.currentIndex).toBe(1);
    expect(advanced.completedEventIds).toEqual(["single"]);
  });
});
