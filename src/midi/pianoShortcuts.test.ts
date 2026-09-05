import { describe, expect, it } from "vitest";
import type { CapturedMidiMessage } from "../hooks/useMidiInput";
import { DEFAULT_PIANO_SHORTCUT_SETTINGS, initialPianoShortcutState, readPianoShortcutSettings, resolvePianoShortcut, shortcutConflicts } from "./pianoShortcuts";

function message(kind: "note-on" | "note-off", noteNumber: number, before: number[], after: number[]): CapturedMidiMessage {
  return { id: 1, receivedAtMs: 0, heldNotesBefore: before, heldNotesAfter: after, message: { kind, command: kind === "note-on" ? 144 : 128, channel: 1, noteNumber, velocity: kind === "note-on" ? 100 : 0, raw: [] } };
}

const enabled = { ...DEFAULT_PIANO_SHORTCUT_SETTINGS, enabled: true, modifier: 21 };

describe("piano shortcut resolver", () => {
  it("requires the modifier to be held before the action note", () => {
    expect(resolvePianoShortcut(message("note-on", 36, [], [36]), enabled, initialPianoShortcutState(), true).command).toBeUndefined();
    expect(resolvePianoShortcut(message("note-on", 36, [21], [21, 36]), enabled, initialPianoShortcutState(), true).command).toBe("primary");
  });

  it("consumes a recognised chord until its action key is released", () => {
    const pressed = resolvePianoShortcut(message("note-on", 36, [21], [21, 36]), enabled, initialPianoShortcutState(), true);
    expect(pressed.heldNotesAfter).toEqual([]);
    const released = resolvePianoShortcut(message("note-off", 36, [21, 36], [21]), enabled, pressed.state, true);
    expect(released.heldNotesAfter).toEqual([]);
    expect(released.state.activeActionNotes).toEqual([]);
  });

  it("does not retrigger an action until that action key is released", () => {
    const pressed = resolvePianoShortcut(message("note-on", 36, [21], [21, 36]), enabled, initialPianoShortcutState(), true);
    const repeated = resolvePianoShortcut(message("note-on", 36, [21, 36], [21, 36]), enabled, pressed.state, true);
    expect(repeated.command).toBeUndefined();
  });

  it("does not reserve notes outside an active shortcut context", () => {
    expect(resolvePianoShortcut(message("note-on", 21, [], [21]), enabled, initialPianoShortcutState(), false).heldNotesAfter).toEqual([21]);
  });

  it("reports duplicate bindings and safely migrates malformed storage", () => {
    expect(shortcutConflicts({ ...enabled, bindings: { ...enabled.bindings, stop: 36 } })).toContain("stop");
    expect(readPianoShortcutSettings({ getItem: () => "{}" })).toEqual(DEFAULT_PIANO_SHORTCUT_SETTINGS);
    expect(readPianoShortcutSettings({ getItem: () => JSON.stringify({ ...enabled, version: 1 }) }).modifier).toBe(33);
  });
});
