import { describe, expect, it } from "vitest";
import { parseMusicXmlTimeline } from "../music/musicXmlParser";
import { generateSightReadingExercise } from "./sightReading";

describe("sight-reading generator", () => {
  it("generates a deterministic four-measure playable exercise", () => {
    const options = { level: "beginner", hand: "right", measures: 4, tempoBpm: 80, preparationSeconds: 0 } as const;
    const first = generateSightReadingExercise(options, 42);
    const second = generateSightReadingExercise(options, 42);
    expect(first.loadedScore.xmlText).toBe(second.loadedScore.xmlText);
    const parsed = parseMusicXmlTimeline(first.loadedScore.xmlText);
    expect(new Set(parsed.events.map((event) => event.measureNumber))).toEqual(new Set([1, 2, 3, 4]));
    expect(parsed.events).toHaveLength(16);
    expect(first.loadedScore.xmlText).toContain('<direction print-object="no"><direction-type><metronome>');
    expect(first.loadedScore.xmlText).not.toContain(`<direction><sound tempo=`);
  });

  it("supports mixed rhythm and both-hand exercise options", () => {
    const exercise = generateSightReadingExercise({ level: "intermediate", hand: "both", measures: 8, tempoBpm: 100, preparationSeconds: 30 }, 9);
    const parsed = parseMusicXmlTimeline(exercise.loadedScore.xmlText);
    expect(parsed.measureTimings).toHaveLength(8);
    expect(parsed.measureTimings.at(-1)?.endQuarter).toBe(32);
    expect(exercise.loadedScore.xmlText).toContain('<barline location="right"><bar-style>light-heavy</bar-style></barline>');
    expect(new Set(parsed.events.flatMap((event) => event.staffNumbers))).toEqual(new Set([1, 2]));
    expect(parsed.tempoChanges[0]?.bpm).toBe(100);
    expect(parsed.events.some((event) => event.durationQuarters === 0.5)).toBe(true);
  });
});
