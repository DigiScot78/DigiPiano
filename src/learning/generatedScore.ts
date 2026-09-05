import type { HandMode } from "./matcher";
import { CHORD_CATALOG, SCALE_CATALOG, learningItem, type LearningItem, type ScaleMode } from "./catalog";
import type { LoadedScore } from "../music/scoreTypes";

export interface GeneratedLearningScore { loadedScore: LoadedScore; handMode: HandMode }
type LessonPitch = { step: string; alter: number; octave: number };

const NATURAL_PITCH_CLASS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const MAJOR_FIFTHS: Record<string, number> = { C: 0, D: 2, E: 4, F: -1, G: 1, A: 3, B: 5 };
const MINOR_FIFTHS: Record<string, number> = { C: -3, D: -1, E: 1, F: -4, G: -2, A: 0, B: 2 };
const catalogById = new Map([...CHORD_CATALOG, ...SCALE_CATALOG].map((item) => [item.id, item]));

export function generateLearningScore(item: LearningItem): GeneratedLearningScore | undefined {
  if (!canGenerateLearningScore(item)) return undefined;
  return item.kind === "chord" ? chordScore(item) : scaleScore(item);
}

export function canGenerateLearningScore(item: LearningItem): boolean {
  const catalogItem = catalogById.get(item.id);
  return Boolean(catalogItem
    && catalogItem.kind === item.kind
    && catalogItem.root.id === item.root.id
    && catalogItem.quality === item.quality
    && arraysEqual(catalogItem.midiNotes, item.midiNotes)
    && arraysEqual(catalogItem.writtenNotes, item.writtenNotes)
    && (item.kind === "chord" || (arraysEqual(catalogItem.rightFingering, item.rightFingering) && arraysEqual(catalogItem.leftFingering, item.leftFingering))));
}

function chordScore(item: LearningItem): GeneratedLearningScore {
  const title = `${item.root.label} ${titleQuality(item.quality)} Chord Practice`;
  const fifths = keyFifthsForItem(item);
  const explicitAccidentals = usesNeutralTheoreticalSignature(item);
  const pitches = lessonPitches(item.writtenNotes, item.midiNotes);
  const measures = Array.from({ length: 4 }, (_, index) => `<measure number="${index + 1}">
    ${index === 0 ? attributes(fifths) : ""}
    ${pitches.map((pitch, pitchIndex) => pitchedNote(pitch, 8, "whole", 1, { chord: pitchIndex > 0, explicitAccidental: explicitAccidentals })).join("\n    ")}
    <backup><duration>8</duration></backup>
    ${restNote(8, "whole", 2)}
  </measure>`).join("\n");
  return result(title, `${item.root.id}-${item.quality}-chord-practice.musicxml`, "right", measures);
}

function scaleScore(item: LearningItem): GeneratedLearningScore {
  const title = `${item.root.label} ${titleQuality(item.quality)} Scale – Both Hands`;
  const fifths = keyFifthsForItem(item);
  const descendingItem = item.quality === "melodic-minor" ? learningItem(item.root.id, "scale", "natural-minor") ?? item : item;
  const explicitAccidentals = usesNeutralTheoreticalSignature(item);
  const measures = `${scaleMeasure(item, 1, true, fifths, explicitAccidentals)}\n${scaleMeasure(descendingItem, 2, false, fifths, explicitAccidentals)}`;
  return result(title, `${item.root.id}-${item.quality}-scale.musicxml`, "both", measures);
}

function scaleMeasure(item: LearningItem, number: number, ascending: boolean, fifths: number, explicitAccidentals: boolean): string {
  const right = scaleNotes(item, 1, 0, ascending, item.rightFingering ?? [], explicitAccidentals);
  const left = scaleNotes(item, 2, -12, ascending, item.leftFingering ?? [], explicitAccidentals);
  return `<measure number="${number}">
    ${number === 1 ? attributes(fifths) : ""}
    ${right}
    <backup><duration>8</duration></backup>
    ${left}
  </measure>`;
}

function scaleNotes(item: LearningItem, staff: 1 | 2, midiOffset: number, ascending: boolean, ascendingFingers: number[], explicitAccidentals: boolean): string {
  const pitches = lessonPitches(item.writtenNotes, item.midiNotes.map((note) => note + midiOffset));
  const orderedPitches = ascending ? pitches : pitches.slice(0, -1).reverse();
  const fingers = ascending ? ascendingFingers : ascendingFingers.slice(0, -1).reverse();
  return orderedPitches.map((pitch, index) => {
    const final = !ascending && index === orderedPitches.length - 1;
    return pitchedNote(pitch, final ? 2 : 1, final ? "quarter" : "eighth", staff, {
      finger: fingers[index],
      beam: final ? undefined : beamFor(index, orderedPitches.length - 1),
      explicitAccidental: explicitAccidentals,
    });
  }).join("\n    ");
}

function lessonPitches(writtenNotes: string[], midiNotes: number[]): LessonPitch[] {
  return writtenNotes.map((written, index) => lessonPitch(written, midiNotes[index]));
}

function lessonPitch(written: string, midiNote: number): LessonPitch {
  const step = written.charAt(0).toUpperCase();
  const accidentals = [...written.slice(1)];
  const alter = accidentals.reduce((sum, accidental) => sum + (accidental === "♯" ? 1 : accidental === "♭" ? -1 : 0), 0);
  const naturalPitchClass = NATURAL_PITCH_CLASS[step];
  if (naturalPitchClass === undefined || accidentals.some((accidental) => accidental !== "♯" && accidental !== "♭")) throw new Error(`Unsupported written Learning pitch: ${written}`);
  const octave = (midiNote - naturalPitchClass - alter) / 12 - 1;
  if (!Number.isInteger(octave)) throw new Error(`Written pitch ${written} does not match MIDI note ${midiNote}.`);
  return { step, alter, octave };
}

function beamFor(index: number, eighthCount: number): "begin" | "continue" | "end" {
  const groupIndex = index % 4;
  if (groupIndex === 0) return "begin";
  if (groupIndex === 3 || index === eighthCount - 1) return "end";
  return "continue";
}

function pitchedNote(pitch: LessonPitch, duration: number, type: string, staff: 1 | 2, options: { chord?: boolean; finger?: number; beam?: "begin" | "continue" | "end"; explicitAccidental?: boolean } = {}): string {
  const accidental = options.explicitAccidental ? accidentalElement(pitch.alter) : "";
  return `<note>${options.chord ? "<chord/>" : ""}<pitch><step>${pitch.step}</step>${pitch.alter ? `<alter>${pitch.alter}</alter>` : ""}<octave>${pitch.octave}</octave></pitch>${accidental}<duration>${duration}</duration><voice>${staff}</voice><type>${type}</type><staff>${staff}</staff>${options.beam ? `<beam number="1">${options.beam}</beam>` : ""}${options.finger ? `<notations><technical><fingering placement="${staff === 1 ? "above" : "below"}">${options.finger}</fingering></technical></notations>` : ""}</note>`;
}

function accidentalElement(alter: number): string {
  const values: Record<number, string> = { [-2]: "flat-flat", [-1]: "flat", 1: "sharp", 2: "double-sharp" };
  return values[alter] ? `<accidental>${values[alter]}</accidental>` : "";
}

function restNote(duration: number, type: string, staff: 1 | 2): string {
  return `<note><rest measure="yes"/><duration>${duration}</duration><voice>${staff}</voice><type>${type}</type><staff>${staff}</staff></note>`;
}

function attributes(fifths: number): string {
  return `<attributes><divisions>2</divisions><key><fifths>${fifths}</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>`;
}

function theoreticalFifths(item: LearningItem): number {
  const minor = item.quality === "minor" || item.quality === "diminished" || isMinorScale(item.quality);
  return (minor ? MINOR_FIFTHS : MAJOR_FIFTHS)[item.root.step] + item.root.alter * 7;
}

function keyFifthsForItem(item: LearningItem): number {
  const fifths = theoreticalFifths(item);
  return Math.abs(fifths) <= 7 ? fifths : 0;
}

function usesNeutralTheoreticalSignature(item: LearningItem): boolean { return Math.abs(theoreticalFifths(item)) > 7; }

function isMinorScale(quality: LearningItem["quality"]): quality is ScaleMode {
  return quality === "natural-minor" || quality === "harmonic-minor" || quality === "melodic-minor";
}

function titleQuality(quality: LearningItem["quality"]): string {
  const labels: Record<LearningItem["quality"], string> = { major: "Major", minor: "Minor", augmented: "Augmented", diminished: "Diminished", "natural-minor": "Natural Minor", "harmonic-minor": "Harmonic Minor", "melodic-minor": "Melodic Minor" };
  return labels[quality];
}

function arraysEqual<T>(left: T[] | undefined, right: T[] | undefined): boolean {
  if (!left || !right) return left === right;
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function result(title: string, fileName: string, handMode: HandMode, measures: string): GeneratedLearningScore {
  const xmlText = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>${title}</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">${measures}</part>
</score-partwise>`;
  return { loadedScore: { fileName, fileType: "musicxml", xmlText, info: { title, partCount: 1 } }, handMode };
}
