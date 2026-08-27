import { filterEventForHand, type HandMode, type ScoreSelectionRange } from "../learning/matcher";
import type { ScoreEvent, TempoChange } from "../music/scoreTypes";

export type PlaybackPhase = "idle" | "countdown" | "playing" | "waiting-restart";
export type AttemptResult = "correct" | "wrong";

export interface PlaybackEvent {
  eventIndex: number;
  event: ScoreEvent;
  onsetMs: number;
  endMs: number;
}
export interface PlaybackPlan { startQuarter: number; endQuarter: number; durationMs: number; events: PlaybackEvent[] }
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

export function shouldShowPerformanceResults(phase: PlaybackPhase, showHitsWhilePlaying: boolean): boolean {
  return phase !== "playing" || showHitsWhilePlaying;
}

export function missedPerformanceNotes(plan: PlaybackPlan | undefined, results: PerformanceResult[]): MissedPerformanceNote[] {
  if (!plan) return [];
  return plan.events.flatMap(({ event, eventIndex }) => event.midiNotes
    .filter((note) => !results.some((result) => result.result === "correct" && result.slotId === slotId(eventIndex, note)))
    .map((note) => ({ id: `${eventIndex}-${note}`, note, eventIndex, staffNumber: event.noteDetails.find((detail) => detail.midiNote === note)?.staffNumber })));
}

export function createPlaybackPlan(events: ScoreEvent[], tempoChanges: TempoChange[], fallbackBpm: number, handMode: HandMode, range?: ScoreSelectionRange): PlaybackPlan | undefined {
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
    onsetMs: millisecondsBetweenQuarters(startQuarter, event.startQuarter, tempoChanges, fallbackBpm),
    endMs: millisecondsBetweenQuarters(startQuarter, event.startQuarter + event.durationQuarters, tempoChanges, fallbackBpm),
  }));
  return { startQuarter, endQuarter, durationMs: millisecondsBetweenQuarters(startQuarter, endQuarter, tempoChanges, fallbackBpm), events: timedEvents };
}

export function millisecondsBetweenQuarters(fromQuarter: number, toQuarter: number, changes: TempoChange[], fallbackBpm: number): number {
  if (toQuarter <= fromQuarter) return 0;
  const sorted = [...changes].filter((change) => change.bpm > 0).sort((a, b) => a.quarter - b.quarter);
  let cursor = fromQuarter;
  let bpm = tempoAtQuarter(fromQuarter, sorted, fallbackBpm);
  let total = 0;
  for (const change of sorted) {
    if (change.quarter <= fromQuarter) continue;
    if (change.quarter >= toQuarter) break;
    total += (change.quarter - cursor) * 60_000 / bpm;
    cursor = change.quarter;
    bpm = change.bpm;
  }
  return total + (toQuarter - cursor) * 60_000 / bpm;
}

export function scoreQuarterAtElapsed(plan: PlaybackPlan, elapsedMs: number, changes: TempoChange[], fallbackBpm: number): number {
  const target = Math.min(Math.max(elapsedMs, 0), plan.durationMs);
  let low = plan.startQuarter;
  let high = plan.endQuarter;
  for (let index = 0; index < 32; index += 1) {
    const middle = (low + high) / 2;
    if (millisecondsBetweenQuarters(plan.startQuarter, middle, changes, fallbackBpm) < target) low = middle; else high = middle;
  }
  return (low + high) / 2;
}

export function activePlaybackEvent(plan: PlaybackPlan, elapsedMs: number): PlaybackEvent | undefined {
  return [...plan.events].reverse().find((event) => event.onsetMs <= elapsedMs);
}

export function activeExpectedNotes(plan: PlaybackPlan, elapsedMs: number): number[] {
  const active = plan.events.filter((event) => event.onsetMs <= elapsedMs && elapsedMs < event.endMs);
  return Array.from(new Set(active.flatMap((item) => item.event.midiNotes))).sort((a, b) => a - b);
}

export function scorePerformanceAttempt(playedNote: number, elapsedMs: number, playedAtMs: number, id: number, plan: PlaybackPlan, tempoChanges: TempoChange[], fallbackBpm: number, toleranceMs: number, existingResults: PerformanceResult[] = []): PerformanceResult | undefined {
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
    scoreQuarter: scoreQuarterAtElapsed(plan, elapsedMs, tempoChanges, fallbackBpm),
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
