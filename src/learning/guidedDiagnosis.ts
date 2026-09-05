import { missedPerformanceNotes, type CompletedPlaybackRun } from "../playback/playback";
import type { ScoreEvent } from "../music/scoreTypes";
import type { GuidedLessonSection } from "./guidedPractice";
import type { ScoreSelectionRange } from "./matcher";

export type GuidedDiagnosisHand = "right" | "left" | "both";

export interface GuidedAttemptEvidence {
  sectionId: string;
  resetVersion: number;
  step: "right" | "left" | "both" | "tempo";
  handMode: GuidedDiagnosisHand;
  tempoPercent: number;
  measures: GuidedMeasureEvidence[];
}

export interface GuidedMeasureEvidence {
  measureNumber: number;
  expectedNotes: number;
  correctNotes: number;
  missedNotes: number;
  wrongNotes: number;
  mistimedNotes: number;
  rightIssues: number;
  leftIssues: number;
  timingErrorsMs: number[];
}

export interface GuidedDiagnosis {
  measureNumber: number;
  hand?: "right" | "left";
  title: string;
  summary: string;
  attempts: number;
  expectedNotes: number;
  correctNotes: number;
  missedNotes: number;
  wrongNotes: number;
  mistimedNotes: number;
  averageTimingErrorMs?: number;
}

export function guidedDiagnosisRange(events: readonly ScoreEvent[], section: GuidedLessonSection, measureNumber: number): ScoreSelectionRange | undefined {
  const indices = events
    .map((event, eventIndex) => ({ event, eventIndex }))
    .filter(({ event, eventIndex }) => eventIndex >= section.startIndex && eventIndex <= section.endIndex && event.measureNumber === measureNumber && event.midiNotes.length > 0)
    .map(({ eventIndex }) => eventIndex);
  return indices.length ? { startIndex: indices[0], endIndex: indices.at(-1)! } : undefined;
}

export function collectGuidedAttemptEvidence(sectionId: string, resetVersion: number, step: GuidedAttemptEvidence["step"], run: CompletedPlaybackRun): GuidedAttemptEvidence {
  const measures = new Map<number, GuidedMeasureEvidence>();
  const ensure = (measureNumber: number) => {
    const existing = measures.get(measureNumber);
    if (existing) return existing;
    const created: GuidedMeasureEvidence = { measureNumber, expectedNotes: 0, correctNotes: 0, missedNotes: 0, wrongNotes: 0, mistimedNotes: 0, rightIssues: 0, leftIssues: 0, timingErrorsMs: [] };
    measures.set(measureNumber, created);
    return created;
  };
  const eventByIndex = new Map(run.plan.events.map((item) => [item.eventIndex, item.event]));
  const staffFor = (eventIndex: number, midiNote: number, fallback?: number) => fallback ?? eventByIndex.get(eventIndex)?.noteDetails.find((note) => note.midiNote === midiNote)?.staffNumber;
  const addHandIssue = (measure: GuidedMeasureEvidence, staff?: number) => {
    if (staff === 1) measure.rightIssues += 1;
    if (staff === 2) measure.leftIssues += 1;
  };

  for (const { event } of run.plan.events) ensure(event.measureNumber).expectedNotes += event.midiNotes.length;
  for (const result of run.results) {
    const event = eventByIndex.get(result.eventIndex);
    if (!event) continue;
    const measure = ensure(event.measureNumber);
    if (result.result === "correct") {
      measure.correctNotes += 1;
      if (result.timingErrorMs !== undefined) measure.timingErrorsMs.push(Math.abs(result.timingErrorMs));
    } else if (result.playedNote === result.expectedNote) {
      measure.mistimedNotes += 1;
      addHandIssue(measure, staffFor(result.eventIndex, result.expectedNote, result.staffNumber));
    } else {
      measure.wrongNotes += 1;
      addHandIssue(measure, staffFor(result.eventIndex, result.expectedNote, result.staffNumber));
    }
  }
  for (const miss of missedPerformanceNotes(run.plan, run.results)) {
    const event = eventByIndex.get(miss.eventIndex);
    if (!event) continue;
    const measure = ensure(event.measureNumber);
    measure.missedNotes += 1;
    addHandIssue(measure, staffFor(miss.eventIndex, miss.note, miss.staffNumber));
  }
  return { sectionId, resetVersion, step, handMode: run.handMode, tempoPercent: run.tempoPercent, measures: [...measures.values()].sort((a, b) => a.measureNumber - b.measureNumber) };
}

export function diagnoseGuidedAttempts(evidence: readonly GuidedAttemptEvidence[]): GuidedDiagnosis | undefined {
  if (!evidence.length) return undefined;
  const totals = new Map<number, GuidedMeasureEvidence>();
  for (const attempt of evidence) for (const measure of attempt.measures) {
    const total = totals.get(measure.measureNumber) ?? { measureNumber: measure.measureNumber, expectedNotes: 0, correctNotes: 0, missedNotes: 0, wrongNotes: 0, mistimedNotes: 0, rightIssues: 0, leftIssues: 0, timingErrorsMs: [] };
    total.expectedNotes += measure.expectedNotes;
    total.correctNotes += measure.correctNotes;
    total.missedNotes += measure.missedNotes;
    total.wrongNotes += measure.wrongNotes;
    total.mistimedNotes += measure.mistimedNotes;
    total.rightIssues += measure.rightIssues;
    total.leftIssues += measure.leftIssues;
    total.timingErrorsMs.push(...measure.timingErrorsMs);
    totals.set(measure.measureNumber, total);
  }
  const ranked = [...totals.values()].sort((a, b) => issueWeight(b) - issueWeight(a) || b.missedNotes - a.missedNotes || a.measureNumber - b.measureNumber);
  const primary = ranked[0];
  if (!primary || issueWeight(primary) === 0) return undefined;
  const issueCount = primary.missedNotes + primary.wrongNotes + primary.mistimedNotes;
  const dominantHand = primary.rightIssues >= 2 && primary.rightIssues >= primary.leftIssues * 2 ? "right" : primary.leftIssues >= 2 && primary.leftIssues >= primary.rightIssues * 2 ? "left" : undefined;
  const issueParts = [primary.missedNotes ? `${primary.missedNotes} missed` : "", primary.wrongNotes ? `${primary.wrongNotes} wrong` : "", primary.mistimedNotes ? `${primary.mistimedNotes} mistimed` : ""].filter(Boolean);
  const averageTimingErrorMs = primary.timingErrorsMs.length ? Math.round(primary.timingErrorsMs.reduce((sum, value) => sum + value, 0) / primary.timingErrorsMs.length) : undefined;
  return {
    measureNumber: primary.measureNumber,
    hand: dominantHand,
    title: `Measure ${primary.measureNumber}${dominantHand ? ` · ${dominantHand === "right" ? "right" : "left"} hand` : ""}`,
    summary: `${issueCount} note issue${issueCount === 1 ? "" : "s"} across ${evidence.length} attempt${evidence.length === 1 ? "" : "s"}: ${issueParts.join(", ")}.`,
    attempts: evidence.length,
    expectedNotes: primary.expectedNotes,
    correctNotes: primary.correctNotes,
    missedNotes: primary.missedNotes,
    wrongNotes: primary.wrongNotes,
    mistimedNotes: primary.mistimedNotes,
    ...(averageTimingErrorMs !== undefined ? { averageTimingErrorMs } : {}),
  };
}

function issueWeight(measure: GuidedMeasureEvidence): number {
  return measure.missedNotes * 2 + measure.wrongNotes + measure.mistimedNotes;
}
