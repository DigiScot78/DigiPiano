import { describe, expect, it } from "vitest";
import { midiNoteFrequency } from "./pianoSynth";

describe("piano synth", () => {
  it("converts MIDI notes to equal-tempered frequencies", () => {
    expect(midiNoteFrequency(69)).toBe(440);
    expect(midiNoteFrequency(60)).toBeCloseTo(261.626, 3);
  });
});
