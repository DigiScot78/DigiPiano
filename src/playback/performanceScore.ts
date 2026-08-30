import type { HandMode, ScoreSelectionRange } from "../learning/matcher";
import type { PerformanceResult, PlaybackPlan } from "./playback";
import type { PlayMode } from "./settings";

export interface PerformanceScore {
  score: number;
  totalNotes: number;
  hits: number;
  misses: number;
  badNotes: number;
  wrongPitches: number;
  mistimedNotes: number;
  hitRate: number;
  averageTimingErrorMs?: number;
}

export interface CompletedPerformance extends PerformanceScore {
  playMode: PlayMode;
  handMode: HandMode;
  tempoPercent: number;
  range?: ScoreSelectionRange;
}

export interface ExercisePerformanceHistory {
  attempts: number;
  last: CompletedPerformance;
  best: CompletedPerformance;
  averageScore: number;
  scoreTotal: number;
  totalNotes: number;
  hits: number;
  misses: number;
  badNotes: number;
}

export function calculatePerformanceScore(plan: PlaybackPlan, results: readonly PerformanceResult[]): PerformanceScore {
  const slots = new Set(plan.events.flatMap(({ event, eventIndex }) => event.midiNotes.map((note) => `${eventIndex}:${note}`)));
  const correct = results.filter((result) => result.result === "correct" && slots.has(result.slotId));
  const hits = new Set(correct.map((result) => result.slotId)).size;
  const totalNotes = slots.size;
  const misses = Math.max(0, totalNotes - hits);
  const badResults = results.filter((result) => result.result === "wrong");
  const badNotes = badResults.length;
  const wrongPitches = badResults.filter((result) => result.playedNote !== result.expectedNote).length;
  const mistimedNotes = badNotes - wrongPitches;
  const denominator = 2 * hits + misses + badNotes;
  const score = denominator === 0 ? 0 : Math.min(100, Math.max(0, Math.round(100 * 2 * hits / denominator)));
  const timingErrors = correct.map((result) => Math.abs(result.timingErrorMs ?? 0));
  return {
    score,
    totalNotes,
    hits,
    misses,
    badNotes,
    wrongPitches,
    mistimedNotes,
    hitRate: totalNotes === 0 ? 0 : Math.round(1000 * hits / totalNotes) / 10,
    ...(timingErrors.length ? { averageTimingErrorMs: Math.round(timingErrors.reduce((sum, value) => sum + value, 0) / timingErrors.length) } : {}),
  };
}

export function addPerformanceToHistory(current: ExercisePerformanceHistory | undefined, completed: CompletedPerformance): ExercisePerformanceHistory {
  if (!current) return { attempts: 1, last: completed, best: completed, averageScore: completed.score, scoreTotal: completed.score, totalNotes: completed.totalNotes, hits: completed.hits, misses: completed.misses, badNotes: completed.badNotes };
  const attempts = current.attempts + 1;
  const scoreTotal = current.scoreTotal + completed.score;
  return {
    attempts,
    last: completed,
    best: completed.score > current.best.score ? completed : current.best,
    averageScore: Math.round(scoreTotal / attempts),
    scoreTotal,
    totalNotes: current.totalNotes + completed.totalNotes,
    hits: current.hits + completed.hits,
    misses: current.misses + completed.misses,
    badNotes: current.badNotes + completed.badNotes,
  };
}

export function exercisePerformanceKey(scoreContent: string, fileName: string, range: ScoreSelectionRange | undefined, handMode: HandMode, playMode: PlayMode, tempoPercent = 100): string {
  let hash = 2166136261;
  for (let index = 0; index < scoreContent.length; index += 1) {
    hash ^= scoreContent.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const scope = range ? `${range.startIndex}-${range.endIndex}` : "full";
  return `${fileName}:${(hash >>> 0).toString(36)}:${scope}:${handMode}:${playMode}:${tempoPercent}`;
}
