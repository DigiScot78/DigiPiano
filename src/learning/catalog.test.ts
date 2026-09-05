import { describe, expect, it } from "vitest";
import { CHORD_CATALOG, LEARNING_ROOTS, SCALE_CATALOG, learningItem } from "./catalog";

describe("learning catalog", () => {
  it("provides four chord and scale references for all 17 written roots", () => {
    expect(LEARNING_ROOTS).toHaveLength(17);
    expect(CHORD_CATALOG).toHaveLength(68);
    expect(SCALE_CATALOG).toHaveLength(68);
    for (const root of LEARNING_ROOTS) {
      expect(CHORD_CATALOG.filter((item) => item.root.id === root.id)).toHaveLength(4);
      expect(SCALE_CATALOG.filter((item) => item.root.id === root.id)).toHaveLength(4);
    }
  });

  it("uses triad and minor-scale interval formulas with diatonic spelling", () => {
    expect(learningItem("c", "chord", "augmented")).toMatchObject({ midiNotes: [60, 64, 68], writtenNotes: ["C", "E", "G♯"] });
    expect(learningItem("c", "chord", "diminished")).toMatchObject({ midiNotes: [60, 63, 66], writtenNotes: ["C", "E♭", "G♭"] });
    expect(learningItem("a", "scale", "harmonic-minor")?.midiNotes).toEqual([69, 71, 72, 74, 76, 77, 80, 81]);
    expect(learningItem("a", "scale", "melodic-minor")?.midiNotes).toEqual([69, 71, 72, 74, 76, 78, 80, 81]);
    expect(learningItem("d-sharp", "scale", "harmonic-minor")?.writtenNotes).toContain("C♯♯");
  });

  it("builds root-position triads and octave-complete scales", () => {
    for (const chord of CHORD_CATALOG) {
      expect(chord.midiNotes).toHaveLength(3);
      expect(chord.writtenNotes).toHaveLength(3);
      expect(chord.midiNotes[0]).toBe(60 + chord.root.pitchClass);
    }
    for (const scale of SCALE_CATALOG) {
      expect(scale.midiNotes).toHaveLength(8);
      expect(scale.writtenNotes).toHaveLength(8);
      expect(scale.midiNotes.at(-1)).toBe(scale.midiNotes[0] + 12);
      expect(scale.rightFingering).toHaveLength(8);
      expect(scale.leftFingering).toHaveLength(8);
      expect([...scale.rightFingering ?? [], ...scale.leftFingering ?? []].every((finger) => finger >= 1 && finger <= 5)).toBe(true);
    }
  });

  it("keeps enharmonic diagrams equivalent while preserving written spelling", () => {
    const cSharp = learningItem("c-sharp", "scale", "major");
    const dFlat = learningItem("d-flat", "scale", "major");
    expect(cSharp?.midiNotes).toEqual(dFlat?.midiNotes);
    expect(cSharp?.rightFingering).toEqual(dFlat?.rightFingering);
    expect(learningItem("d-sharp", "scale", "major")?.writtenNotes).toContain("F♯♯");
    expect(dFlat?.writtenNotes).toEqual(["D♭", "E♭", "F", "G♭", "A♭", "B♭", "C", "D♭"]);
  });
});
