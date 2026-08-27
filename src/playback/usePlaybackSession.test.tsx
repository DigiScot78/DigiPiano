import { act } from "react";
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

  async function render(countdownSeconds = 0, runMode: "once" | "loop" = "once") {
    function Harness() {
      session = usePlaybackSession({ events: scoreEvents, tempoChanges: [], handMode: "both", runMode, settings: { countdownSeconds, fallbackBpm: 120, hitToleranceMs: 250, showHitsWhilePlaying: false } });
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
    await act(async () => nextFrame?.(1800));
    expect(session.phase).toBe("countdown");
    expect(session.countdownValue).toBe(1);
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
});
