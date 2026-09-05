import { describe, expect, it } from "vitest";
import { createHeldNoteState } from "../midi/heldNotes";
import { decodeMidiMessage } from "../midi/messages";
import { captureMidiMessage } from "./useMidiInput";

describe("MIDI event capture", () => {
  it("retains every rapid chord note with its own held-state snapshot", () => {
    let heldState = createHeldNoteState();
    const events = [62, 69, 74, 76, 78].map((note, index) => {
      const captured = captureMidiMessage(heldState, decodeMidiMessage([0x90, note, 100]), 1000 + index, index + 1);
      heldState = captured.heldState;
      return captured.captured;
    });
    expect(events.map((event) => event.message.noteNumber)).toEqual([62, 69, 74, 76, 78]);
    expect(events.map((event) => event.heldNotesAfter)).toEqual([
      [62],
      [62, 69],
      [62, 69, 74],
      [62, 69, 74, 76],
      [62, 69, 74, 76, 78],
    ]);
  });
});
