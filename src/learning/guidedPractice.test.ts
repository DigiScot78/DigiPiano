import { describe, expect, it } from "vitest";
import type { MeasureTiming, ScoreEvent } from "../music/scoreTypes";
import { createGuidedPiecePlan, finishGuidedPlanning, increaseGuidedTempo, mergeGuidedSections, moveGuidedBoundary, recordGuidedTempoRun, setActiveGuidedSection, setGuidedSectionProgress, splitGuidedSection } from "./guidedPractice";

const events = Array.from({ length: 10 }, (_, index): ScoreEvent => ({ id: String(index), partId: "P1", measureNumber: index + 1, startQuarter: index * 4, durationQuarters: 1, midiNotes: [60 + index], staffNumbers: [1], voiceNumbers: ["1"], sourceNoteIds: [String(index)], noteDetails: [{ midiNote: 60 + index, staffNumber: 1, voiceNumber: "1", sourceNoteId: String(index) }] }));
const measures: MeasureTiming[] = events.map((event, index) => ({ index, measureNumber: index + 1, startQuarter: event.startQuarter, endQuarter: event.startQuarter + 4, beats: 4, beatType: 4 }));

describe("guided piece planning", () => {
  it("partitions a whole score into contiguous four-measure lessons", () => {
    const plan = createGuidedPiecePlan("score", events, measures)!;
    expect(plan.sections.map(({ startIndex, endIndex, startMeasure, endMeasure }) => ({ startIndex, endIndex, startMeasure, endMeasure }))).toEqual([
      { startIndex: 0, endIndex: 3, startMeasure: 1, endMeasure: 4 },
      { startIndex: 4, endIndex: 7, startMeasure: 5, endMeasure: 8 },
      { startIndex: 8, endIndex: 9, startMeasure: 9, endMeasure: 10 },
    ]);
  });

  it("respects a selected scope and never creates empty lessons", () => {
    expect(createGuidedPiecePlan("score", events, measures, { startIndex: 2, endIndex: 8 })?.sections.map((section) => [section.startIndex, section.endIndex])).toEqual([[2, 5], [6, 8]]);
    expect(createGuidedPiecePlan("empty", [], [])).toBeUndefined();
  });

  it("applies the selected starting tempo to every new lesson", () => {
    expect(createGuidedPiecePlan("score", events, measures, undefined, 4, 80)?.sections.map((section) => section.tempoPercent)).toEqual([80, 80, 80]);
  });

  it("resets both sides when a completed section is split", () => {
    const original = createGuidedPiecePlan("score", events, measures)!;
    const completed = setGuidedSectionProgress(original, original.sections[0].id, "complete", 3);
    const split = splitGuidedSection(completed, completed.sections[0].id, 2, events);
    expect(split.sections.slice(0, 2).map((section) => [section.startIndex, section.endIndex, section.status, section.attempts])).toEqual([[0, 1, "not-started", 0], [2, 3, "not-started", 0]]);
  });

  it("moves a boundary without crossing and resets only adjacent lessons", () => {
    let plan = createGuidedPiecePlan("score", events, measures)!;
    plan = { ...plan, sections: plan.sections.map((section) => ({ ...section, status: "complete" as const, attempts: 2 })) };
    const moved = moveGuidedBoundary(plan, plan.sections[1].id, 5, events);
    expect(moved.sections.map((section) => [section.startIndex, section.endIndex, section.status])).toEqual([[0, 4, "not-started"], [5, 7, "not-started"], [8, 9, "complete"]]);
    expect(moveGuidedBoundary(moved, moved.sections[1].id, 0, events)).toBe(moved);
  });

  it("merges adjacent lessons into one reset lesson", () => {
    const plan = createGuidedPiecePlan("score", events, measures)!;
    const merged = mergeGuidedSections(plan, plan.sections[1].id, events);
    expect(merged.sections.map((section) => [section.startIndex, section.endIndex, section.status])).toEqual([[0, 7, "not-started"], [8, 9, "not-started"]]);
  });

  it("keeps the selected lesson active when planning finishes", () => {
    const plan = createGuidedPiecePlan("score", events, measures)!;
    const selected = setActiveGuidedSection(plan, plan.sections[1].id);
    expect(finishGuidedPlanning(selected).activeSectionId).toBe(plan.sections[1].id);
  });

  it("advances tempo only after success and requires two target runs", () => {
    let plan = createGuidedPiecePlan("score", events, measures)!;
    const id = plan.sections[0].id;
    plan = recordGuidedTempoRun(plan, id, 89);
    expect(increaseGuidedTempo(plan, id).sections[0].tempoPercent).toBe(60);
    plan = recordGuidedTempoRun(plan, id, 94);
    plan = increaseGuidedTempo(plan, id);
    expect(plan.sections[0].tempoPercent).toBe(70);
    plan = { ...plan, sections: plan.sections.map((section) => section.id === id ? { ...section, tempoPercent: 100 } : section) };
    plan = recordGuidedTempoRun(plan, id, 95);
    expect(plan.sections[0].qualifyingTargetRuns).toBe(1);
    plan = recordGuidedTempoRun(plan, id, 91);
    expect(plan.sections[0].status).toBe("complete");
  });
});
