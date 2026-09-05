import { RHYTHM_GRACE_MS, type RhythmNoteFeedback, type RhythmStrike } from "./foundationRhythm";
import type { TimedFoundationRest, RestFeedback } from "./foundationRests";

export interface TimedFoundationEvent { midiNotes: number[]; beats: number; onset: number }

export function foundationPieceResult(events: TimedFoundationEvent[], rests: TimedFoundationRest[], strikes: RhythmStrike[]) {
  const used = new Set<number>();
  const notes: RhythmNoteFeedback[] = events.map((event) => {
    const matched = event.midiNotes.map((midi) => strikes.findIndex((strike, index) => !used.has(index) && strike.note === midi && Math.abs(strike.at - event.onset) <= RHYTHM_GRACE_MS));
    if (matched.some((index) => index < 0)) return { status: "missed", message: event.midiNotes.length > 1 ? "Play both written notes together with the beat." : "Play the written note with the beat." };
    matched.forEach((index) => used.add(index));
    const end = event.onset + event.beats * 1000;
    const releases = matched.map((index) => strikes[index].releasedAt);
    if (releases.some((release) => release !== undefined && release < end - RHYTHM_GRACE_MS)) return { status: "early", message: event.midiNotes.length > 1 ? "One of the ending notes was released early." : "Released early — give this note its full value." };
    if (releases.some((release) => release === undefined || release > end + RHYTHM_GRACE_MS)) return { status: "late", message: event.midiNotes.length > 1 ? "Release both ending notes together at the rest." : "Held too long — release at the end of the note." };
    return { status: "correct" };
  });
  const restFeedback: RestFeedback[] = rests.map((rest) => {
    const start = rest.onset + RHYTHM_GRACE_MS;
    const end = rest.onset + rest.beats * 1000 - RHYTHM_GRACE_MS;
    return { status: strikes.some((strike) => strike.at < end && (strike.releasedAt ?? Number.POSITIVE_INFINITY) > start) ? "sound" : "quiet" };
  });
  const extra = strikes.some((_, index) => !used.has(index));
  const issue = notes.find((note) => note.message)?.message ?? (restFeedback.some((rest) => rest.status === "sound") ? "Keep counting through the final rest without sounding a key." : extra ? "Use only the notes written in the piece." : undefined);
  return { passed: !issue, issue, notes, rests: restFeedback };
}
