import type { ScoreEvent, ScoreEventNote } from "../music/scoreTypes";
import type { ScoreAnchorDto } from "./domain";
import { isScoreAnchorDto } from "./domain";

export type AnchorResolution =
  | { status: "resolved"; eventIndex: number; noteIndex?: number }
  | { status: "needs-repair"; reason: "invalid-anchor" | "score-version-mismatch" | "not-found" | "ambiguous" };

type NoteCandidate = { eventIndex: number; noteIndex: number; event: ScoreEvent; note: ScoreEventNote };

export function resolveScoreAnchor(anchor: ScoreAnchorDto, scoreVersionId: string, events: readonly ScoreEvent[]): AnchorResolution {
  if (!isScoreAnchorDto(anchor)) return { status: "needs-repair", reason: "invalid-anchor" };
  if (anchor.scoreVersionId !== scoreVersionId) return { status: "needs-repair", reason: "score-version-mismatch" };

  const eventCandidates = events
    .map((event, eventIndex) => ({ event, eventIndex }))
    .filter(({ event }) => event.partId === anchor.partId
      && event.measureNumber === anchor.measureNumber
      && Math.abs(event.startQuarter - anchor.absoluteQuarter) < 0.000_001
      && event.staffNumbers.includes(anchor.staffNumber));
  if (!eventCandidates.length) return { status: "needs-repair", reason: "not-found" };

  const noteCandidates: NoteCandidate[] = eventCandidates.flatMap(({ event, eventIndex }) => event.noteDetails
    .map((note, noteIndex) => ({ event, eventIndex, note, noteIndex }))
    .filter(({ note }) => note.staffNumber === anchor.staffNumber));
  const bySource = anchor.sourceNoteId ? noteCandidates.filter(({ note }) => note.sourceNoteId === anchor.sourceNoteId) : [];
  if (anchor.sourceNoteId && bySource.length === 1) return resolvedNote(bySource[0]);
  if (anchor.sourceNoteId && bySource.length > 1) return { status: "needs-repair", reason: "ambiguous" };

  const byVoice = anchor.voiceNumber ? noteCandidates.filter(({ note }) => note.voiceNumber === anchor.voiceNumber) : noteCandidates;
  const eventIndexes = [...new Set(byVoice.map(({ eventIndex }) => eventIndex))];
  if (eventIndexes.length !== 1) return { status: "needs-repair", reason: eventIndexes.length ? "ambiguous" : "not-found" };

  const matchingNotes = byVoice.filter(({ eventIndex }) => eventIndex === eventIndexes[0]);
  if (matchingNotes.length === 1) return resolvedNote(matchingNotes[0]);
  if (matchingNotes.length > 1 && !anchor.sourceNoteId) return { status: "resolved", eventIndex: eventIndexes[0] };
  return { status: "needs-repair", reason: "not-found" };
}

function resolvedNote(candidate: NoteCandidate): AnchorResolution {
  return { status: "resolved", eventIndex: candidate.eventIndex, noteIndex: candidate.noteIndex };
}
