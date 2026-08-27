import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScoreEvent } from "../music/scoreTypes";
import { usePlaybackSession } from "./usePlaybackSession";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const scoreEvent: ScoreEvent = { id: "a", partId: "P1", measureNumber: 1, startQuarter: 0, durationQuarters: 1, midiNotes: [60], staffNumbers: [1], voiceNumbers: ["1"], sourceNoteIds: ["60"], noteDetails: [{ midiNote: 60, staffNumber: 1, voiceNumber: "1", sourceNoteId: "60" }] };
const scoreEvents = [scoreEvent];

describe("usePlaybackSession", () => {
  let container: HTMLDivElement;
  let root: Root;
  let session!: ReturnType<typeof usePlaybackSession>;
  let nextFrame: FrameRequestCallback | undefined;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { nextFrame = callback; return 1; }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(performance, "now").mockReturnValue(1000);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  async function render(countdownSeconds = 0, runMode: "once" | "loop" = "once", pauseOnNotes = false, events = scoreEvents) {
    function Harness() {
      session = usePlaybackSession({ events, tempoChanges: [], handMode: "both", runMode, pauseOnNotes, settings: { countdownSeconds, fallbackBpm: 120, hitToleranceMs: 250, showHitsWhilePlaying: false } });
      return null;
    }
    await act(async () => root.render(<Harness />));
  }

  it("starts immediately, records timestamped notes, and retains them on stop", async () => {
    await render();
    await act(async () => session.start());
    expect(session.phase).toBe("playing");
    expect(session.showStartCue).toBe(true);
    await act(async () => session.handleMidiNoteOn(60, 1100));
    expect(session.results).toHaveLength(1);
    expect(session.results[0]).toMatchObject({ result: "correct", timingErrorMs: 100 });
    await act(async () => session.stop());
    expect(session.phase).toBe("idle");
    expect(session.results).toHaveLength(1);
  });

  it("counts down and waits for a key after a loop", async () => {
    await render(1, "loop");
    await act(async () => session.start());
    expect(session.phase).toBe("countdown");
    expect(session.rollElapsedMs).toBe(-1000);
    await act(async () => nextFrame?.(1800));
    expect(session.phase).toBe("countdown");
    expect(session.countdownValue).toBe(1);
    expect(session.rollElapsedMs).toBe(-200);
    await act(async () => nextFrame?.(2000));
    expect(session.phase).toBe("playing");
    expect(session.showStartCue).toBe(true);
    await act(async () => nextFrame?.(2301));
    expect(session.phase).toBe("playing");
    expect(session.showStartCue).toBe(false);
    await act(async () => nextFrame?.(2501));
    expect(session.phase).toBe("waiting-restart");
    await act(async () => session.handleMidiNoteOn(60, 2600));
    expect(session.phase).toBe("countdown");
    expect(session.results).toHaveLength(0);
  });

  it("waits at an onset for fresh correct notes and records mistakes", async () => {
    await render(0, "once", true);
    await act(async () => session.start());
    expect(session.phase).toBe("waiting-note");
    expect(session.rollElapsedMs).toBe(0);
    expect(session.gate).toMatchObject({ onsetMs: 0, expectedNotes: [60], satisfiedNotes: [] });
    expect(session.expectedNotes).toEqual([60]);

    await act(async () => session.handleMidiNoteOn(61, 1400));
    expect(session.phase).toBe("waiting-note");
    expect(session.results[0]).toMatchObject({ result: "wrong", playedNote: 61 });
    expect(session.results[0].scoreQuarter).toBeCloseTo(0);

    await act(async () => session.handleMidiNoteOn(60, 1500));
    expect(session.phase).toBe("playing");
    expect(session.results[1]).toMatchObject({ result: "correct", playedNote: 60, timingErrorMs: 0 });
  });

  it("rebases playback after a gate and waits again at a repeated pitch", async () => {
    const repeated = [scoreEvent, { ...scoreEvent, id: "b", startQuarter: 1 }];
    await render(0, "once", true, repeated);
    await act(async () => session.start());
    await act(async () => session.handleMidiNoteOn(60, 1500));

    await act(async () => nextFrame?.(1900));
    expect(session.phase).toBe("playing");
    expect(session.elapsedMs).toBe(400);
    await act(async () => nextFrame?.(2050));
    expect(session.phase).toBe("waiting-note");
    expect(session.elapsedMs).toBe(500);
    expect(session.gate?.expectedNotes).toEqual([60]);
  });

  it("can enable for the next onset and disable an active gate", async () => {
    const repeated = [scoreEvent, { ...scoreEvent, id: "b", startQuarter: 1 }];
    let setPauseOnNotes!: (enabled: boolean) => void;
    function Harness() {
      const [pauseOnNotes, setPause] = useState(false);
      setPauseOnNotes = setPause;
      session = usePlaybackSession({ events: repeated, tempoChanges: [], handMode: "both", runMode: "once", pauseOnNotes, settings: { countdownSeconds: 0, fallbackBpm: 120, hitToleranceMs: 250, showHitsWhilePlaying: false } });
      return null;
    }
    await act(async () => root.render(<Harness />));
    await act(async () => session.start());
    await act(async () => nextFrame?.(1200));
    await act(async () => setPauseOnNotes(true));
    await act(async () => nextFrame?.(1600));
    expect(session.phase).toBe("waiting-note");
    expect(session.gate?.onsetMs).toBe(500);

    await act(async () => setPauseOnNotes(false));
    expect(session.phase).toBe("playing");
    expect(session.gate).toBeUndefined();
  });
});
