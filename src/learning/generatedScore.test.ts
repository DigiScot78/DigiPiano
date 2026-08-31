import { describe, expect, it } from "vitest";
import { parseMusicXmlTimeline } from "../music/musicXmlParser";
import { learningItem, type LearningRootId } from "./catalog";
import { generateLearningScore } from "./generatedScore";

function generated(root: LearningRootId, kind: "chord" | "scale") {
  const item = learningItem(root, kind, "major");
  if (!item) throw new Error(`Missing ${root}-major catalog item`);
  const result = generateLearningScore(item);
  if (!result) throw new Error(`${root}-major lesson was not generated`);
  return { ...result, parsed: parseMusicXmlTimeline(result.loadedScore.xmlText) };
}

describe("generated C-major learning scores", () => {
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

  it("does not generate unsupported catalog entries", () => {
    const item = learningItem("e", "scale", "major");
    expect(item && generateLearningScore(item)).toBeUndefined();
  });

  it("ignores invalid imported fingering text while preserving valid values", () => {
    const score = generated("c", "scale");
    const xml = score.loadedScore.xmlText.replace(">1</fingering>", ">1</fingering><fingering>0</fingering><fingering>6</fingering><fingering>thumb</fingering>");
    expect(parseMusicXmlTimeline(xml).events[0]?.noteDetails.find((note) => note.staffNumber === 1)?.fingerings).toEqual([1]);
  });
});
