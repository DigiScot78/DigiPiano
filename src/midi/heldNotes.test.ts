import { describe, expect, it } from "vitest";
import { createHeldNoteState, applyMidiToHeldNotes } from "./heldNotes";
import { decodeMidiMessage } from "./messages";

describe("held note state", () => {
  it("tracks held notes and velocity-zero note-off", () => {
    let state = createHeldNoteState();
    state = applyMidiToHeldNotes(state, decodeMidiMessage([0x90, 60, 90]));
    state = applyMidiToHeldNotes(state, decodeMidiMessage([0x90, 64, 90]));
    expect(Array.from(state.heldNotes).sort()).toEqual([60, 64]);

    state = applyMidiToHeldNotes(state, decodeMidiMessage([0x90, 60, 0]));
    expect(Array.from(state.heldNotes)).toEqual([64]);
  });

  it("tracks sustain pedal state", () => {
    let state = createHeldNoteState();
    state = applyMidiToHeldNotes(state, decodeMidiMessage([0xb0, 64, 127]));
    expect(state.sustainOn).toBe(true);
    state = applyMidiToHeldNotes(state, decodeMidiMessage([0xb0, 64, 0]));
    expect(state.sustainOn).toBe(false);
  });
});
