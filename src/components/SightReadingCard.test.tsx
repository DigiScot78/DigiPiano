import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SightReadingCard } from "./SightReadingCard";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("SightReadingCard", () => {
  afterEach(() => vi.useRealTimers());

  it("starts the attempt when a timed preparation expires", async () => {
    vi.useFakeTimers();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onStart = vi.fn();
    const options = { level: "beginner", hand: "right", measures: 4, tempoBpm: 80, preparationSeconds: 15 } as const;
    await act(async () => root.render(<SightReadingCard options={options} phase="prepare" playbackActive={false} onStart={onStart} onNew={vi.fn()} onReview={vi.fn()} onStopReview={vi.fn()} onLeave={vi.fn()} />));
    expect(container.querySelector('[role="timer"]')?.textContent).toContain("15");
    await act(async () => vi.advanceTimersByTimeAsync(15_001));
    expect(onStart).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
    container.remove();
  });

  it("leaves unlimited preparation under user control", async () => {
    vi.useFakeTimers();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onStart = vi.fn();
    const options = { level: "beginner", hand: "right", measures: 4, tempoBpm: 80, preparationSeconds: 0 } as const;
    await act(async () => root.render(<SightReadingCard options={options} phase="prepare" playbackActive={false} onStart={onStart} onNew={vi.fn()} onReview={vi.fn()} onStopReview={vi.fn()} onLeave={vi.fn()} />));
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(onStart).not.toHaveBeenCalled();
    expect(container.querySelector('[role="timer"]')).toBeNull();
    await act(async () => root.unmount());
    container.remove();
  });

  it("does not restart timed preparation when note activity rerenders the card", async () => {
    vi.useFakeTimers();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onStart = vi.fn();
    const options = { level: "beginner", hand: "right", measures: 4, tempoBpm: 80, preparationSeconds: 15 } as const;
    await act(async () => root.render(<SightReadingCard options={options} phase="prepare" playbackActive={false} onStart={() => onStart()} onNew={vi.fn()} onReview={vi.fn()} onStopReview={vi.fn()} onLeave={vi.fn()} />));
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    await act(async () => root.render(<SightReadingCard options={options} phase="prepare" playbackActive={false} onStart={() => onStart()} onNew={vi.fn()} onReview={vi.fn()} onStopReview={vi.fn()} onLeave={vi.fn()} />));
    await act(async () => vi.advanceTimersByTimeAsync(5_001));
    expect(onStart).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
    container.remove();
  });

  it("requires an explicit action to review a completed excerpt", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onReview = vi.fn();
    const options = { level: "beginner", hand: "right", measures: 4, tempoBpm: 80, preparationSeconds: 0 } as const;
    const assessment = { score: 80, noteAccuracy: 75, continuity: 95, notesRead: 12, totalNotes: 16, momentsPlayed: 15, totalMoments: 16, wrongNotes: 2, missedNotes: 4 };
    await act(async () => root.render(<SightReadingCard options={options} phase="result" assessment={assessment} playbackActive={false} onStart={vi.fn()} onNew={vi.fn()} onReview={onReview} onStopReview={vi.fn()} onLeave={vi.fn()} />));
    expect(container.textContent).toContain("Review excerpt");
    const review = [...container.querySelectorAll("button")].find((button) => button.textContent === "Review excerpt");
    await act(async () => review?.click());
    expect(onReview).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
    container.remove();
  });
});
