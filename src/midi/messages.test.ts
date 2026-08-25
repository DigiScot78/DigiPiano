import { describe, expect, it } from "vitest";
import { decodeMidiMessage } from "./messages";

describe("decodeMidiMessage", () => {
  it("decodes note on", () => {
    expect(decodeMidiMessage([0x90, 60, 96])).toMatchObject({
      kind: "note-on",
      channel: 1,
      noteNumber: 60,
      noteName: "C4",
      velocity: 96,
    });
  });

  it("treats velocity zero note-on as note-off", () => {
    expect(decodeMidiMessage([0x90, 60, 0])).toMatchObject({
      kind: "note-off",
      noteNumber: 60,
      velocity: 0,
    });
  });

  it("decodes sustain pedal control changes", () => {
    expect(decodeMidiMessage([0xb0, 64, 127])).toMatchObject({
      kind: "control-change",
      controller: 64,
      value: 127,
      sustainOn: true,
    });
  });
});
