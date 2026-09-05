import type { HandMode } from "./matcher";
import type { LoadedScore } from "../music/scoreTypes";

export type SightReadingLevel = "beginner" | "developing" | "intermediate";
export type SightReadingHand = "right" | "left" | "both";
export type SightReadingLength = 4 | 8 | 12;
export type SightReadingTempo = 60 | 80 | 100 | 120;
export type SightReadingPreparation = 0 | 15 | 30 | 60;
export interface SightReadingOptions { level: SightReadingLevel; hand: SightReadingHand; measures: SightReadingLength; tempoBpm: SightReadingTempo; preparationSeconds: SightReadingPreparation }
export interface SightReadingExercise { loadedScore: LoadedScore; handMode: HandMode; options: SightReadingOptions }

const LEVELS = {
  beginner: { label: "Beginner", fifths: 0, right: [60, 62, 64, 65, 67], left: [48, 50, 52, 53, 55], rhythms: [[2, 2, 2, 2]] },
  developing: { label: "Developing", fifths: 0, right: [60, 62, 64, 65, 67, 69, 71, 72], left: [48, 50, 52, 53, 55, 57, 59, 60], rhythms: [[2, 2, 2, 2], [1, 1, 2, 2, 2], [2, 2, 1, 1, 2]] },
  intermediate: { label: "Intermediate", fifths: 1, right: [55, 57, 59, 60, 62, 64, 66, 67, 69, 71, 72, 74], left: [43, 45, 47, 48, 50, 52, 54, 55, 57, 59, 60, 62], rhythms: [[2, 2, 2, 2], [1, 1, 2, 1, 1, 2], [2, 1, 1, 2, 1, 1]] },
} as const;

export function generateSightReadingExercise(options: SightReadingOptions, seed = Date.now()): SightReadingExercise {
  const definition = LEVELS[options.level];
  let state = seed >>> 0;
  const random = () => ((state = Math.imul(state ^ state >>> 15, 1 | state) + 0x6d2b79f5 | 0), ((state ^ state >>> 14) >>> 0) / 4294967296);
  const staffNotes = (staff: 1 | 2) => {
    const pitches = staff === 1 ? definition.right : definition.left;
    const rhythm = definition.rhythms[Math.floor(random() * definition.rhythms.length)];
    return rhythm.map((duration) => noteXml(pitches[Math.floor(random() * pitches.length)], duration, staff)).join("");
  };
  const measures = Array.from({ length: options.measures }, (_, measure) => {
    const right = options.hand === "left" ? restXml(1) : staffNotes(1);
    const left = options.hand === "right" ? restXml(2) : staffNotes(2);
    const setup = measure === 0 ? `<attributes><divisions>2</divisions><key><fifths>${definition.fifths}</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes><direction print-object="no"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${options.tempoBpm}</per-minute></metronome></direction-type><sound tempo="${options.tempoBpm}"/></direction>` : "";
    const finalBarline = measure === options.measures - 1 ? `<barline location="right"><bar-style>light-heavy</bar-style></barline>` : "";
    return `<measure number="${measure + 1}">${setup}${right}<backup><duration>8</duration></backup>${left}${finalBarline}</measure>`;
  }).join("");
  const handLabel = options.hand === "both" ? "Both Hands" : options.hand === "left" ? "Left Hand" : "Right Hand";
  const title = `${definition.label} Sight Reading · ${handLabel}`;
  const xmlText = `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><work><work-title>${title}</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${measures}</part></score-partwise>`;
  return { options, handMode: options.hand, loadedScore: { fileName: `sight-reading-${options.level}-${options.hand}-${seed}.musicxml`, fileType: "musicxml", xmlText, info: { title, subtitle: `${options.measures} measures · ${options.tempoBpm} BPM · One-look exercise`, partCount: 1 } } };
}

function noteXml(midi: number, duration: number, staff: 1 | 2): string {
  const names = [["C", 0], ["C", 1], ["D", 0], ["D", 1], ["E", 0], ["F", 0], ["F", 1], ["G", 0], ["G", 1], ["A", 0], ["A", 1], ["B", 0]] as const;
  const [step, alter] = names[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `<note><pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ""}<octave>${octave}</octave></pitch><duration>${duration}</duration><voice>${staff}</voice><type>${duration === 1 ? "eighth" : "quarter"}</type><staff>${staff}</staff></note>`;
}

function restXml(staff: 1 | 2): string { return `<note><rest measure="yes"/><duration>8</duration><voice>${staff}</voice><type>whole</type><staff>${staff}</staff></note>`; }
