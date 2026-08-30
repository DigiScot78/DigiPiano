import type { ScoreEvent } from "../music/scoreTypes";

export type PianoRangePreset = "88" | "76" | "61" | "49" | "custom";
export type PianoHeight = "small" | "medium" | "large";
export type PianoWidthMode = "auto" | "fit" | "scroll";
export type SynthesiaSpeed = 70 | 100 | 140;
export type PianoKeyState = "neutral" | "expected" | "correct" | "wrong" | "carried";
export type PianoExpectationStrength = "preview" | "active";
export interface PianoExpectation { midiNote: number; hand: "right" | "left" | "both"; strength: PianoExpectationStrength }

export interface PianoSettings {
  pianoVisible: boolean;
  synthesiaEnabled: boolean;
  synthesiaHeight: number;
  synthesiaOpaque: boolean;
  synthesiaShowNoteLabels: boolean;
  synthesiaSpeed: SynthesiaSpeed;
  showLabels: boolean;
  rangePreset: PianoRangePreset;
  customLow: number;
  customHigh: number;
  height: PianoHeight;
  widthMode: PianoWidthMode;
  expectedColor: string;
  correctColor: string;
  wrongColor: string;
  seeNoteColor: string;
  playRightColor: string;
  playLeftColor: string;
  synthesiaRightColor: string;
  synthesiaLeftColor: string;
}

export interface PianoKeyLayout {
  midiNote: number;
  isBlack: boolean;
  x: number;
  width: number;
  whiteIndex: number;
}

export interface PianoRange { low: number; high: number }

export const PIANO_MIN_NOTE = 21;
export const PIANO_MAX_NOTE = 108;
export const PIANO_SETTINGS_KEY = "piano.keyboard-settings";
export const SYNTHESIA_MIN_HEIGHT = 160;
export const SYNTHESIA_DEFAULT_HEIGHT = 320;
export const SYNTHESIA_MAX_STORED_HEIGHT = 2000;
export const DEFAULT_PIANO_COLORS = {
  expected: "#28b8d7",
  correct: "#239b56",
  wrong: "#d64545",
  seeNote: "#8b5cf6",
  playRight: "#f0a63a",
  playLeft: "#df62aa",
  synthesiaRight: "#20d7f2",
  synthesiaLeft: "#a875ff",
} as const;
export const DEFAULT_PIANO_SETTINGS: PianoSettings = {
  pianoVisible: true,
  synthesiaEnabled: false,
  synthesiaHeight: SYNTHESIA_DEFAULT_HEIGHT,
  synthesiaOpaque: false,
  synthesiaShowNoteLabels: false,
  synthesiaSpeed: 100,
  showLabels: false,
  rangePreset: "88",
  customLow: PIANO_MIN_NOTE,
  customHigh: PIANO_MAX_NOTE,
  height: "medium",
  widthMode: "auto",
  expectedColor: DEFAULT_PIANO_COLORS.expected,
  correctColor: DEFAULT_PIANO_COLORS.correct,
  wrongColor: DEFAULT_PIANO_COLORS.wrong,
  seeNoteColor: DEFAULT_PIANO_COLORS.seeNote,
  playRightColor: DEFAULT_PIANO_COLORS.playRight,
  playLeftColor: DEFAULT_PIANO_COLORS.playLeft,
  synthesiaRightColor: DEFAULT_PIANO_COLORS.synthesiaRight,
  synthesiaLeftColor: DEFAULT_PIANO_COLORS.synthesiaLeft,
};

export const PIANO_RANGES: Record<Exclude<PianoRangePreset, "custom">, PianoRange> = {
  "88": { low: 21, high: 108 },
  "76": { low: 28, high: 103 },
  "61": { low: 36, high: 96 },
  "49": { low: 36, high: 84 },
};

const BLACK_PITCHES = new Set([1, 3, 6, 8, 10]);

export function isBlackKey(note: number): boolean { return BLACK_PITCHES.has(note % 12); }

export function validateCustomRange(low: number, high: number): PianoRange {
  const safeLow = clampInteger(low, PIANO_MIN_NOTE, PIANO_MAX_NOTE - 12, DEFAULT_PIANO_SETTINGS.customLow);
  const safeHigh = clampInteger(high, PIANO_MIN_NOTE + 12, PIANO_MAX_NOTE, DEFAULT_PIANO_SETTINGS.customHigh);
  if (safeHigh - safeLow < 12) {
    return { low: Math.min(safeLow, PIANO_MAX_NOTE - 12), high: Math.min(Math.max(safeLow + 12, safeHigh), PIANO_MAX_NOTE) };
  }
  return { low: safeLow, high: safeHigh };
}

export function rangeForSettings(settings: PianoSettings): PianoRange {
  return settings.rangePreset === "custom" ? validateCustomRange(settings.customLow, settings.customHigh) : PIANO_RANGES[settings.rangePreset];
}

export function generatePianoLayout(low: number, high: number): PianoKeyLayout[] {
  const range = validateBounds(low, high);
  const whiteNotes = Array.from({ length: range.high - range.low + 1 }, (_, index) => range.low + index).filter((note) => !isBlackKey(note));
  const whiteCount = whiteNotes.length;
  const whiteIndexByNote = new Map(whiteNotes.map((note, index) => [note, index]));
  let previousWhite = -1;
  return Array.from({ length: range.high - range.low + 1 }, (_, index) => range.low + index).map((note) => {
    if (!isBlackKey(note)) {
      previousWhite = whiteIndexByNote.get(note) ?? previousWhite;
      return { midiNote: note, isBlack: false, x: previousWhite / whiteCount, width: 1 / whiteCount, whiteIndex: previousWhite };
    }
    const blackWidth = 0.62 / whiteCount;
    const naturalX = (previousWhite + 1 - 0.31) / whiteCount;
    return { midiNote: note, isBlack: true, x: Math.min(Math.max(naturalX, 0), 1 - blackWidth), width: blackWidth, whiteIndex: previousWhite };
  });
}

export function resolvePianoKeyState(note: number, expectedNotes: Iterable<number>, heldNotes: Iterable<number>, carriedNotes: Iterable<number>): PianoKeyState {
  const expected = new Set(expectedNotes);
  const held = new Set(heldNotes);
  const carried = new Set(carriedNotes);
  if (held.has(note) && carried.has(note)) return "carried";
  if (held.has(note) && expected.has(note)) return "correct";
  if (held.has(note)) return "wrong";
  if (expected.has(note)) return "expected";
  return "neutral";
}

export function pianoExpectationsForEvents(events: readonly ScoreEvent[], expectedNotes: readonly number[], strength: PianoExpectationStrength): PianoExpectation[] {
  const expected = new Set(expectedNotes);
  const hands = new Map<number, PianoExpectation["hand"]>();
  for (const detail of events.flatMap((event) => event.noteDetails)) {
    if (!expected.has(detail.midiNote)) continue;
    const hand = detail.staffNumber === 2 ? "left" : "right";
    const current = hands.get(detail.midiNote);
    hands.set(detail.midiNote, current && current !== hand ? "both" : hand);
  }
  return [...expected].sort((a, b) => a - b).map((midiNote) => ({ midiNote, hand: hands.get(midiNote) ?? "right", strength }));
}

export function readPianoSettings(storage: Pick<Storage, "getItem"> | undefined): PianoSettings {
  let value: unknown;
  try { value = JSON.parse(storage?.getItem(PIANO_SETTINGS_KEY) ?? "null"); } catch { return DEFAULT_PIANO_SETTINGS; }
  if (!value || typeof value !== "object") return DEFAULT_PIANO_SETTINGS;
  const candidate = value as Partial<PianoSettings> & { expanded?: unknown };
  const range = validateCustomRange(Number(candidate.customLow), Number(candidate.customHigh));
  return {
    pianoVisible: typeof candidate.pianoVisible === "boolean"
      ? candidate.pianoVisible
      : typeof candidate.expanded === "boolean" ? candidate.expanded : true,
    synthesiaEnabled: typeof candidate.synthesiaEnabled === "boolean" ? candidate.synthesiaEnabled : false,
    synthesiaHeight: integerInRange(candidate.synthesiaHeight, SYNTHESIA_MIN_HEIGHT, SYNTHESIA_MAX_STORED_HEIGHT, SYNTHESIA_DEFAULT_HEIGHT),
    synthesiaOpaque: typeof candidate.synthesiaOpaque === "boolean" ? candidate.synthesiaOpaque : false,
    synthesiaShowNoteLabels: typeof candidate.synthesiaShowNoteLabels === "boolean" ? candidate.synthesiaShowNoteLabels : false,
    synthesiaSpeed: isOneOf(candidate.synthesiaSpeed, [70, 100, 140]) ? candidate.synthesiaSpeed : 100,
    showLabels: typeof candidate.showLabels === "boolean" ? candidate.showLabels : false,
    rangePreset: isOneOf(candidate.rangePreset, ["88", "76", "61", "49", "custom"]) ? candidate.rangePreset : "88",
    customLow: range.low,
    customHigh: range.high,
    height: isOneOf(candidate.height, ["small", "medium", "large"]) ? candidate.height : "medium",
    widthMode: isOneOf(candidate.widthMode, ["auto", "fit", "scroll"]) ? candidate.widthMode : "auto",
    expectedColor: validColor(candidate.expectedColor, DEFAULT_PIANO_COLORS.expected),
    correctColor: validColor(candidate.correctColor, DEFAULT_PIANO_COLORS.correct),
    wrongColor: validColor(candidate.wrongColor, DEFAULT_PIANO_COLORS.wrong),
    seeNoteColor: validColor(candidate.seeNoteColor, DEFAULT_PIANO_COLORS.seeNote),
    playRightColor: validColor(candidate.playRightColor, DEFAULT_PIANO_COLORS.playRight),
    playLeftColor: validColor(candidate.playLeftColor, DEFAULT_PIANO_COLORS.playLeft),
    synthesiaRightColor: validColor(candidate.synthesiaRightColor, DEFAULT_PIANO_COLORS.synthesiaRight),
    synthesiaLeftColor: validColor(candidate.synthesiaLeftColor, DEFAULT_PIANO_COLORS.synthesiaLeft),
  };
}

export function storePianoSettings(storage: Pick<Storage, "setItem"> | undefined, settings: PianoSettings): void {
  try { storage?.setItem(PIANO_SETTINGS_KEY, JSON.stringify(settings)); } catch { /* Preferences are optional. */ }
}

function validateBounds(low: number, high: number): PianoRange {
  const safeLow = clampInteger(low, 0, 127, 0);
  const safeHigh = clampInteger(high, safeLow, 127, safeLow);
  return { low: safeLow, high: safeHigh };
}
function clampInteger(value: number, min: number, max: number, fallback: number): number {
  return Number.isInteger(value) ? Math.min(Math.max(value, min), max) : fallback;
}
function isOneOf<T extends string | number>(value: unknown, values: readonly T[]): value is T { return values.includes(value as T); }
function validColor(value: unknown, fallback: string): string { return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback; }
function integerInRange(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}
