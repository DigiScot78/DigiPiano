import { RHYTHM_GRACE_MS, timedFoundationResult, type RhythmNoteStatus, type RhythmStrike, type TimedFoundationNote } from "./foundationRhythm";

export interface TimedFoundationRest { onset: number; beats: number }
export interface RestFeedback { status: "quiet" | "sound" }

export function foundationRestResult(notes: TimedFoundationNote[], rests: TimedFoundationRest[], strikes: RhythmStrike[]) {
  const noteResult = timedFoundationResult(notes, strikes);
  const restFeedback: RestFeedback[] = rests.map((rest) => {
    const start = rest.onset + RHYTHM_GRACE_MS;
    const end = rest.onset + rest.beats * 1000 - RHYTHM_GRACE_MS;
    const sounded = strikes.some((strike) => strike.at < end && (strike.releasedAt ?? Number.POSITIVE_INFINITY) > start);
    return { status: sounded ? "sound" : "quiet" };
  });
  const brokenRest = restFeedback.findIndex((rest) => rest.status === "sound");
  const passed = noteResult.passed && brokenRest < 0;
  return {
    passed,
    issue: noteResult.issue ?? (brokenRest >= 0 ? `Keep counting, but leave rest ${brokenRest + 1} silent.` : undefined),
    notes: noteResult.notes as { status: RhythmNoteStatus; message?: string }[],
    rests: restFeedback,
  };
}
