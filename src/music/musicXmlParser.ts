import { pitchToMidi } from "./note";
import type { ParsedScore, ScoreEvent, ScoreEventNote } from "./scoreTypes";
import { parseXml } from "./musicXmlLoader";

interface PartCursorState {
  currentQuarter: number;
  lastStartByVoice: Map<string, number>;
  measureStartQuarter: number;
  keyFifths: number;
}

interface ParsedPitch {
  midiNote: number;
  step: string;
  alter: number;
  octave: number;
}

interface PendingEvent {
  id: string;
  partId: string;
  measureNumber: number;
  startQuarter: number;
  measureStartQuarter: number;
  durationQuarters: number;
  noteDetails: ScoreEventNote[];
  staffNumbers: Set<number>;
  voiceNumbers: Set<string>;
  sourceNoteIds: string[];
  keyFifths?: number;
  isRest?: boolean;
}

export function parseMusicXmlTimeline(xmlText: string): ParsedScore {
  const doc = parseXml(xmlText, "MusicXML score");
  const warnings = collectGlobalWarnings(doc);
  const events = new Map<string, PendingEvent>();

  for (const part of Array.from(doc.querySelectorAll("score-partwise > part, part"))) {
    const partId = part.getAttribute("id") ?? "part";
    const state: PartCursorState = {
      currentQuarter: 0,
      lastStartByVoice: new Map(),
      measureStartQuarter: 0,
      keyFifths: 0,
    };
    let divisions = 1;
    let measureIndex = 0;

    for (const measure of directChildren(part, "measure")) {
      measureIndex += 1;
      const measureNumber = Number(measure.getAttribute("number")) || measureIndex;
      state.measureStartQuarter = state.currentQuarter;

      for (const child of Array.from(measure.children)) {
        switch (child.localName) {
          case "attributes": {
            const nextDivisions = numberText(child.querySelector("divisions"));
            if (nextDivisions && nextDivisions > 0) {
              divisions = nextDivisions;
            }
            const nextKeyFifths = numberText(child.querySelector("key > fifths"));
            if (nextKeyFifths !== undefined) {
              state.keyFifths = nextKeyFifths;
            }
            break;
          }
          case "backup": {
            state.currentQuarter -= durationFromElement(child, divisions);
            break;
          }
          case "forward": {
            state.currentQuarter += durationFromElement(child, divisions);
            break;
          }
          case "note": {
            handleNote(child, {
              partId,
              measureNumber,
              divisions,
              state,
              events,
              warnings,
            });
            break;
          }
          case "barline": {
            const repeatDirection = child.querySelector("repeat")?.getAttribute("direction");
            if (repeatDirection) {
              warnings.push(`Measure ${measureNumber}: written repeat '${repeatDirection}' detected; repeat expansion is deferred.`);
            }
            break;
          }
          default:
            break;
        }
      }

      if (state.currentQuarter < state.measureStartQuarter) {
        warnings.push(`Measure ${measureNumber}: timeline moved before the measure start after backup/forward processing.`);
      }
    }
  }

  const normalized = Array.from(events.values())
    .filter((event) => event.noteDetails.length > 0 || event.isRest)
    .map(toScoreEvent)
    .sort((a, b) => a.startQuarter - b.startQuarter || a.measureNumber - b.measureNumber || a.id.localeCompare(b.id));

  return {
    events: normalized.filter((event) => !event.isRest),
    warnings,
  };
}

function handleNote(
  note: Element,
  context: {
    partId: string;
    measureNumber: number;
    divisions: number;
    state: PartCursorState;
    events: Map<string, PendingEvent>;
    warnings: string[];
  },
): void {
  const durationQuarters = durationFromElement(note, context.divisions);
  const voice = text(note.querySelector("voice")) ?? "1";
  const staff = numberText(note.querySelector("staff")) ?? 1;
  const voiceKey = `${context.partId}:${staff}:${voice}`;
  const isChordMember = note.querySelector(":scope > chord") !== null;
  const startQuarter = isChordMember
    ? context.state.lastStartByVoice.get(voiceKey) ?? context.state.currentQuarter
    : context.state.currentQuarter;

  if (!isChordMember) {
    context.state.lastStartByVoice.set(voiceKey, startQuarter);
  }

  const isRest = note.querySelector(":scope > rest") !== null;
  const isTiedStop = Array.from(note.querySelectorAll(":scope > tie, :scope > notations > tied")).some(
    (tie) => tie.getAttribute("type") === "stop",
  );
  const isTiedStart = Array.from(note.querySelectorAll(":scope > tie, :scope > notations > tied")).some(
    (tie) => tie.getAttribute("type") === "start",
  );

  if (isTiedStop && !isTiedStart) {
    if (!isChordMember) {
      context.state.currentQuarter += durationQuarters;
    }
    return;
  }

  const pitch = isRest ? null : pitchFromNote(note, context.warnings, context.measureNumber);
  const eventKey = `${context.partId}:${context.measureNumber}:${round(startQuarter)}`;
  const event = getOrCreateEvent(context.events, eventKey, {
    id: eventKey,
    partId: context.partId,
    measureNumber: context.measureNumber,
    startQuarter,
    measureStartQuarter: context.state.measureStartQuarter,
    durationQuarters,
    noteDetails: [],
    staffNumbers: new Set<number>(),
    voiceNumbers: new Set<string>(),
    sourceNoteIds: [],
    keyFifths: context.state.keyFifths,
    isRest,
  });

  const sourceNoteId = note.getAttribute("default-x") ?? `${context.measureNumber}:${event.sourceNoteIds.length}`;
  event.durationQuarters = Math.max(event.durationQuarters, durationQuarters);
  event.staffNumbers.add(staff);
  event.voiceNumbers.add(voice);
  event.sourceNoteIds.push(sourceNoteId);
  if (pitch !== null) {
    event.noteDetails.push({
      midiNote: pitch.midiNote,
      staffNumber: staff,
      voiceNumber: voice,
      sourceNoteId,
      pitchStep: pitch.step,
      pitchAlter: pitch.alter,
      pitchOctave: pitch.octave,
    });
  }

  if (!isChordMember) {
    context.state.currentQuarter += durationQuarters;
  }
}

function pitchFromNote(note: Element, warnings: string[], measureNumber: number): ParsedPitch | null {
  const pitch = note.querySelector(":scope > pitch");
  if (!pitch) {
    warnings.push(`Measure ${measureNumber}: non-rest note without pitch was skipped.`);
    return null;
  }

  const step = text(pitch.querySelector("step"));
  const octave = numberText(pitch.querySelector("octave"));
  const alter = numberText(pitch.querySelector("alter")) ?? 0;
  if (!step || octave === undefined) {
    warnings.push(`Measure ${measureNumber}: pitch without step or octave was skipped.`);
    return null;
  }

  return {
    midiNote: pitchToMidi(step, alter, octave),
    step: step.toUpperCase(),
    alter,
    octave,
  };
}

function collectGlobalWarnings(doc: XMLDocument): string[] {
  const warnings: string[] = [];
  if (doc.querySelector("sound[segno], sound[coda], direction sound[time-only]")) {
    warnings.push("Advanced playback navigation markings were detected and are not expanded in this PoC.");
  }
  if (doc.querySelector("repeat")) {
    warnings.push("Written repeats are detected but the first PoC follows printed measure order only.");
  }
  return warnings;
}

function getOrCreateEvent(events: Map<string, PendingEvent>, key: string, initial: PendingEvent): PendingEvent {
  const existing = events.get(key);
  if (existing) {
    return existing;
  }
  events.set(key, initial);
  return initial;
}

function toScoreEvent(event: PendingEvent): ScoreEvent {
  return {
    id: event.id,
    partId: event.partId,
    measureNumber: event.measureNumber,
    startQuarter: event.startQuarter,
    measureStartQuarter: event.measureStartQuarter,
    durationQuarters: event.durationQuarters,
    midiNotes: uniqueSorted(event.noteDetails.map((note) => note.midiNote)),
    staffNumbers: uniqueSorted(Array.from(event.staffNumbers)),
    voiceNumbers: Array.from(event.voiceNumbers).sort(),
    sourceNoteIds: event.sourceNoteIds,
    noteDetails: event.noteDetails,
    keyFifths: event.keyFifths,
    isRest: event.isRest,
  };
}

function durationFromElement(element: Element, divisions: number): number {
  const duration = numberText(element.querySelector("duration")) ?? 0;
  return duration / divisions;
}

function directChildren(parent: Element, localName: string): Element[] {
  return Array.from(parent.children).filter((child) => child.localName === localName);
}

function numberText(element: Element | null): number | undefined {
  const value = element?.textContent?.trim();
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function text(element: Element | null): string | undefined {
  const value = element?.textContent?.trim();
  return value ? value : undefined;
}

function uniqueSorted(values: number[]): number[] {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

function round(value: number): string {
  return value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}
