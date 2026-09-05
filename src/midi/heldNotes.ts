import type { DecodedMidiMessage } from "./messages";

export interface HeldNoteState {
  heldNotes: Set<number>;
  sustainOn: boolean;
}

export function createHeldNoteState(): HeldNoteState {
  return {
    heldNotes: new Set<number>(),
    sustainOn: false,
  };
}

export function applyMidiToHeldNotes(state: HeldNoteState, message: DecodedMidiMessage): HeldNoteState {
  const heldNotes = new Set(state.heldNotes);
  let sustainOn = state.sustainOn;

  if (message.kind === "note-on" && message.noteNumber !== undefined) {
    heldNotes.add(message.noteNumber);
  }

  if (message.kind === "note-off" && message.noteNumber !== undefined) {
    heldNotes.delete(message.noteNumber);
  }

  if (message.kind === "control-change" && message.controller === 64 && message.sustainOn !== undefined) {
    sustainOn = message.sustainOn;
  }

  return { heldNotes, sustainOn };
}
