import { filterEventForHand, type HandMode, type ScoreSelectionRange } from "../learning/matcher";
import type { MeasureTiming, ScoreEvent, TempoChange } from "../music/scoreTypes";
import type { PlayMode } from "./settings";

export type PlaybackPhase = "idle" | "countdown" | "playing" | "paused" | "waiting-note" | "waiting-restart";
export type AttemptResult = "correct" | "wrong";

export interface PlaybackEvent {
  eventIndex: number;
  event: ScoreEvent;
  onsetMs: number;
  endMs: number;
  noteEndMs?: number[];
}
export interface MetronomeBeat { id: string; onsetMs: number; scoreQuarter: number; accent: boolean }
export interface VisualPlayheadAnchor { quarter: number; kind: "note" | "rest"; eventIndex?: number }
export interface CountInBeat { id: string; onsetMs: number; bar: number; beat: number; beatsPerBar: number; accent: boolean }
export interface CountInPlan { durationMs: number; beats: CountInBeat[] }
export interface PlaybackPlan { startQuarter: number; endQuarter: number; durationMs: number; events: PlaybackEvent[]; metronomeBeats?: MetronomeBeat[] }
export interface PlaybackGate {
  onsetMs: number;
  eventIndices: number[];
  expectedNotes: number[];
  satisfiedNotes: number[];
  arpeggioNotes?: number[];
  lastArpeggioAtMs?: number;
}
export interface PerformanceResult {
  id: number;
  slotId: string;
  expectedNote: number;
  playedNote: number;
  playedAtMs: number;
  scoreQuarter: number;
  eventIndex: number;
  timingErrorMs?: number;
  staffNumber?: number;
  result: AttemptResult;
}
export interface MissedPerformanceNote { id: string; note: number; eventIndex: number; staffNumber?: number }
export interface CompletedPlaybackRun { id: number; plan: PlaybackPlan; results: PerformanceResult[]; activeDurationMs: number; idealDurationMs: number; playMode: PlayMode; handMode: HandMode; tempoPercent: number; range?: ScoreSelectionRange }

export function countInDisplayValue(beat: Pick<CountInBeat, "beat" | "beatsPerBar">): number {
  return beat.beatsPerBar - beat.beat + 1;
}

export function shouldShowPerformanceResults(phase: PlaybackPhase, showHitsWhilePlaying: boolean): boolean {
  return (phase !== "playing" && phase !== "waiting-note") || showHitsWhilePlaying;
}

export function missedPerformanceNotes(plan: PlaybackPlan | undefined, results: PerformanceResult[]): MissedPerformanceNote[] {
  if (!plan) return [];
  return plan.events.flatMap(({ event, eventIndex }) => event.midiNotes
    .filter((note) => !results.some((result) => result.result === "correct" && result.slotId === slotId(eventIndex, note)))
    .map((note) => ({ id: `${eventIndex}-${note}`, note, eventIndex, staffNumber: event.noteDetails.find((detail) => detail.midiNote === note)?.staffNumber })));
}

export function createPlaybackPlan(events: ScoreEvent[], tempoChanges: TempoChange[], fallbackBpm: number, handMode: HandMode, range?: ScoreSelectionRange, measureTimings: MeasureTiming[] = [], tempoPercent = 100): PlaybackPlan | undefined {
  const startIndex = range?.startIndex ?? 0;
  const endIndex = range?.endIndex ?? events.length - 1;
  const playable = events.map((event, eventIndex) => ({ event: filterEventForHand(event, handMode), eventIndex }))
    .filter((item): item is { event: ScoreEvent; eventIndex: number } => item.eventIndex >= startIndex && item.eventIndex <= endIndex && Boolean(item.event?.midiNotes.length));
  if (playable.length === 0) return undefined;
  const startQuarter = playable[0].event.startQuarter;
  const endQuarter = Math.max(...playable.map(({ event }) => event.startQuarter + event.durationQuarters));
  const timedEvents = playable.map(({ event, eventIndex }) => ({
    eventIndex,
    event,
    onsetMs: millisecondsBetweenQuarters(startQuarter, event.startQuarter, tempoChanges, fallbackBpm, tempoPercent),
    endMs: millisecondsBetweenQuarters(startQuarter, event.startQuarter + event.durationQuarters, tempoChanges, fallbackBpm, tempoPercent),
    noteEndMs: event.noteDetails.map((note) => millisecondsBetweenQuarters(startQuarter, event.startQuarter + (note.durationQuarters ?? event.durationQuarters), tempoChanges, fallbackBpm, tempoPercent)),
  }));
  const durationMs = millisecondsBetweenQuarters(startQuarter, endQuarter, tempoChanges, fallbackBpm, tempoPercent);
  const basePlan = { startQuarter, endQuarter, durationMs, events: timedEvents };
  return { ...basePlan, metronomeBeats: metronomeBeatsForRange(basePlan, measureTimings, tempoChanges, fallbackBpm, tempoPercent) };
}

export function playbackPlanFromElapsed(plan: PlaybackPlan, startElapsedMs: number): PlaybackPlan {
  const start = Math.min(Math.max(startElapsedMs, 0), plan.durationMs);
  const scopedEvents = plan.events.filter((event) => event.onsetMs >= start - 0.001);
  const startQuarter = scopedEvents[0]?.event.startQuarter ?? plan.endQuarter;
  return {
    startQuarter,
    endQuarter: plan.endQuarter,
    durationMs: Math.max(0, plan.durationMs - start),
    events: scopedEvents
      .map((event) => ({
        ...event,
        onsetMs: event.onsetMs - start,
        endMs: event.endMs - start,
        ...(event.noteEndMs ? { noteEndMs: event.noteEndMs.map((endMs) => endMs - start) } : {}),
      })),
    ...(plan.metronomeBeats ? { metronomeBeats: plan.metronomeBeats
      .filter((beat) => beat.onsetMs >= start - 0.001)
      .map((beat) => ({ ...beat, onsetMs: beat.onsetMs - start })) } : {}),
  };
}

export function millisecondsBetweenQuarters(fromQuarter: number, toQuarter: number, changes: TempoChange[], fallbackBpm: number, tempoPercent = 100): number {
  if (toQuarter <= fromQuarter) return 0;
  const sorted = [...changes].filter((change) => change.bpm > 0).sort((a, b) => a.quarter - b.quarter);
  let cursor = fromQuarter;
  const scale = Math.min(200, Math.max(40, tempoPercent)) / 100;
  let bpm = tempoAtQuarter(fromQuarter, sorted, fallbackBpm) * scale;
  let total = 0;
  for (const change of sorted) {
    if (change.quarter <= fromQuarter) continue;
    if (change.quarter >= toQuarter) break;
    total += (change.quarter - cursor) * 60_000 / bpm;
    cursor = change.quarter;
    bpm = change.bpm * scale;
  }
  return total + (toQuarter - cursor) * 60_000 / bpm;
}

export function scoreQuarterAtElapsed(plan: PlaybackPlan, elapsedMs: number, changes: TempoChange[], fallbackBpm: number, tempoPercent = 100): number {
  const target = Math.min(Math.max(elapsedMs, 0), plan.durationMs);
  let low = plan.startQuarter;
  let high = plan.endQuarter;
  for (let index = 0; index < 32; index += 1) {
    const middle = (low + high) / 2;
    if (millisecondsBetweenQuarters(plan.startQuarter, middle, changes, fallbackBpm, tempoPercent) < target) low = middle; else high = middle;
  }
  return (low + high) / 2;
}

export function activePlaybackEvent(plan: PlaybackPlan, elapsedMs: number): PlaybackEvent | undefined {
  return [...plan.events].reverse().find((event) => event.onsetMs <= elapsedMs);
}

export function visualPlayheadAnchor(plan: PlaybackPlan, elapsedMs: number): VisualPlayheadAnchor {
  const anchors = [
    ...plan.events.map((item) => ({ onsetMs: item.onsetMs, quarter: item.event.startQuarter, kind: "note" as const, eventIndex: item.eventIndex, priority: 1 })),
    ...(plan.metronomeBeats ?? []).map((beat) => ({ onsetMs: beat.onsetMs, quarter: beat.scoreQuarter, kind: "rest" as const, priority: 0 })),
  ].sort((a, b) => a.onsetMs - b.onsetMs || a.priority - b.priority);
  const active = [...anchors].reverse().find((anchor) => anchor.onsetMs <= elapsedMs + 0.001);
  return active ? { quarter: active.quarter, kind: active.kind, ...("eventIndex" in active ? { eventIndex: active.eventIndex } : {}) } : { quarter: plan.startQuarter, kind: "note", eventIndex: plan.events[0]?.eventIndex };
}

export function activeExpectedNotes(plan: PlaybackPlan, elapsedMs: number): number[] {
  const active = plan.events.filter((event) => event.onsetMs <= elapsedMs && elapsedMs < event.endMs);
  return Array.from(new Set(active.flatMap((item) => item.event.midiNotes))).sort((a, b) => a - b);
}

export function gatePreviewStartMs(plan: PlaybackPlan, gate: PlaybackGate, tempoChanges: TempoChange[], fallbackBpm: number, tempoPercent = 100): number {
  const gateEvent = plan.events.find((item) => gate.eventIndices.includes(item.eventIndex));
  if (!gateEvent) return gate.onsetMs;
  const previewQuarter = Math.max(plan.startQuarter, gateEvent.event.startQuarter - 1);
  return millisecondsBetweenQuarters(plan.startQuarter, previewQuarter, tempoChanges, fallbackBpm, tempoPercent);
}

export function effectiveTempoAtQuarter(quarter: number, changes: TempoChange[], fallbackBpm: number, tempoPercent = 100): number {
  const sorted = [...changes].filter((change) => change.bpm > 0).sort((a, b) => a.quarter - b.quarter);
  return tempoAtQuarter(quarter, sorted, fallbackBpm) * Math.min(200, Math.max(40, tempoPercent)) / 100;
}

export function groupedBeatsPerBar(beats: number, beatType: number): number {
  return beatType === 8 && beats >= 6 && beats % 3 === 0 ? beats / 3 : beats;
}

export function beatLengthQuarters(beats: number, beatType: number): number {
  return (4 / beatType) * (beatType === 8 && beats >= 6 && beats % 3 === 0 ? 3 : 1);
}

export function createCountInPlan(targetElapsedMs: number, targetQuarter: number, bars: 0 | 1 | 2, measures: MeasureTiming[], changes: TempoChange[], fallbackBpm: number, tempoPercent = 100): CountInPlan {
  if (bars === 0) return { durationMs: 0, beats: [] };
  const meter = [...measures].reverse().find((measure) => measure.startQuarter <= targetQuarter + 0.001) ?? { beats: 4, beatType: 4 };
  const beatsPerBar = groupedBeatsPerBar(meter.beats, meter.beatType);
  const beatMs = beatLengthQuarters(meter.beats, meter.beatType) * 60_000 / effectiveTempoAtQuarter(targetQuarter, changes, fallbackBpm, tempoPercent);
  const totalBeats = beatsPerBar * bars;
  const durationMs = totalBeats * beatMs;
  return {
    durationMs,
    beats: Array.from({ length: totalBeats }, (_, index) => ({
      id: `count-in:${targetElapsedMs}:${index}`,
      onsetMs: targetElapsedMs - durationMs + index * beatMs,
      bar: Math.floor(index / beatsPerBar) + 1,
      beat: index % beatsPerBar + 1,
      beatsPerBar,
      accent: index % beatsPerBar === 0,
    })),
  };
}

function metronomeBeatsForRange(plan: Pick<PlaybackPlan, "startQuarter" | "endQuarter">, measures: MeasureTiming[], changes: TempoChange[], fallbackBpm: number, tempoPercent: number): MetronomeBeat[] {
  const relevant = measures.length ? measures : [{ index: 0, measureNumber: 1, startQuarter: plan.startQuarter, endQuarter: plan.endQuarter, beats: 4, beatType: 4 }];
  const beats: MetronomeBeat[] = [];
  for (const measure of relevant) {
    if (measure.endQuarter < plan.startQuarter - 0.001 || measure.startQuarter > plan.endQuarter + 0.001) continue;
    const step = beatLengthQuarters(measure.beats, measure.beatType);
    const expectedEnd = measure.startQuarter + measure.beats * 4 / measure.beatType;
    const measureEnd = measure.endQuarter > measure.startQuarter + 0.001 ? measure.endQuarter : expectedEnd;
    for (let beat = 0, quarter = measure.startQuarter; quarter < measureEnd - 0.001; beat += 1, quarter = measure.startQuarter + beat * step) {
      if (quarter < plan.startQuarter - 0.001 || quarter > plan.endQuarter + 0.001) continue;
      beats.push({ id: `beat:${measure.index}:${beat}`, scoreQuarter: quarter, onsetMs: millisecondsBetweenQuarters(plan.startQuarter, quarter, changes, fallbackBpm, tempoPercent), accent: beat === 0 });
    }
  }
  return beats.sort((a, b) => a.onsetMs - b.onsetMs);
}

export function playbackGates(plan: PlaybackPlan): PlaybackGate[] {
  const grouped = new Map<number, PlaybackEvent[]>();
  for (const event of plan.events) {
    const existing = grouped.get(event.onsetMs) ?? [];
    existing.push(event);
    grouped.set(event.onsetMs, existing);
  }
  return Array.from(grouped, ([onsetMs, events]) => {
    const marked = events.flatMap((item) => item.event.noteDetails).filter((detail) => detail.arpeggio);
    const direction = marked[0]?.arpeggio?.direction ?? "up";
    const arpeggioNotes = Array.from(new Set(marked.map((detail) => detail.midiNote))).sort((a, b) => direction === "down" ? b - a : a - b);
    return {
      onsetMs,
      eventIndices: events.map((item) => item.eventIndex),
      expectedNotes: Array.from(new Set(events.flatMap((item) => item.event.midiNotes))).sort((a, b) => a - b),
      satisfiedNotes: [],
      ...(arpeggioNotes.length < 2 ? {} : { arpeggioNotes }),
    };
  }).sort((a, b) => a.onsetMs - b.onsetMs);
}

export function scorePerformanceAttempt(playedNote: number, elapsedMs: number, playedAtMs: number, id: number, plan: PlaybackPlan, tempoChanges: TempoChange[], fallbackBpm: number, toleranceMs: number, existingResults: PerformanceResult[] = [], tempoPercent = 100): PerformanceResult | undefined {
  const nearest = [...plan.events].sort((a, b) => Math.abs(a.onsetMs - elapsedMs) - Math.abs(b.onsetMs - elapsedMs))[0];
  if (!nearest) return undefined;
  const nearestEvents = plan.events.filter((item) => Math.abs(item.onsetMs - nearest.onsetMs) < 0.001);
  const slots = nearestEvents.flatMap((item) => item.event.midiNotes.map((expectedNote) => ({ item, expectedNote })));
  const exact = slots.find(({ expectedNote }) => expectedNote === playedNote);
  const target = exact ?? slots.sort((a, b) => Math.abs(a.expectedNote - playedNote) - Math.abs(b.expectedNote - playedNote))[0];
  if (!target) return undefined;
  const timingErrorMs = elapsedMs - target.item.onsetMs;
  const isCorrect = exact !== undefined && Math.abs(timingErrorMs) <= toleranceMs;
  const expectedSlotId = slotId(target.item.eventIndex, target.expectedNote);
  if (isCorrect && existingResults.some((result) => result.result === "correct" && result.slotId === expectedSlotId)) return undefined;
  const detail = target.item.event.noteDetails.find((item) => item.midiNote === target.expectedNote);
  return {
    id,
    slotId: isCorrect ? expectedSlotId : `mistake:${id}`,
    expectedNote: target.expectedNote,
    playedNote,
    playedAtMs,
    scoreQuarter: scoreQuarterAtElapsed(plan, elapsedMs, tempoChanges, fallbackBpm, tempoPercent),
    eventIndex: target.item.eventIndex,
    timingErrorMs,
    staffNumber: detail?.staffNumber,
    result: isCorrect ? "correct" : "wrong",
  };
}

function slotId(eventIndex: number, note: number): string { return `${eventIndex}:${note}`; }

function tempoAtQuarter(quarter: number, changes: TempoChange[], fallback: number): number {
  return [...changes].reverse().find((change) => change.quarter <= quarter)?.bpm ?? fallback;
}
