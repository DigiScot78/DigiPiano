import type { HandMode } from "./matcher";
import type { LearningItem } from "./catalog";
import type { LoadedScore } from "../music/scoreTypes";

export interface GeneratedLearningScore {
  loadedScore: LoadedScore;
  handMode: HandMode;
}

type LessonPitch = { step: string; alter?: number; octaveOffset?: number };
type SupportedRoot = "c" | "d";

const ROOTS: Record<SupportedRoot, { label: string; fifths: number; scale: LessonPitch[]; chord: LessonPitch[] }> = {
  c: { label: "C", fifths: 0, scale: [{ step: "C" }, { step: "D" }, { step: "E" }, { step: "F" }, { step: "G" }, { step: "A" }, { step: "B" }, { step: "C", octaveOffset: 1 }], chord: [{ step: "C" }, { step: "E" }, { step: "G" }] },
  d: { label: "D", fifths: 2, scale: [{ step: "D" }, { step: "E" }, { step: "F", alter: 1 }, { step: "G" }, { step: "A" }, { step: "B" }, { step: "C", alter: 1, octaveOffset: 1 }, { step: "D", octaveOffset: 1 }], chord: [{ step: "D" }, { step: "F", alter: 1 }, { step: "A" }] },
};
const RIGHT_ASCENDING = [1, 2, 3, 1, 2, 3, 4, 5];
const RIGHT_DESCENDING = [4, 3, 2, 1, 3, 2, 1];
const LEFT_ASCENDING = [5, 4, 3, 2, 1, 3, 2, 1];
const LEFT_DESCENDING = [2, 3, 1, 2, 3, 4, 5];

export function generateLearningScore(item: LearningItem): GeneratedLearningScore | undefined {
  if (!canGenerateLearningScore(item)) return undefined;
  const root = item.root.id as SupportedRoot;
  return item.kind === "chord" ? chordScore(root) : scaleScore(root);
}

export function canGenerateLearningScore(item: LearningItem): boolean {
  return (item.root.id === "c" || item.root.id === "d") && item.quality === "major";
}

function chordScore(root: SupportedRoot): GeneratedLearningScore {
  const config = ROOTS[root];
  const title = `${config.label} Major Chord Practice`;
  const measures = Array.from({ length: 4 }, (_, index) => `<measure number="${index + 1}">
    ${index === 0 ? attributes(config.fifths) : ""}
    ${config.chord.map((pitch, pitchIndex) => pitchedNote(pitch, 4, 8, "whole", 1, { chord: pitchIndex > 0 })).join("\n    ")}
    <backup><duration>8</duration></backup>
    ${restNote(8, "whole", 2)}
  </measure>`).join("\n");
  return result(title, `${root}-major-chord-practice.musicxml`, "right", measures);
}

function scaleScore(root: SupportedRoot): GeneratedLearningScore {
  const config = ROOTS[root];
  const title = `${config.label} Major Scale – Both Hands`;
  const measureOne = scaleMeasure(config, 1, true);
  const measureTwo = scaleMeasure(config, 2, false);
  return result(title, `${root}-major-scale.musicxml`, "both", `${measureOne}\n${measureTwo}`);
}

function scaleMeasure(config: (typeof ROOTS)[SupportedRoot], number: number, ascending: boolean): string {
  const right = scaleNotes(config.scale, 1, 4, ascending, ascending ? RIGHT_ASCENDING : RIGHT_DESCENDING);
  const left = scaleNotes(config.scale, 2, 3, ascending, ascending ? LEFT_ASCENDING : LEFT_DESCENDING);
  return `<measure number="${number}">
    ${number === 1 ? attributes(config.fifths) : ""}
    ${right}
    <backup><duration>8</duration></backup>
    ${left}
  </measure>`;
}

function scaleNotes(scale: LessonPitch[], staff: 1 | 2, lowOctave: number, ascending: boolean, fingers: number[]): string {
  const pitches = ascending ? scale : scale.slice(0, -1).reverse();
  return pitches.map((pitch, index) => {
    const final = !ascending && index === pitches.length - 1;
    const octave = lowOctave + (pitch.octaveOffset ?? 0);
    return pitchedNote(pitch, octave, final ? 2 : 1, final ? "quarter" : "eighth", staff, {
      finger: fingers[index],
      beam: final ? undefined : beamFor(index, pitches.length - 1),
    });
  }).join("\n    ");
}

function beamFor(index: number, eighthCount: number): "begin" | "continue" | "end" {
  const groupIndex = index % 4;
  if (groupIndex === 0) return "begin";
  if (groupIndex === 3 || index === eighthCount - 1) return "end";
  return "continue";
}

function pitchedNote(pitch: LessonPitch, octave: number, duration: number, type: string, staff: 1 | 2, options: { chord?: boolean; finger?: number; beam?: "begin" | "continue" | "end" } = {}): string {
  return `<note>${options.chord ? "<chord/>" : ""}<pitch><step>${pitch.step}</step>${pitch.alter ? `<alter>${pitch.alter}</alter>` : ""}<octave>${octave}</octave></pitch><duration>${duration}</duration><voice>${staff}</voice><type>${type}</type><staff>${staff}</staff>${options.beam ? `<beam number="1">${options.beam}</beam>` : ""}${options.finger ? `<notations><technical><fingering placement="${staff === 1 ? "above" : "below"}">${options.finger}</fingering></technical></notations>` : ""}</note>`;
}

function restNote(duration: number, type: string, staff: 1 | 2, measure = true): string {
  return `<note><rest${measure ? " measure=\"yes\"" : ""}/><duration>${duration}</duration><voice>${staff}</voice><type>${type}</type><staff>${staff}</staff></note>`;
}

function attributes(fifths: number): string {
  return `<attributes><divisions>2</divisions><key><fifths>${fifths}</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>`;
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
