import { describe, expect, it } from "vitest";
import {
  advanceWhenSatisfied,
  compareHeldNotesToEvent,
  feedbackMarkersForHeldNotes,
  filterEventForHand,
  firstPlayableIndex,
  initialLearningState,
  isEventPlayableForHand,
  normalizeSelectionRange,
  resolvePracticeIndex,
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


const leftBb: ScoreEvent = {
  ...single,
  id: "left-bb",
  midiNotes: [58],
  staffNumbers: [2],
  sourceNoteIds: ["left-bb"],
  noteDetails: [{ midiNote: 58, staffNumber: 2, voiceNumber: "2", sourceNoteId: "left-bb" }],
};

const rightGSharp: ScoreEvent = {
  ...single,
  id: "right-g-sharp",
  midiNotes: [68],
  staffNumbers: [1],
  sourceNoteIds: ["right-g-sharp"],
  noteDetails: [{ midiNote: 68, staffNumber: 1, voiceNumber: "1", sourceNoteId: "right-g-sharp" }],
};

const leftDF: ScoreEvent = {
  ...single,
  id: "left-d-f",
  midiNotes: [62, 65],
  staffNumbers: [2],
  sourceNoteIds: ["left-d", "left-f"],
  noteDetails: [
    { midiNote: 62, staffNumber: 2, voiceNumber: "2", sourceNoteId: "left-d" },
    { midiNote: 65, staffNumber: 2, voiceNumber: "2", sourceNoteId: "left-f" },
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


  it("classifies correct and wrong held-note feedback", () => {
    expect(feedbackMarkersForHeldNotes([60, 61, 64], chord)).toEqual([
      { note: 60, kind: "correct" },
      { note: 61, kind: "wrong" },
      { note: 64, kind: "correct" },
    ]);
  });

  it("filters carried completed notes out of feedback only", () => {
    expect(feedbackMarkersForHeldNotes([60, 61, 64], chord, "both", [60, 64])).toEqual([
      { note: 61, kind: "wrong" },
    ]);
    expect(compareHeldNotesToEvent([60, 64, 67], chord)).toMatchObject({ satisfied: true });
  });

  it("resumes normal feedback once an ignored note is no longer supplied", () => {
    expect(feedbackMarkersForHeldNotes([61], single, "both", [60])).toEqual([
      { note: 61, kind: "wrong" },
    ]);
    expect(feedbackMarkersForHeldNotes([60], single, "both", [])).toEqual([
      { note: 60, kind: "correct" },
    ]);
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
  it("skips right-hand-only events during left-hand progression", () => {
    const events = [leftBb, rightGSharp, leftDF];
    const state = advanceWhenSatisfied(initialLearningState(0), events, [58], { handMode: "left" });

    expect(state.currentIndex).toBe(2);
    expect(state.completedEventIds).toEqual(["left-bb"]);
    expect(compareHeldNotesToEvent([62, 65], events[state.currentIndex], "left")).toMatchObject({ satisfied: true });
  });

  it("resolves left-hand practice away from a right-hand-only event", () => {
    const events = [leftBb, rightGSharp, leftDF];

    expect(isEventPlayableForHand(rightGSharp, "left")).toBe(false);
    expect(resolvePracticeIndex(1, events, "left")).toBe(2);
    expect(firstPlayableIndex(events, "left", { startIndex: 1, endIndex: 2 })).toBe(2);
  });

  it("keeps both-hands progression on the full event sequence", () => {
    const events = [leftBb, rightGSharp, leftDF];
    const state = advanceWhenSatisfied(initialLearningState(0), events, [58], { handMode: "both" });

    expect(state.currentIndex).toBe(1);
  });

  it("does not advance when a selected range has no playable notes for the hand", () => {
    const events = [leftBb, rightGSharp, leftDF];
    const state = advanceWhenSatisfied(initialLearningState(1), events, [68], {
      handMode: "left",
      range: { startIndex: 1, endIndex: 1 },
    });

    expect(state.currentIndex).toBe(1);
    expect(state.isComplete).toBe(false);
    expect(state.lastComparison).toMatchObject({ satisfied: false, missingNotes: [], extraNotes: [68] });
  });
});
