import { describe, expect, it } from "vitest";
import { parseMusicXmlTimeline } from "../music/musicXmlParser";
import { CHORD_CATALOG, SCALE_CATALOG, learningItem, type LearningItem, type LearningRootId } from "./catalog";
import { canGenerateLearningScore, generateLearningScore } from "./generatedScore";

function generated(root: LearningRootId, kind: "chord" | "scale") {
  const item = learningItem(root, kind, "major");
  if (!item) throw new Error(`Missing ${root}-major catalog item`);
  const result = generateLearningScore(item);
  if (!result) throw new Error(`${root}-major lesson was not generated`);
  return { ...result, parsed: parseMusicXmlTimeline(result.loadedScore.xmlText) };
}

describe("generated C-major learning scores", () => {
  it("generates every catalog chord as the shared right-hand exercise", () => {
    const fileNames = new Set<string>();
    for (const item of CHORD_CATALOG) {
      const generated = generateLearningScore(item);
      expect(generated, item.id).toBeDefined();
      if (!generated) continue;
      const parsed = parseMusicXmlTimeline(generated.loadedScore.xmlText);
      fileNames.add(generated.loadedScore.fileName);
      expect(generated.handMode, item.id).toBe("right");
      expect(parsed.events, item.id).toHaveLength(4);
      expect(parsed.warnings, item.id).toEqual([]);
      expect(parsed.measureTimings, item.id).toHaveLength(4);
      expect(parsed.events.every((event) => event.durationQuarters === 4 && event.noteDetails.every((note) => note.staffNumber === 1)), item.id).toBe(true);
      expect(parsed.events.map((event) => event.midiNotes), item.id).toEqual(Array.from({ length: 4 }, () => item.midiNotes));
      expect(writtenNotes(parsed.events[0]?.noteDetails ?? []), item.id).toEqual(item.writtenNotes);
    }
    expect(fileNames).toHaveLength(CHORD_CATALOG.length);
  });

  it("generates every catalog scale with both hands, fingering, and the expected descent", () => {
    const fileNames = new Set<string>();
    for (const item of SCALE_CATALOG) {
      const generated = generateLearningScore(item);
      expect(generated, item.id).toBeDefined();
      if (!generated) continue;
      const parsed = parseMusicXmlTimeline(generated.loadedScore.xmlText);
      const descent = item.quality === "melodic-minor" ? learningItem(item.root.id, "scale", "natural-minor") ?? item : item;
      const expectedRight = [...item.midiNotes, ...descent.midiNotes.slice(0, -1).reverse()];
      fileNames.add(generated.loadedScore.fileName);
      expect(generated.handMode, item.id).toBe("both");
      expect(parsed.events, item.id).toHaveLength(15);
      expect(parsed.warnings, item.id).toEqual([]);
      expect(parsed.measureTimings, item.id).toHaveLength(2);
      expect(parsed.events.map((event) => event.durationQuarters), item.id).toEqual([...Array(14).fill(0.5), 1]);
      expect(parsed.events.map((event) => event.midiNotes), item.id).toEqual(expectedRight.map((note) => [note - 12, note]));
      expect(parsed.events.flatMap((event) => event.noteDetails).every((note) => note.fingerings?.length === 1 && (note.fingerings[0] ?? 0) >= 1 && (note.fingerings[0] ?? 0) <= 5), item.id).toBe(true);
      expect(generated.loadedScore.xmlText.match(/<fingering /g), item.id).toHaveLength(30);
      expect(writtenNotes(parsed.events.slice(0, 8).map((event) => event.noteDetails.find((note) => note.staffNumber === 1)!)), item.id).toEqual(item.writtenNotes);
      expect(writtenNotes(parsed.events.slice(8).map((event) => event.noteDetails.find((note) => note.staffNumber === 1)!)), item.id).toEqual(descent.writtenNotes.slice(0, -1).reverse());
      expect(parsed.events.map((event) => event.noteDetails.find((note) => note.staffNumber === 1)?.fingerings?.[0]), item.id).toEqual([...(item.rightFingering ?? []), ...(descent.rightFingering ?? []).slice(0, -1).reverse()]);
      expect(parsed.events.map((event) => event.noteDetails.find((note) => note.staffNumber === 2)?.fingerings?.[0]), item.id).toEqual([...(item.leftFingering ?? []), ...(descent.leftFingering ?? []).slice(0, -1).reverse()]);
    }
    expect(fileNames).toHaveLength(SCALE_CATALOG.length);
  });

  it("creates four right-hand whole-note chord events", () => {
    const score = generated("c", "chord");
    expect(score.handMode).toBe("right");
    expect(score.loadedScore.info.title).toBe("C Major Chord Practice");
    expect(score.parsed.events).toHaveLength(4);
    expect(score.parsed.events.map((event) => event.midiNotes)).toEqual(Array(4).fill([60, 64, 67]));
    expect(score.parsed.events.every((event) => event.durationQuarters === 4 && event.noteDetails.every((note) => note.staffNumber === 1))).toBe(true);
    expect(score.parsed.measureTimings).toHaveLength(4);
  });

  it("creates a two-hand ascending and descending scale with parsed fingerings", () => {
    const score = generated("c", "scale");
    const expectedRight = [60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60];
    const expectedLeft = expectedRight.map((note) => note - 12);
    expect(score.handMode).toBe("both");
    expect(score.parsed.events).toHaveLength(15);
    expect(score.parsed.events.map((event) => event.durationQuarters)).toEqual([...Array(14).fill(0.5), 1]);
    expect(score.parsed.events.map((event) => event.midiNotes)).toEqual(expectedRight.map((note, index) => [note, expectedLeft[index]].sort((a, b) => a - b)));
    expect(score.loadedScore.xmlText.match(/<fingering /g)).toHaveLength(30);
    expect(score.parsed.events[0]?.noteDetails.map((note) => [note.staffNumber, note.fingerings])).toEqual([[1, [1]], [2, [5]]]);
    expect(score.parsed.measureTimings).toHaveLength(2);
  });

  it("creates correctly spelled D-major chord and scale scores", () => {
    const chord = generated("d", "chord");
    expect(chord.loadedScore.info.title).toBe("D Major Chord Practice");
    expect(chord.parsed.events.map((event) => event.midiNotes)).toEqual(Array(4).fill([62, 66, 69]));
    expect(chord.parsed.events[0]?.noteDetails.map((note) => [note.pitchStep, note.pitchAlter ?? 0])).toEqual([["D", 0], ["F", 1], ["A", 0]]);

    const scale = generated("d", "scale");
    const right = [62, 64, 66, 67, 69, 71, 73, 74, 73, 71, 69, 67, 66, 64, 62];
    expect(scale.parsed.events.map((event) => event.midiNotes)).toEqual(right.map((note) => [note - 12, note]));
    expect(scale.parsed.events.flatMap((event) => event.noteDetails).filter((note) => note.midiNote % 12 === 6 || note.midiNote % 12 === 1).every((note) => note.pitchAlter === 1)).toBe(true);
    expect(scale.loadedScore.xmlText).toContain("<fifths>2</fifths>");
  });

  it("makes every catalog item available while rejecting an unknown item", () => {
    expect([...CHORD_CATALOG, ...SCALE_CATALOG].every(canGenerateLearningScore)).toBe(true);
    const unknown = { ...CHORD_CATALOG[0], id: "chord:unknown:major" } as LearningItem;
    expect(canGenerateLearningScore(unknown)).toBe(false);
    expect(generateLearningScore(unknown)).toBeUndefined();
    expect(canGenerateLearningScore({ ...CHORD_CATALOG[0], midiNotes: [60, 63, 67] })).toBe(false);
  });

  it("uses readable neutral signatures and explicit rare-key accidentals", () => {
    const item = learningItem("d-sharp", "scale", "major");
    if (!item) throw new Error("Missing D-sharp major scale");
    const score = generateLearningScore(item);
    expect(score?.loadedScore.xmlText).toContain("<fifths>0</fifths>");
    expect(score?.loadedScore.xmlText).toContain("<accidental>double-sharp</accidental>");
    expect(parseMusicXmlTimeline(score?.loadedScore.xmlText ?? "").events.slice(0, 8).map((event) => event.noteDetails.find((note) => note.staffNumber === 1)?.pitchAlter ?? 0)).toEqual([1, 1, 2, 1, 1, 1, 2, 1]);
  });

  it("uses conventional signatures for representative flat and sharp lessons", () => {
    expect(generateLearningScore(learningItem("f", "scale", "major")!)?.loadedScore.xmlText).toContain("<fifths>-1</fifths>");
    expect(generateLearningScore(learningItem("b-flat", "scale", "major")!)?.loadedScore.xmlText).toContain("<fifths>-2</fifths>");
    expect(generateLearningScore(learningItem("c-sharp", "scale", "major")!)?.loadedScore.xmlText).toContain("<fifths>7</fifths>");
    expect(generateLearningScore(learningItem("c", "scale", "harmonic-minor")!)?.loadedScore.xmlText).toContain("<fifths>-3</fifths>");
  });

  it("ignores invalid imported fingering text while preserving valid values", () => {
    const score = generated("c", "scale");
    const xml = score.loadedScore.xmlText.replace(">1</fingering>", ">1</fingering><fingering>0</fingering><fingering>6</fingering><fingering>thumb</fingering>");
    expect(parseMusicXmlTimeline(xml).events[0]?.noteDetails.find((note) => note.staffNumber === 1)?.fingerings).toEqual([1]);
  });
});

function writtenNotes(notes: Array<{ pitchStep?: string; pitchAlter?: number }>): string[] {
  return notes.map((note) => `${note.pitchStep}${(note.pitchAlter ?? 0) > 0 ? "♯".repeat(note.pitchAlter ?? 0) : "♭".repeat(-(note.pitchAlter ?? 0))}`);
}
