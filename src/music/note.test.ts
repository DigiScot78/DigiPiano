import { describe, expect, it } from "vitest";
import { midiNoteToName, pitchToMidi } from "./note";

describe("note helpers", () => {
  it("converts MIDI note numbers to names", () => {
    expect(midiNoteToName(60)).toBe("C4");
    expect(midiNoteToName(61)).toBe("C#4");
    expect(midiNoteToName(21)).toBe("A0");
  });

  it("converts MusicXML pitch data to MIDI note numbers", () => {
    expect(pitchToMidi("C", 0, 4)).toBe(60);
    expect(pitchToMidi("F", 1, 3)).toBe(54);
    expect(pitchToMidi("B", -1, 4)).toBe(70);
  });
});
