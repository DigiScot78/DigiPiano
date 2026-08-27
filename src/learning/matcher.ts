import type { ScoreEvent } from "../music/scoreTypes";

export type HandMode = "both" | "right" | "left";
export type PracticeRunMode = "once" | "loop";

export interface ScoreSelectionRange {
  startIndex: number;
  endIndex: number;
}

export interface MatchResult {
  satisfied: boolean;
  missingNotes: number[];
  extraNotes: number[];
}

export interface NoteFeedbackMarker {
  note: number;
  kind: "correct" | "wrong";
  staffNumber?: number;
}
export interface LearningState {
  currentIndex: number;
  completedEventIds: string[];
  lastComparison?: MatchResult;
  isComplete: boolean;
}

export interface PracticeOptions {
  handMode?: HandMode;
  runMode?: PracticeRunMode;
  range?: ScoreSelectionRange;
}

export function feedbackMarkersForHeldNotes(
  heldNotes: Iterable<number>,
  event: ScoreEvent | undefined,
  handMode: HandMode = "both",
  ignoredNotes: Iterable<number> = [],
): NoteFeedbackMarker[] {
  const expectedEvent = filterEventForHand(event, handMode);
  const expected = new Set(expectedEvent?.midiNotes ?? []);
  const ignored = new Set(ignoredNotes);
  return Array.from(new Set(heldNotes))
    .filter((note) => !ignored.has(note))
    .sort((a, b) => a - b)
    .map((note) => ({
      note,
      kind: expected.has(note) ? "correct" : "wrong",
      staffNumber: staffForFeedbackNote(note, expectedEvent),
    }));
}

function staffForFeedbackNote(note: number, event: ScoreEvent | undefined): number {
  const details = event?.noteDetails ?? [];
  const exactMatches = details.filter((detail) => detail.midiNote === note);
  if (exactMatches.length > 0) {
    return preferredStaffForPitch(note, exactMatches.map((detail) => detail.staffNumber));
  }

  if (details.length > 0) {
    const minimumDistance = Math.min(...details.map((detail) => Math.abs(detail.midiNote - note)));
    const nearestStaves = details
      .filter((detail) => Math.abs(detail.midiNote - note) === minimumDistance)
      .map((detail) => detail.staffNumber);
    return preferredStaffForPitch(note, nearestStaves);
  }

  return conventionalStaffForPitch(note);
}

function preferredStaffForPitch(note: number, staffNumbers: number[]): number {
  const preferred = conventionalStaffForPitch(note);
  return staffNumbers.includes(preferred) ? preferred : staffNumbers[0] ?? preferred;
}

function conventionalStaffForPitch(note: number): number {
  return note <= 60 ? 2 : 1;
}
export function compareHeldNotesToEvent(
  heldNotes: Iterable<number>,
  event: ScoreEvent | undefined,
  handMode: HandMode = "both",
): MatchResult {
  const held = new Set(heldNotes);
  const expected = new Set(notesForHand(event, handMode));
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
  options: PracticeOptions = {},
): LearningState {
  const handMode = options.handMode ?? "both";
  const runMode = options.runMode ?? "once";
  const range = normalizeSelectionRange(options.range?.startIndex, options.range?.endIndex, events.length);
  const activeIndex = resolvePracticeIndex(state.currentIndex, events, handMode, range);
  const currentEvent = events[activeIndex];
  const comparison = compareHeldNotesToEvent(heldNotes, currentEvent, handMode);

  if (state.isComplete) {
    return { ...state, currentIndex: activeIndex, lastComparison: comparison };
  }

  if (!currentEvent || !comparison.satisfied) {
    return { ...state, currentIndex: activeIndex, lastComparison: comparison };
  }

  const completedEventIds = [...state.completedEventIds, currentEvent.id];
  const rangeEnd = range?.endIndex ?? events.length - 1;
  const rangeStart = firstPlayableIndex(events, handMode, range) ?? range?.startIndex ?? 0;
  const nextIndex = nextPlayableIndex(events, activeIndex + 1, rangeEnd, handMode);

  if (nextIndex === undefined) {
    if (runMode === "loop") {
      return {
        currentIndex: rangeStart,
        completedEventIds,
        lastComparison: comparison,
        isComplete: false,
      };
    }

    return {
      currentIndex: activeIndex,
      completedEventIds,
      lastComparison: comparison,
      isComplete: true,
    };
  }

  return {
    currentIndex: nextIndex,
    completedEventIds,
    lastComparison: comparison,
    isComplete: false,
  };
}
export function filterEventForHand(event: ScoreEvent | undefined, handMode: HandMode): ScoreEvent | undefined {
  if (!event || handMode === "both") {
    return event;
  }

  const noteDetails = event.noteDetails.filter((note) => note.staffNumber === staffForHand(handMode));
  return {
    ...event,
    noteDetails,
    midiNotes: uniqueSorted(noteDetails.map((note) => note.midiNote)),
    staffNumbers: uniqueSorted(noteDetails.map((note) => note.staffNumber)),
    voiceNumbers: Array.from(new Set(noteDetails.map((note) => note.voiceNumber))).sort(),
    sourceNoteIds: noteDetails.map((note) => note.sourceNoteId),
  };
}

export function notesForHand(event: ScoreEvent | undefined, handMode: HandMode): number[] {
  return filterEventForHand(event, handMode)?.midiNotes ?? [];
}

export function isEventPlayableForHand(event: ScoreEvent | undefined, handMode: HandMode): boolean {
  return notesForHand(event, handMode).length > 0;
}

export function firstPlayableIndex(
  events: ScoreEvent[],
  handMode: HandMode,
  range?: ScoreSelectionRange,
): number | undefined {
  if (events.length === 0) {
    return undefined;
  }

  const normalizedRange = normalizeSelectionRange(range?.startIndex, range?.endIndex, events.length);
  const start = normalizedRange?.startIndex ?? 0;
  const end = normalizedRange?.endIndex ?? events.length - 1;
  return nextPlayableIndex(events, start, end, handMode);
}

export function nextPlayableIndex(
  events: ScoreEvent[],
  startIndex: number,
  endIndex: number,
  handMode: HandMode,
): number | undefined {
  if (events.length === 0 || startIndex > endIndex) {
    return undefined;
  }

  const start = clamp(startIndex, 0, events.length - 1);
  const end = clamp(endIndex, 0, events.length - 1);

  for (let index = start; index <= end; index += 1) {
    if (isEventPlayableForHand(events[index], handMode)) {
      return index;
    }
  }

  return undefined;
}

export function resolvePracticeIndex(
  index: number,
  events: ScoreEvent[],
  handMode: HandMode,
  range?: ScoreSelectionRange,
): number {
  const clampedIndex = clampIndexToRange(index, range, events.length);
  if (events.length === 0 || isEventPlayableForHand(events[clampedIndex], handMode)) {
    return clampedIndex;
  }

  const normalizedRange = normalizeSelectionRange(range?.startIndex, range?.endIndex, events.length);
  const rangeStart = normalizedRange?.startIndex ?? 0;
  const rangeEnd = normalizedRange?.endIndex ?? events.length - 1;
  return nextPlayableIndex(events, clampedIndex + 1, rangeEnd, handMode)
    ?? previousPlayableIndex(events, clampedIndex - 1, rangeStart, handMode)
    ?? clampedIndex;
}

export function normalizeSelectionRange(
  startIndex: number | undefined,
  endIndex: number | undefined,
  eventCount: number,
): ScoreSelectionRange | undefined {
  if (startIndex === undefined || endIndex === undefined || eventCount <= 0) {
    return undefined;
  }

  const start = clamp(Math.min(startIndex, endIndex), 0, eventCount - 1);
  const end = clamp(Math.max(startIndex, endIndex), 0, eventCount - 1);
  return { startIndex: start, endIndex: end };
}

export function initialLearningState(currentIndex = 0): LearningState {
  return {
    currentIndex,
    completedEventIds: [],
    isComplete: false,
  };
}

function clampIndexToRange(index: number, range: ScoreSelectionRange | undefined, eventCount: number): number {
  if (eventCount <= 0) {
    return 0;
  }
  if (!range) {
    return clamp(index, 0, eventCount - 1);
  }
  return clamp(index, range.startIndex, range.endIndex);
}

function previousPlayableIndex(
  events: ScoreEvent[],
  startIndex: number,
  endIndex: number,
  handMode: HandMode,
): number | undefined {
  if (events.length === 0 || startIndex < endIndex) {
    return undefined;
  }

  const start = clamp(startIndex, 0, events.length - 1);
  const end = clamp(endIndex, 0, events.length - 1);

  for (let index = start; index >= end; index -= 1) {
    if (isEventPlayableForHand(events[index], handMode)) {
      return index;
    }
  }

  return undefined;
}

function staffForHand(handMode: Exclude<HandMode, "both">): number {
  return handMode === "right" ? 1 : 2;
}

function uniqueSorted(values: number[]): number[] {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
