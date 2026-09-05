import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuidedSessionCard } from "./GuidedSessionCard";
import type { GuidedPiecePlan } from "../learning/guidedPractice";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const plan: GuidedPiecePlan = {
  id: "plan", scoreKey: "score", scope: { startIndex: 0, endIndex: 7 }, activeSectionId: "section", nextSectionId: 2, finishedPlanning: true, startingTempoPercent: 60,
  sections: [{ id: "section", startIndex: 0, endIndex: 7, startMeasure: 1, endMeasure: 4, status: "complete", attempts: 5, resetVersion: 0, tempoPercent: 100, targetTempoPercent: 100, qualifyingTargetRuns: 2, lastTempoScore: 96 }],
};

describe("GuidedSessionCard diagnosis detour", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

  const render = async (overrides: Record<string, unknown> = {}) => {
    const props = {
      plan, steps: ["listen", "right", "left", "both", "tempo"] as ("listen" | "right" | "left" | "both" | "tempo")[], step: "tempo" as const, stepComplete: true, stepScore: 96,
      diagnosis: { measureNumber: 3, hand: "left" as const, title: "Measure 3 · left hand", summary: "2 note issues across 5 attempts: 2 missed.", attempts: 5, expectedNotes: 10, correctNotes: 8, missedNotes: 2, wrongNotes: 0, mistimedNotes: 0 },
      detourComplete: false, detourScore: undefined as number | undefined, auditioning: false, playbackActive: false, awaitingLoopRestart: false, loopEnabled: false, tempoHand: "both" as const,
      onSectionSelect: vi.fn(), onStepSelect: vi.fn(), onListen: vi.fn(), onListenDone: vi.fn(), onPractice: vi.fn(), onLoopChange: vi.fn(), onTempoIncrease: vi.fn(), onSkip: vi.fn(), onRepeat: vi.fn(), onNextLesson: vi.fn(), onEditPlan: vi.fn(), onStartDetour: vi.fn(), onPracticeDetour: vi.fn(), onReturnFromDetour: vi.fn(), onLeave: vi.fn(),
      ...overrides,
    };
    await act(async () => root.render(<GuidedSessionCard {...props} />));
    return props;
  };

  it("starts the recommended practice directly from the insight", async () => {
    const props = await render();
    expect(container.textContent).toContain("Temporarily practise measure 3 with the left hand. Your completed lesson and boundaries will stay unchanged.");
    await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Start focused practice")?.click());
    expect(props.onStartDetour).toHaveBeenCalledWith(props.diagnosis);
  });

  it("shows focused controls without replacing the completed lesson", async () => {
    const props = await render({ diagnosis: undefined, detour: { measureNumber: 3, handMode: "left" }, detourComplete: true, detourScore: 62 });
    expect(container.textContent).toContain("Another focused pass recommended");
    expect(container.textContent).toContain("62%Try again");
    await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Return to lesson")?.click());
    expect(props.onReturnFromDetour).toHaveBeenCalledOnce();
    expect(plan.sections[0].status).toBe("complete");
  });
});
