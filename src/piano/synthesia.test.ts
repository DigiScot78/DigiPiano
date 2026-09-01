import { describe, expect, it } from "vitest";
import type { PlaybackPlan } from "../playback/playback";
import { generatePianoLayout } from "./piano";
import { availableSynthesiaHeight, createSynthesiaBlocks, isSynthesiaBlockStriking, isSynthesiaBlockVisible, synthesiaDisplayElapsedMs, synthesiaVerticalGeometry } from "./synthesia";

const plan: PlaybackPlan = {
  startQuarter: 0,
  endQuarter: 1,
  durationMs: 500,
  events: [{
    eventIndex: 2,
    onsetMs: 200,
    endMs: 500,
    event: {
      id: "event", partId: "P1", measureNumber: 1, startQuarter: 0, durationQuarters: 1,
      midiNotes: [60, 48], staffNumbers: [1, 2], voiceNumbers: ["1"], sourceNoteIds: ["60", "48"],
      noteDetails: [
        { midiNote: 60, staffNumber: 1, voiceNumber: "1", sourceNoteId: "60" },
        { midiNote: 48, staffNumber: 2, voiceNumber: "1", sourceNoteId: "48" },
      ],
    },
  }],
};

describe("Synthesia geometry", () => {
  it("limits the roll to the space below the fixed header", () => {
    expect(availableSynthesiaHeight(500, 60)).toBe(434);
    expect(availableSynthesiaHeight(50, 60)).toBe(0);
  });

  it("shares piano key coordinates and classifies hands", () => {
    const keys = generatePianoLayout(36, 96);
    const blocks = createSynthesiaBlocks(plan, keys);
    expect(blocks.map((block) => [block.midiNote, block.hand, block.durationMs])).toEqual([[60, "right", 300], [48, "left", 300]]);
    const c4 = keys.find((key) => key.midiNote === 60)!;
    expect(blocks[0]).toMatchObject({ x: c4.x, width: c4.width });
  });

  it("uses each pitch's written duration when an onset also contains a sustained note", () => {
    const mixedDurationPlan: PlaybackPlan = {
      startQuarter: 0,
      endQuarter: 4,
      durationMs: 2000,
      events: [{
        eventIndex: 0,
        onsetMs: 0,
        endMs: 2000,
        noteEndMs: [125, 2000],
        event: {
          id: "mixed", partId: "P1", measureNumber: 44, startQuarter: 0, durationQuarters: 4,
          midiNotes: [72, 76], staffNumbers: [1], voiceNumbers: ["1", "2"], sourceNoteIds: ["short-c5", "held-e5"],
          noteDetails: [
            { midiNote: 72, durationQuarters: 0.25, staffNumber: 1, voiceNumber: "1", sourceNoteId: "short-c5" },
            { midiNote: 76, durationQuarters: 4, staffNumber: 1, voiceNumber: "2", sourceNoteId: "held-e5" },
          ],
        },
      }],
    };

    expect(createSynthesiaBlocks(mixedDurationPlan, generatePianoLayout(36, 96)).map((block) => [block.midiNote, block.durationMs])).toEqual([[72, 125], [76, 2000]]);
  });

  it("moves at a fixed pixel speed and preserves duration", () => {
    const geometry = synthesiaVerticalGeometry({ onsetMs: 2000, durationMs: 500 }, 500);
    expect(geometry).toEqual({ bottom: 150, height: 50 });
    expect(isSynthesiaBlockVisible(geometry, 320)).toBe(true);
    expect(isSynthesiaBlockVisible({ bottom: 400, height: 50 }, 320)).toBe(false);
  });

  it("anchors the idle roll to the selected score event", () => {
    const idlePlan: PlaybackPlan = {
      ...plan,
      durationMs: 1500,
      events: [
        { ...plan.events[0], eventIndex: 2, onsetMs: 200, endMs: 500 },
        { ...plan.events[0], eventIndex: 7, onsetMs: 900, endMs: 1200 },
      ],
    };
    expect(synthesiaDisplayElapsedMs(idlePlan, "idle", 0, 7)).toBe(900);
    expect(synthesiaDisplayElapsedMs(idlePlan, "playing", 640, 7)).toBe(640);
  });

  it("supports readable speed choices and briefly holds short strike highlights", () => {
    const fastGeometry = synthesiaVerticalGeometry({ onsetMs: 2000, durationMs: 500 }, 500, 140);
    expect(fastGeometry.bottom).toBeCloseTo(210);
    expect(fastGeometry.height).toBeCloseTo(70);
    expect(isSynthesiaBlockStriking({ onsetMs: 1000, durationMs: 40 }, 1100)).toBe(true);
    expect(isSynthesiaBlockStriking({ onsetMs: 1000, durationMs: 40 }, 1140)).toBe(false);
  });
});
