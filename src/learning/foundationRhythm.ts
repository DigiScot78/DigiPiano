export const RHYTHM_BEAT_MS = 1000; // A calm 60 BPM teaching pulse.
export const RHYTHM_GRACE_MS = 250;
export type RhythmExercise = "quarters" | "halves" | "phrase";
export interface RhythmStrike { note: number; at: number; releasedAt?: number }
export type RhythmNoteStatus = "correct" | "early" | "late" | "missed";
export interface RhythmNoteFeedback {
  status: RhythmNoteStatus;
  message?: string;
}
export interface TimedFoundationNote { midi: number; beats: number; onset: number }
export function rhythmNotes(exercise: RhythmExercise) {
  const lengths = exercise === "quarters" ? [1, 1, 1, 1] : exercise === "halves" ? [2, 2] : [1, 1, 1, 1, 2, 2];
  return lengths.map((beats, index) => ({ beats, onset: lengths.slice(0, index).reduce((sum, value) => sum + value, 0) * RHYTHM_BEAT_MS }));
}
export function rhythmResult(exercise: RhythmExercise, strikes: RhythmStrike[]) {
  const notes = rhythmNotes(exercise).map((note) => ({ ...note, midi: 60 }));
  return timedFoundationResult(notes, strikes);
}

export function timedFoundationResult(notes: TimedFoundationNote[], strikes: RhythmStrike[]) {
  const used = new Set<number>();
  const feedback: RhythmNoteFeedback[] = notes.map(({ midi, beats, onset }) => {
    const index = strikes.findIndex((strike, i) => !used.has(i) && strike.note === midi && Math.abs(strike.at - onset) <= RHYTHM_GRACE_MS);
    if (index < 0) return { status: "missed", message: "Play the written note with the beat." };
    used.add(index);
    const strike = strikes[index];
    const end = onset + beats * RHYTHM_BEAT_MS;
    if (strike.releasedAt !== undefined && strike.releasedAt < end - RHYTHM_GRACE_MS) return { status: "early", message: beats === 2 ? "Released early — hold through both counts." : "Released early — give this note its full beat." };
    if (strike.releasedAt === undefined || strike.releasedAt > end + RHYTHM_GRACE_MS) return { status: "late", message: "Held too long — release at the end of the note." };
    return { status: "correct" };
  });
  const extra = strikes.some((_, index) => !used.has(index));
  const issue = feedback.find((item) => item.message)?.message ?? (extra ? "Use one key press for each written note." : undefined);
  return { passed: !issue, issue, notes: feedback, matched: feedback.filter((item) => item.status === "correct").length, total: notes.length };
}
