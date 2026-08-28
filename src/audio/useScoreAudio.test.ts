import { describe, expect, it } from "vitest";
import type { PlaybackPlan } from "../playback/playback";
import { ARPEGGIO_NOTE_SPREAD_MS, audioNotesForPlan, audioNotesInWindow } from "./useScoreAudio";

const plan: PlaybackPlan = {
  startQuarter: 0, endQuarter: 2, durationMs: 1000,
  events: [
    { eventIndex: 0, onsetMs: 0, endMs: 500, event: { id: "a", partId: "P1", measureNumber: 1, startQuarter: 0, durationQuarters: 1, midiNotes: [60], staffNumbers: [1], voiceNumbers: ["1"], sourceNoteIds: ["a"], noteDetails: [{ midiNote: 60, staffNumber: 1, voiceNumber: "1", sourceNoteId: "a" }] } },
    { eventIndex: 1, onsetMs: 0, endMs: 750, event: { id: "b", partId: "P1", measureNumber: 1, startQuarter: 0, durationQuarters: 1.5, midiNotes: [60, 64], staffNumbers: [1], voiceNumbers: ["2"], sourceNoteIds: ["b"], noteDetails: [{ midiNote: 60, staffNumber: 1, voiceNumber: "2", sourceNoteId: "b" }, { midiNote: 64, staffNumber: 1, voiceNumber: "2", sourceNoteId: "c" }] } },
    { eventIndex: 2, onsetMs: 500, endMs: 1000, event: { id: "c", partId: "P1", measureNumber: 1, startQuarter: 1, durationQuarters: 1, midiNotes: [67], staffNumbers: [1], voiceNumbers: ["1"], sourceNoteIds: ["c"], noteDetails: [{ midiNote: 67, staffNumber: 1, voiceNumber: "1", sourceNoteId: "c" }] } },
  ],
};

describe("score audio scheduling", () => {
  it("deduplicates unison pitches and preserves their longest duration", () => {
    expect(audioNotesForPlan(plan).map((note) => [note.midiNote, note.onsetMs, note.durationMs])).toEqual([[60, 0, 750], [64, 0, 750], [67, 500, 500]]);
  });

  it("uses lookahead without crossing a pending note gate", () => {
    const notes = audioNotesForPlan(plan);
    expect(audioNotesInWindow(notes, -100, 0, new Set()).map((note) => note.midiNote)).toEqual([]);
    expect(audioNotesInWindow(notes, 0, 500, new Set()).map((note) => note.midiNote)).toEqual([60, 64]);
    expect(audioNotesInWindow(notes, 450, undefined, new Set()).map((note) => note.midiNote)).toEqual([67]);
  });

  it("keeps the authoritative pending gate closed even if transport time reaches it", () => {
    const notes = audioNotesForPlan(plan);
    expect(audioNotesInWindow(notes, 500.75, 500, new Set()).map((note) => note.midiNote)).toEqual([]);
  });

  it("does not schedule notes before a resume or seek origin", () => {
    const notes = audioNotesForPlan(plan);
    expect(audioNotesInWindow(notes, 0, undefined, new Set(), 600, 500).map((note) => note.midiNote)).toEqual([67]);
  });

  it("rolls marked arpeggio notes in written direction", () => {
    const rolled = structuredClone(plan);
    rolled.events[1].event.noteDetails = rolled.events[1].event.noteDetails.map((detail) => ({ ...detail, arpeggio: { direction: "up" as const } }));
    expect(audioNotesForPlan(rolled).filter((note) => note.midiNote === 60 || note.midiNote === 64).map((note) => [note.midiNote, note.onsetMs])).toEqual([[60, 0], [64, ARPEGGIO_NOTE_SPREAD_MS]]);
  });
});
