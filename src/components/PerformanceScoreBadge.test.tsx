import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExercisePerformanceHistory } from "../playback/performanceScore";
import { PerformanceScoreBadge } from "./PerformanceScoreBadge";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const completed = { score: 82, totalNotes: 20, hits: 18, misses: 2, badNotes: 6, wrongPitches: 4, mistimedNotes: 2, hitRate: 90, averageTimingErrorMs: 44, playMode: "play" as const, handMode: "right" as const, range: { startIndex: 2, endIndex: 8 } };
const history: ExercisePerformanceHistory = { attempts: 3, last: completed, best: { ...completed, score: 91 }, averageScore: 84, scoreTotal: 252, totalNotes: 60, hits: 52, misses: 8, badNotes: 10 };

describe("PerformanceScoreBadge", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true }))); });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
  it("shows the final score immediately for reduced motion and opens details on focus", async () => {
    await act(async () => root.render(<PerformanceScoreBadge history={history} />));
    const button = container.querySelector<HTMLButtonElement>("button")!;
    expect(button.textContent).toContain("82%");
    await act(async () => button.focus());
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("Best91%");
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("Events 3–9");
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("Average timing error44 ms");
  });
  it("toggles details by click and dismisses them with Escape", async () => {
    await act(async () => root.render(<PerformanceScoreBadge history={history} />));
    const button = container.querySelector<HTMLButtonElement>("button")!;
    await act(async () => button.click());
    expect(button.getAttribute("aria-expanded")).toBe("true");
    await act(async () => container.querySelector<HTMLElement>(".performance-score")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
  it("counts up a newly completed score", async () => {
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1; }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const startedAt = performance.now();
    await act(async () => root.render(<PerformanceScoreBadge history={history} />));
    expect(container.querySelector("button")?.textContent).toContain("0%");
    await act(async () => frame?.(startedAt + 1000));
    expect(container.querySelector("button")?.textContent).toContain("82%");
  });
});
