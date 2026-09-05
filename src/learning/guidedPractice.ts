import type { MeasureTiming, ScoreEvent } from "../music/scoreTypes";
import type { ScoreSelectionRange } from "./matcher";

export type GuidedSectionStatus = "not-started" | "in-progress" | "complete";

export interface GuidedLessonSection {
  id: string;
  startIndex: number;
  endIndex: number;
  startMeasure: number;
  endMeasure: number;
  status: GuidedSectionStatus;
  attempts: number;
  resetVersion: number;
  tempoPercent: number;
  targetTempoPercent: number;
  qualifyingTargetRuns: number;
  lastTempoScore?: number;
}

export interface GuidedPiecePlan {
  id: string;
  scoreKey: string;
  scope: ScoreSelectionRange;
  sections: GuidedLessonSection[];
  activeSectionId?: string;
  nextSectionId: number;
  finishedPlanning: boolean;
  startingTempoPercent: number;
}

export function createGuidedPiecePlan(scoreKey: string, events: ScoreEvent[], measures: MeasureTiming[], scope?: ScoreSelectionRange, measuresPerSection = 4, startingTempoPercent = 60): GuidedPiecePlan | undefined {
  if (events.length === 0) return undefined;
  const normalizedScope = normalizeScope(scope, events.length);
  const scopedMeasures = measures.filter((measure) => measure.endQuarter > events[normalizedScope.startIndex].startQuarter + 0.001 && measure.startQuarter <= events[normalizedScope.endIndex].startQuarter + 0.001);
  const starts = [normalizedScope.startIndex];
  for (let index = measuresPerSection; index < scopedMeasures.length; index += measuresPerSection) {
    const boundary = events.findIndex((event, eventIndex) => eventIndex > normalizedScope.startIndex && eventIndex <= normalizedScope.endIndex && event.startQuarter >= scopedMeasures[index].startQuarter - 0.001);
    if (boundary > starts.at(-1)! && boundary <= normalizedScope.endIndex) starts.push(boundary);
  }
  const sections = starts.map((startIndex, index) => makeSection(index + 1, startIndex, (starts[index + 1] ?? normalizedScope.endIndex + 1) - 1, events, 0, startingTempoPercent));
  return { id: `guided:${scoreKey}`, scoreKey, scope: normalizedScope, sections, activeSectionId: sections[0]?.id, nextSectionId: sections.length + 1, finishedPlanning: false, startingTempoPercent };
}

export function splitGuidedSection(plan: GuidedPiecePlan, sectionId: string, splitStartIndex: number, events: ScoreEvent[]): GuidedPiecePlan {
  const index = plan.sections.findIndex((section) => section.id === sectionId);
  const section = plan.sections[index];
  if (!section || splitStartIndex <= section.startIndex || splitStartIndex > section.endIndex) return plan;
  const left = makeSection(plan.nextSectionId, section.startIndex, splitStartIndex - 1, events, section.resetVersion + 1, plan.startingTempoPercent);
  const right = makeSection(plan.nextSectionId + 1, splitStartIndex, section.endIndex, events, section.resetVersion + 1, plan.startingTempoPercent);
  return { ...plan, sections: [...plan.sections.slice(0, index), left, right, ...plan.sections.slice(index + 1)], activeSectionId: left.id, nextSectionId: plan.nextSectionId + 2, finishedPlanning: false };
}

export function moveGuidedBoundary(plan: GuidedPiecePlan, rightSectionId: string, nextStartIndex: number, events: ScoreEvent[]): GuidedPiecePlan {
  const rightIndex = plan.sections.findIndex((section) => section.id === rightSectionId);
  if (rightIndex <= 0) return plan;
  const left = plan.sections[rightIndex - 1];
  const right = plan.sections[rightIndex];
  if (nextStartIndex <= left.startIndex || nextStartIndex > right.endIndex) return plan;
  const sections = [...plan.sections];
  sections[rightIndex - 1] = resetSection({ ...left, endIndex: nextStartIndex - 1, endMeasure: events[nextStartIndex - 1].measureNumber }, plan.startingTempoPercent);
  sections[rightIndex] = resetSection({ ...right, startIndex: nextStartIndex, startMeasure: events[nextStartIndex].measureNumber }, plan.startingTempoPercent);
  return { ...plan, sections, finishedPlanning: false };
}

export function mergeGuidedSections(plan: GuidedPiecePlan, rightSectionId: string, events: ScoreEvent[]): GuidedPiecePlan {
  const rightIndex = plan.sections.findIndex((section) => section.id === rightSectionId);
  if (rightIndex <= 0) return plan;
  const left = plan.sections[rightIndex - 1];
  const right = plan.sections[rightIndex];
  const merged = makeSection(plan.nextSectionId, left.startIndex, right.endIndex, events, Math.max(left.resetVersion, right.resetVersion) + 1, plan.startingTempoPercent);
  return { ...plan, sections: [...plan.sections.slice(0, rightIndex - 1), merged, ...plan.sections.slice(rightIndex + 1)], activeSectionId: merged.id, nextSectionId: plan.nextSectionId + 1, finishedPlanning: false };
}

export function setGuidedSectionProgress(plan: GuidedPiecePlan, sectionId: string, status: GuidedSectionStatus, attempts: number): GuidedPiecePlan {
  return { ...plan, sections: plan.sections.map((section) => section.id === sectionId ? { ...section, status, attempts } : section) };
}

export function recordGuidedTempoRun(plan: GuidedPiecePlan, sectionId: string, score: number, successScore = 90, requiredTargetRuns = 2): GuidedPiecePlan {
  return { ...plan, sections: plan.sections.map((section) => {
    if (section.id !== sectionId) return section;
    const qualifyingTargetRuns = score >= successScore && section.tempoPercent >= section.targetTempoPercent ? section.qualifyingTargetRuns + 1 : section.qualifyingTargetRuns;
    return { ...section, attempts: section.attempts + 1, lastTempoScore: score, qualifyingTargetRuns, status: qualifyingTargetRuns >= requiredTargetRuns ? "complete" : "in-progress" };
  }) };
}

export function increaseGuidedTempo(plan: GuidedPiecePlan, sectionId: string, increment = 10, successScore = 90): GuidedPiecePlan {
  return { ...plan, sections: plan.sections.map((section) => section.id === sectionId && (section.lastTempoScore ?? 0) >= successScore
    ? { ...section, tempoPercent: Math.min(section.targetTempoPercent, section.tempoPercent + increment), lastTempoScore: undefined }
    : section) };
}

export function setActiveGuidedSection(plan: GuidedPiecePlan, sectionId: string): GuidedPiecePlan {
  return plan.sections.some((section) => section.id === sectionId) ? { ...plan, activeSectionId: sectionId } : plan;
}

export function finishGuidedPlanning(plan: GuidedPiecePlan): GuidedPiecePlan {
  const activeSectionId = plan.sections.some((section) => section.id === plan.activeSectionId)
    ? plan.activeSectionId
    : plan.sections[0]?.id;
  return { ...plan, finishedPlanning: true, activeSectionId };
}

function makeSection(id: number, startIndex: number, endIndex: number, events: ScoreEvent[], resetVersion = 0, tempoPercent = 60): GuidedLessonSection {
  return { id: `lesson-${id}`, startIndex, endIndex, startMeasure: events[startIndex].measureNumber, endMeasure: events[endIndex].measureNumber, status: "not-started", attempts: 0, resetVersion, tempoPercent, targetTempoPercent: 100, qualifyingTargetRuns: 0 };
}

function resetSection(section: GuidedLessonSection, startingTempoPercent: number): GuidedLessonSection { return { ...section, status: "not-started", attempts: 0, resetVersion: section.resetVersion + 1, tempoPercent: startingTempoPercent, qualifyingTargetRuns: 0, lastTempoScore: undefined }; }

function normalizeScope(scope: ScoreSelectionRange | undefined, eventCount: number): ScoreSelectionRange {
  const startIndex = Math.max(0, Math.min(scope?.startIndex ?? 0, eventCount - 1));
  const endIndex = Math.max(startIndex, Math.min(scope?.endIndex ?? eventCount - 1, eventCount - 1));
  return { startIndex, endIndex };
}
