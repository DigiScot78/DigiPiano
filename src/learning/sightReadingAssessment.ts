import { calculatePerformanceScore } from "../playback/performanceScore";
import type { PerformanceResult, PlaybackPlan } from "../playback/playback";

export interface SightReadingAssessment {
  score: number;
  noteAccuracy: number;
  continuity: number;
  notesRead: number;
  totalNotes: number;
  momentsPlayed: number;
  totalMoments: number;
  wrongNotes: number;
  missedNotes: number;
}

export function calculateSightReadingAssessment(plan: PlaybackPlan, results: readonly PerformanceResult[]): SightReadingAssessment {
  const accuracy = calculatePerformanceScore(plan, results, plan.durationMs, "play");
  const onsetByEvent = new Map(plan.events.map((event) => [event.eventIndex, event.onsetMs]));
  const allMoments = new Set(plan.events.map((event) => event.onsetMs));
  const attemptedMoments = new Set(results.map((result) => onsetByEvent.get(result.eventIndex)).filter((onset): onset is number => onset !== undefined));
  const continuity = allMoments.size === 0 ? 0 : Math.round(100 * attemptedMoments.size / allMoments.size);
  return {
    score: Math.round(accuracy.accuracyScore * 0.75 + continuity * 0.25),
    noteAccuracy: accuracy.accuracyScore,
    continuity,
    notesRead: accuracy.hits,
    totalNotes: accuracy.totalNotes,
    momentsPlayed: attemptedMoments.size,
    totalMoments: allMoments.size,
    wrongNotes: accuracy.badNotes,
    missedNotes: accuracy.misses,
  };
}
