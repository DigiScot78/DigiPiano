import type { CompletedPerformance } from "../playback/performanceScore";
import { calculatePerformanceScore } from "../playback/performanceScore";
import type { CompletedPlaybackRun, PlaybackEvent } from "../playback/playback";
import {
  ATTEMPT_SCORING_VERSION,
  DOMAIN_SCHEMA_VERSION,
  SCORE_ANCHOR_SCHEMA_VERSION,
  type AttemptSummaryDto,
  type PracticeMode,
  type ScoreAnchorDto,
} from "./domain";

export interface BuildAttemptSummaryInput {
  completedRun: CompletedPlaybackRun;
  scoreVersionId: string;
  attemptId: string;
  idempotencyKey: string;
  startedAt: string;
  completedAt: string;
}

function anchorFromPlaybackEvent(scoreVersionId: string, item: PlaybackEvent): ScoreAnchorDto {
  const detail = item.event.noteDetails[0];
  return {
    schemaVersion: SCORE_ANCHOR_SCHEMA_VERSION,
    scoreVersionId,
    partId: item.event.partId,
    measureNumber: item.event.measureNumber,
    absoluteQuarter: item.event.startQuarter,
    staffNumber: detail?.staffNumber ?? item.event.staffNumbers[0] ?? 1,
    ...(detail?.voiceNumber ? { voiceNumber: detail.voiceNumber } : {}),
    ...(detail?.sourceNoteId ? { sourceNoteId: detail.sourceNoteId } : {}),
    cachedEventIndex: item.eventIndex,
  };
}

function durableMode(mode: CompletedPlaybackRun["playMode"]): PracticeMode {
  return mode === "pause-each-note" ? "pause-at-each-note" : mode;
}

export function buildAttemptSummary(input: BuildAttemptSummaryInput): { summary: AttemptSummaryDto; performance: CompletedPerformance } {
  const { completedRun } = input;
  const calculated = calculatePerformanceScore(completedRun.plan, completedRun.results, completedRun.activeDurationMs, completedRun.playMode);
  const firstEvent = completedRun.plan.events[0];
  const lastEvent = completedRun.plan.events.at(-1);
  const scope = {
    scoreVersionId: input.scoreVersionId,
    ...(firstEvent ? { start: anchorFromPlaybackEvent(input.scoreVersionId, firstEvent) } : {}),
    ...(lastEvent ? { end: anchorFromPlaybackEvent(input.scoreVersionId, lastEvent) } : {}),
  };
  const summary: AttemptSummaryDto = {
    schemaVersion: DOMAIN_SCHEMA_VERSION,
    scoringVersion: ATTEMPT_SCORING_VERSION,
    idempotencyKey: input.idempotencyKey,
    attemptId: input.attemptId,
    scope,
    hand: completedRun.handMode,
    mode: durableMode(completedRun.playMode),
    tempoPercent: completedRun.tempoPercent,
    ...calculated,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
  };
  const performance: CompletedPerformance = {
    ...calculated,
    playMode: completedRun.playMode,
    handMode: completedRun.handMode,
    tempoPercent: completedRun.tempoPercent,
    ...(completedRun.range ? { range: completedRun.range } : {}),
  };
  return { summary, performance };
}

export function localScoreVersionId(scoreContent: string): string {
  let hash = 2166136261;
  for (let index = 0; index < scoreContent.length; index += 1) {
    hash ^= scoreContent.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `local-v1-${(hash >>> 0).toString(36)}`;
}
