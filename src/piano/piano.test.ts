import { describe, expect, it } from "vitest";
import { DEFAULT_PIANO_SETTINGS, generatePianoLayout, pianoExpectationsForEvents, PIANO_RANGES, PIANO_SETTINGS_KEY, rangeForSettings, readPianoSettings, resolvePianoKeyState, validateCustomRange } from "./piano";

describe("piano geometry", () => {
  it.each([["88", 21, 108, 88], ["76", 28, 103, 76], ["61", 36, 96, 61], ["49", 36, 84, 49]] as const)("builds the %s-key range", (preset, low, high, count) => {
    const range = PIANO_RANGES[preset];
    const keys = generatePianoLayout(range.low, range.high);
    expect(range).toEqual({ low, high });
    expect(keys).toHaveLength(count);
    expect(keys.map((key) => key.midiNote)).toEqual([...keys.map((key) => key.midiNote)].sort((a, b) => a - b));
    expect(keys.filter((key) => !key.isBlack).every((key, index) => key.whiteIndex === index)).toBe(true);
    expect(keys.every((key) => key.x >= 0 && key.x + key.width <= 1.01)).toBe(true);
  });
  it("enforces a one-octave custom range", () => expect(validateCustomRange(100, 101)).toEqual({ low: 96, high: 108 }));
  it("keeps a custom range beginning on a black key within normalized bounds", () => expect(generatePianoLayout(22, 46).every((key) => key.x >= 0 && key.x + key.width <= 1.01)).toBe(true));
  it("uses custom settings", () => expect(rangeForSettings({ ...DEFAULT_PIANO_SETTINGS, rangePreset: "custom", customLow: 48, customHigh: 72 })).toEqual({ low: 48, high: 72 }));
});

describe("piano state and persistence", () => {
  it("derives complete event-backed hand expectations including a shared pitch", () => {
    const event = { id: "both", partId: "P1", measureNumber: 1, startQuarter: 0, durationQuarters: 1, midiNotes: [48, 60], staffNumbers: [1, 2], voiceNumbers: ["1", "2"], sourceNoteIds: ["lh", "rh", "shared-lh"], noteDetails: [{ midiNote: 48, staffNumber: 2, voiceNumber: "2", sourceNoteId: "lh" }, { midiNote: 60, staffNumber: 1, voiceNumber: "1", sourceNoteId: "rh" }, { midiNote: 60, staffNumber: 2, voiceNumber: "2", sourceNoteId: "shared-lh" }] };
    expect(pianoExpectationsForEvents([event], [48, 60], "preview")).toEqual([
      { midiNote: 48, hand: "left", strength: "preview" },
      { midiNote: 60, hand: "both", strength: "preview" },
    ]);
  });
  it("prioritises carried, correct, wrong, then expected states", () => {
    expect(resolvePianoKeyState(60, [60], [60], [60])).toBe("carried");
    expect(resolvePianoKeyState(60, [60], [60], [])).toBe("correct");
    expect(resolvePianoKeyState(61, [60], [61], [])).toBe("wrong");
    expect(resolvePianoKeyState(60, [60], [], [])).toBe("expected");
  });
  it("falls back safely for malformed preferences", () => {
    expect(readPianoSettings({ getItem: () => "bad" })).toEqual(DEFAULT_PIANO_SETTINGS);
    const settings = readPianoSettings({ getItem: (key) => key === PIANO_SETTINGS_KEY ? JSON.stringify({ rangePreset: "nope", expectedColor: "red" }) : null });
    expect(settings.rangePreset).toBe("88");
    expect(settings.expectedColor).toBe(DEFAULT_PIANO_SETTINGS.expectedColor);
    expect(settings.seeNoteColor).toBe(DEFAULT_PIANO_SETTINGS.seeNoteColor);
    expect(settings.synthesiaEnabled).toBe(false);
    expect(settings.synthesiaHeight).toBe(DEFAULT_PIANO_SETTINGS.synthesiaHeight);
    expect(settings.synthesiaOpaque).toBe(false);
    expect(settings.synthesiaShowNoteLabels).toBe(false);
    expect(settings.playRightColor).toBe(DEFAULT_PIANO_SETTINGS.playRightColor);
    expect(settings.playLeftColor).toBe(DEFAULT_PIANO_SETTINGS.playLeftColor);
    expect(settings.synthesiaRightColor).toBe(DEFAULT_PIANO_SETTINGS.synthesiaRightColor);
    expect(settings.synthesiaLeftColor).toBe(DEFAULT_PIANO_SETTINGS.synthesiaLeftColor);
  });
  it("persists a valid See Note colour and rejects an invalid one", () => {
    expect(readPianoSettings({ getItem: () => JSON.stringify({ seeNoteColor: "#7654ab" }) }).seeNoteColor).toBe("#7654ab");
    expect(readPianoSettings({ getItem: () => JSON.stringify({ seeNoteColor: "purple" }) }).seeNoteColor).toBe(DEFAULT_PIANO_SETTINGS.seeNoteColor);
  });
  it("migrates the legacy expanded preference and prefers the new field", () => {
    expect(readPianoSettings({ getItem: () => JSON.stringify({ expanded: false }) }).pianoVisible).toBe(false);
    expect(readPianoSettings({ getItem: () => JSON.stringify({ pianoVisible: true, expanded: false }) }).pianoVisible).toBe(true);
  });
});
