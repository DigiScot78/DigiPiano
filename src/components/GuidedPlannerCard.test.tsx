import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuidedPlannerCard } from "./GuidedPlannerCard";
import type { GuidedPiecePlan } from "../learning/guidedPractice";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const plan: GuidedPiecePlan = { id: "guided:test", scoreKey: "test", scope: { startIndex: 0, endIndex: 7 }, nextSectionId: 3, finishedPlanning: false, startingTempoPercent: 60, activeSectionId: "lesson-1", sections: [
  { id: "lesson-1", startIndex: 0, endIndex: 3, startMeasure: 1, endMeasure: 4, status: "not-started", attempts: 0, resetVersion: 0, tempoPercent: 60, targetTempoPercent: 100, qualifyingTargetRuns: 0 },
  { id: "lesson-2", startIndex: 4, endIndex: 7, startMeasure: 5, endMeasure: 8, status: "not-started", attempts: 0, resetVersion: 0, tempoPercent: 60, targetTempoPercent: 100, qualifyingTargetRuns: 0 },
] };

describe("GuidedPlannerCard", () => {
  let container: HTMLDivElement; let root: Root;
  beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
  it("exposes section selection, boundary editing, and completion actions", async () => {
    const onMove = vi.fn(); const onDelete = vi.fn(); const onDone = vi.fn();
    await act(async () => root.render(<GuidedPlannerCard plan={{ ...plan, activeSectionId: "lesson-2" }} addingBoundary={false} onAddingBoundaryChange={vi.fn()} onSectionSelect={vi.fn()} onBoundaryMove={onMove} onBoundaryDelete={onDelete} onDone={onDone} />));
    expect(container.textContent).toContain("Measures 5–8");
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Move lesson 2 start earlier"]')?.click());
    expect(onMove).toHaveBeenCalledWith("lesson-2", 3);
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Remove boundary before lesson 2"]')?.click());
    expect(onDelete).toHaveBeenCalledWith("lesson-2");
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Done planning")?.click());
    expect(onDone).toHaveBeenCalledOnce();
  });
});
