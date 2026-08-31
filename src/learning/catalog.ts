export type LearningRootId = "c" | "c-sharp" | "d-flat" | "d" | "d-sharp" | "e-flat" | "e" | "f" | "f-sharp" | "g-flat" | "g" | "g-sharp" | "a-flat" | "a" | "a-sharp" | "b-flat" | "b";
export type ChordQuality = "major" | "minor" | "augmented" | "diminished";
export type ScaleMode = "major" | "natural-minor" | "harmonic-minor" | "melodic-minor";
export type FingerNumber = 1 | 2 | 3 | 4 | 5;

export interface LearningRoot {
  id: LearningRootId;
  label: string;
  step: NoteStep;
  alter: number;
  pitchClass: number;
}

export interface LearningItem {
  id: string;
  root: LearningRoot;
  kind: "chord" | "scale";
  quality: ChordQuality | ScaleMode;
  label: string;
  midiNotes: number[];
  writtenNotes: string[];
  rightFingering?: FingerNumber[];
  leftFingering?: FingerNumber[];
}

type NoteStep = "C" | "D" | "E" | "F" | "G" | "A" | "B";
type FingeringPair = { right: FingerNumber[]; left: FingerNumber[] };

const STEPS: NoteStep[] = ["C", "D", "E", "F", "G", "A", "B"];
const NATURAL_PITCH_CLASS: Record<NoteStep, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11, 12];
const NATURAL_MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10, 12];
const HARMONIC_MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 11, 12];
const MELODIC_MINOR_INTERVALS = [0, 2, 3, 5, 7, 9, 11, 12];

export const LEARNING_ROOTS: LearningRoot[] = [
  { id: "c", label: "C", step: "C", alter: 0, pitchClass: 0 },
  { id: "c-sharp", label: "C♯", step: "C", alter: 1, pitchClass: 1 },
  { id: "d-flat", label: "D♭", step: "D", alter: -1, pitchClass: 1 },
  { id: "d", label: "D", step: "D", alter: 0, pitchClass: 2 },
  { id: "d-sharp", label: "D♯", step: "D", alter: 1, pitchClass: 3 },
  { id: "e-flat", label: "E♭", step: "E", alter: -1, pitchClass: 3 },
  { id: "e", label: "E", step: "E", alter: 0, pitchClass: 4 },
  { id: "f", label: "F", step: "F", alter: 0, pitchClass: 5 },
  { id: "f-sharp", label: "F♯", step: "F", alter: 1, pitchClass: 6 },
  { id: "g-flat", label: "G♭", step: "G", alter: -1, pitchClass: 6 },
  { id: "g", label: "G", step: "G", alter: 0, pitchClass: 7 },
  { id: "g-sharp", label: "G♯", step: "G", alter: 1, pitchClass: 8 },
  { id: "a-flat", label: "A♭", step: "A", alter: -1, pitchClass: 8 },
  { id: "a", label: "A", step: "A", alter: 0, pitchClass: 9 },
  { id: "a-sharp", label: "A♯", step: "A", alter: 1, pitchClass: 10 },
  { id: "b-flat", label: "B♭", step: "B", alter: -1, pitchClass: 10 },
  { id: "b", label: "B", step: "B", alter: 0, pitchClass: 11 },
];

const STANDARD = fingering("12312345", "54321321");
const F_MAJOR = fingering("12341234", "54321321");
const C_SHARP = fingering("23123412", "32143213");
const E_FLAT = fingering("31234123", "32143213");
const F_SHARP = fingering("23412312", "43213214");
const A_FLAT = fingering("34123123", "32143213");
const B_FLAT = fingering("41231234", "32143213");
const B_MAJOR = fingering("12312345", "43214321");

const MAJOR_FINGERINGS: Record<LearningRootId, FingeringPair> = {
  c: STANDARD, "c-sharp": C_SHARP, "d-flat": C_SHARP, d: STANDARD,
  "d-sharp": E_FLAT, "e-flat": E_FLAT, e: STANDARD, f: F_MAJOR,
  "f-sharp": F_SHARP, "g-flat": F_SHARP, g: STANDARD,
  "g-sharp": A_FLAT, "a-flat": A_FLAT, a: STANDARD,
  "a-sharp": B_FLAT, "b-flat": B_FLAT, b: B_MAJOR,
};

const MINOR_C_SHARP = fingering("23123412", "43213214");
const MINOR_E_FLAT = fingering("21234123", "32143213");
const MINOR_F_SHARP = fingering("23412312", "43213214");
const MINOR_A_FLAT = fingering("34123123", "32143213");
const MINOR_B_FLAT = fingering("41231234", "32143213");

const NATURAL_MINOR_FINGERINGS: Record<LearningRootId, FingeringPair> = {
  c: STANDARD, "c-sharp": MINOR_C_SHARP, "d-flat": MINOR_C_SHARP, d: STANDARD,
  "d-sharp": MINOR_E_FLAT, "e-flat": MINOR_E_FLAT, e: STANDARD, f: F_MAJOR,
  "f-sharp": MINOR_F_SHARP, "g-flat": MINOR_F_SHARP, g: STANDARD,
  "g-sharp": MINOR_A_FLAT, "a-flat": MINOR_A_FLAT, a: STANDARD,
  "a-sharp": MINOR_B_FLAT, "b-flat": MINOR_B_FLAT, b: B_MAJOR,
};

export const CHORD_CATALOG: LearningItem[] = LEARNING_ROOTS.flatMap((root) => [
  chordItem(root, "major"),
  chordItem(root, "minor"),
  chordItem(root, "augmented"),
  chordItem(root, "diminished"),
]);

export const SCALE_CATALOG: LearningItem[] = LEARNING_ROOTS.flatMap((root) => [
  scaleItem(root, "major", MAJOR_FINGERINGS[root.id]),
  scaleItem(root, "natural-minor", NATURAL_MINOR_FINGERINGS[root.id]),
  scaleItem(root, "harmonic-minor", NATURAL_MINOR_FINGERINGS[root.id]),
  scaleItem(root, "melodic-minor", NATURAL_MINOR_FINGERINGS[root.id]),
]);

export function learningItem(rootId: LearningRootId, kind: "chord" | "scale", quality: ChordQuality | ScaleMode): LearningItem | undefined {
  return (kind === "chord" ? CHORD_CATALOG : SCALE_CATALOG).find((item) => item.root.id === rootId && item.quality === quality);
}

function chordItem(root: LearningRoot, quality: ChordQuality): LearningItem {
  const intervals: Record<ChordQuality, number[]> = {
    major: [0, 4, 7],
    minor: [0, 3, 7],
    augmented: [0, 4, 8],
    diminished: [0, 3, 6],
  };
  const chordIntervals = intervals[quality];
  return {
    id: `chord:${root.id}:${quality}`,
    root,
    kind: "chord",
    quality,
    label: `${root.label} ${quality}`,
    midiNotes: chordIntervals.map((interval) => 60 + root.pitchClass + interval),
    writtenNotes: spellIntervals(root, chordIntervals, [0, 2, 4]),
  };
}

function scaleItem(root: LearningRoot, mode: ScaleMode, fingers: FingeringPair): LearningItem {
  const intervals: Record<ScaleMode, number[]> = {
    major: MAJOR_INTERVALS,
    "natural-minor": NATURAL_MINOR_INTERVALS,
    "harmonic-minor": HARMONIC_MINOR_INTERVALS,
    "melodic-minor": MELODIC_MINOR_INTERVALS,
  };
  const scaleIntervals = intervals[mode];
  return {
    id: `scale:${root.id}:${mode}`,
    root,
    kind: "scale",
    quality: mode,
    label: `${root.label} ${scaleModeLabel(mode)}`,
    midiNotes: scaleIntervals.map((interval) => 60 + root.pitchClass + interval),
    writtenNotes: spellScale(root, scaleIntervals),
    rightFingering: [...fingers.right],
    leftFingering: [...fingers.left],
  };
}

function spellScale(root: LearningRoot, intervals: number[]): string[] {
  return spellIntervals(root, intervals, intervals.map((_, degree) => degree));
}

function spellIntervals(root: LearningRoot, intervals: number[], degrees: number[]): string[] {
  const rootStepIndex = STEPS.indexOf(root.step);
  return intervals.map((interval, index) => {
    const degree = degrees[index];
    const step = STEPS[(rootStepIndex + degree) % STEPS.length];
    const desiredPitchClass = (root.pitchClass + interval) % 12;
    const naturalPitchClass = NATURAL_PITCH_CLASS[step];
    let alter = desiredPitchClass - naturalPitchClass;
    if (alter > 6) alter -= 12;
    if (alter < -6) alter += 12;
    return `${step}${alter > 0 ? "♯".repeat(alter) : alter < 0 ? "♭".repeat(-alter) : ""}`;
  });
}

function scaleModeLabel(mode: ScaleMode): string {
  if (mode === "natural-minor") return "natural minor";
  if (mode === "harmonic-minor") return "harmonic minor";
  if (mode === "melodic-minor") return "melodic minor ascending";
  return "major";
}

function fingering(right: string, left: string): FingeringPair {
  return { right: digits(right), left: digits(left) };
}

function digits(value: string): FingerNumber[] {
  return [...value].map((digit) => Number(digit) as FingerNumber);
}
