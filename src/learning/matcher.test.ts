import { describe, expect, it } from "vitest";
import {
  advanceWhenSatisfied,
  compareHeldNotesToEvent,
  filterEventForHand,
  initialLearningState,
  normalizeSelectionRange,
} from "./matcher";
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
  sourceNoteIds: ["single-60"],
  noteDetails: [{ midiNote: 60, staffNumber: 1, voiceNumber: "1", sourceNoteId: "single-60" }],
};

const chord: ScoreEvent = {
  ...single,
  id: "chord",
  midiNotes: [60, 64, 67],
  sourceNoteIds: ["chord-60", "chord-64", "chord-67"],
  noteDetails: [
    { midiNote: 60, staffNumber: 1, voiceNumber: "1", sourceNoteId: "chord-60" },
    { midiNote: 64, staffNumber: 1, voiceNumber: "1", sourceNoteId: "chord-64" },
    { midiNote: 67, staffNumber: 1, voiceNumber: "1", sourceNoteId: "chord-67" },
  ],
};

const twoHandEvent: ScoreEvent = {
  ...single,
  id: "two-hands",
  midiNotes: [48, 60, 64],
  staffNumbers: [1, 2],
  voiceNumbers: ["1", "2"],
  sourceNoteIds: ["bass", "treble-1", "treble-2"],
  noteDetails: [
    { midiNote: 48, staffNumber: 2, voiceNumber: "2", sourceNoteId: "bass" },
    { midiNote: 60, staffNumber: 1, voiceNumber: "1", sourceNoteId: "treble-1" },
    { midiNote: 64, staffNumber: 1, voiceNumber: "1", sourceNoteId: "treble-2" },
  ],
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

  it("filters expected notes by staff-based hand mode", () => {
    expect(filterEventForHand(twoHandEvent, "right")?.midiNotes).toEqual([60, 64]);
    expect(filterEventForHand(twoHandEvent, "left")?.midiNotes).toEqual([48]);
    expect(compareHeldNotesToEvent([60, 64], twoHandEvent, "right")).toMatchObject({ satisfied: true, extraNotes: [] });
    expect(compareHeldNotesToEvent([60, 64], twoHandEvent, "left")).toMatchObject({ satisfied: false, extraNotes: [60, 64] });
  });

  it("advances only when the current event is satisfied", () => {
    const events = [single, chord];
    const waiting = advanceWhenSatisfied(initialLearningState(), events, [61]);
    expect(waiting.currentIndex).toBe(0);

    const advanced = advanceWhenSatisfied(initialLearningState(), events, [60]);
    expect(advanced.currentIndex).toBe(1);
    expect(advanced.completedEventIds).toEqual(["single"]);
  });

  it("normalizes backward and out-of-range selections", () => {
    expect(normalizeSelectionRange(5, 2, 4)).toEqual({ startIndex: 2, endIndex: 3 });
  });

  it("stops at the end of a selected range in once mode", () => {
    const events = [single, chord];
    const state = advanceWhenSatisfied(initialLearningState(1), events, [60, 64, 67], {
      range: { startIndex: 1, endIndex: 1 },
      runMode: "once",
    });

    expect(state.currentIndex).toBe(1);
    expect(state.isComplete).toBe(true);
  });

  it("loops back to the selected range start in loop mode", () => {
    const events = [single, chord];
    const state = advanceWhenSatisfied(initialLearningState(1), events, [60, 64, 67], {
      range: { startIndex: 0, endIndex: 1 },
      runMode: "loop",
    });

    expect(state.currentIndex).toBe(0);
    expect(state.isComplete).toBe(false);
  });
});
