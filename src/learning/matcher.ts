import type { ScoreEvent } from "../music/scoreTypes";

export interface MatchResult {
  satisfied: boolean;
  missingNotes: number[];
  extraNotes: number[];
}

export interface LearningState {
  currentIndex: number;
  completedEventIds: string[];
  lastComparison?: MatchResult;
}

export function compareHeldNotesToEvent(heldNotes: Iterable<number>, event: ScoreEvent | undefined): MatchResult {
  const held = new Set(heldNotes);
  const expected = new Set(event?.midiNotes ?? []);
  const missingNotes = Array.from(expected).filter((note) => !held.has(note)).sort((a, b) => a - b);
  const extraNotes = Array.from(held).filter((note) => !expected.has(note)).sort((a, b) => a - b);

  return {
    satisfied: expected.size > 0 && missingNotes.length === 0,
    missingNotes,
    extraNotes,
  };
}

export function advanceWhenSatisfied(
  state: LearningState,
  events: ScoreEvent[],
  heldNotes: Iterable<number>,
): LearningState {
  const currentEvent = events[state.currentIndex];
  const comparison = compareHeldNotesToEvent(heldNotes, currentEvent);

  if (!currentEvent || !comparison.satisfied) {
    return { ...state, lastComparison: comparison };
  }

  return {
    currentIndex: Math.min(state.currentIndex + 1, events.length),
    completedEventIds: [...state.completedEventIds, currentEvent.id],
    lastComparison: comparison,
  };
}

export function initialLearningState(): LearningState {
  return {
    currentIndex: 0,
    completedEventIds: [],
  };
}
