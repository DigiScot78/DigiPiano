import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScoreEvent } from "../music/scoreTypes";
import type { ScoreSelectionRange } from "../learning/matcher";
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

  async function render(countdownSeconds = 0, runMode: "once" | "loop" = "once", pauseOnNotes = false, events = scoreEvents, untimedPractice = false, range?: ScoreSelectionRange) {
    function Harness() {
      session = usePlaybackSession({ events, tempoChanges: [], handMode: "both", range, runMode, pauseOnNotes, untimedPractice, settings: { playMode: untimedPractice ? "practice" : "play", countInBars: countdownSeconds === 0 ? 0 : 1, fallbackBpm: 120, hitToleranceMs: 250, showHitsWhilePlaying: false, playFullscreen: false } });
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
    expect(session.rollElapsedMs).toBe(-2000);
    await act(async () => nextFrame?.(2800));
    expect(session.phase).toBe("countdown");
    expect(session.countdownValue).toBe(1);
    expect(session.rollElapsedMs).toBe(-200);
    await act(async () => nextFrame?.(3000));
    expect(session.phase).toBe("playing");
    expect(session.showStartCue).toBe(true);
    await act(async () => nextFrame?.(3301));
    expect(session.phase).toBe("playing");
    expect(session.showStartCue).toBe(false);
    await act(async () => nextFrame?.(3501));
    expect(session.phase).toBe("waiting-restart");
    expect(session.completedRun).toMatchObject({ id: 1, playMode: "play", handMode: "both" });
    await act(async () => session.handleMidiNoteOn(60, 3600));
    expect(session.phase).toBe("countdown");
    expect(session.results).toHaveLength(0);
  });

  it("records wrong and correct attempts while waiting at a note gate", async () => {
    await render(0, "once", true);
    await act(async () => session.start());
    expect(session.phase).toBe("waiting-note");
    expect(session.rollElapsedMs).toBe(0);
    expect(session.gate).toMatchObject({ onsetMs: 0, expectedNotes: [60], satisfiedNotes: [] });
    expect(session.expectedNotes).toEqual([60]);

    await act(async () => session.handleMidiNoteOn(61, 1400));
    expect(session.phase).toBe("waiting-note");
    expect(session.results).toHaveLength(1);
    expect(session.results[0]).toMatchObject({ playedNote: 61, expectedNote: 60, timingErrorMs: 0, result: "wrong" });

    await act(async () => session.handleMidiNoteOn(60, 1500));
    expect(session.phase).toBe("playing");
    expect(session.results).toHaveLength(2);
    expect(session.results[1]).toMatchObject({ playedNote: 60, expectedNote: 60, timingErrorMs: 0, result: "correct" });
  });

  it("requires every chord note to be held concurrently at a gate", async () => {
    const chord = { ...scoreEvent, midiNotes: [60, 64], sourceNoteIds: ["60", "64"], noteDetails: [{ ...scoreEvent.noteDetails[0], midiNote: 60, sourceNoteId: "60" }, { ...scoreEvent.noteDetails[0], midiNote: 64, sourceNoteId: "64" }] };
    await render(0, "once", true, [chord]);
    await act(async () => session.start());

    await act(async () => session.handleMidiNoteOn(60, 1200, [60]));
    expect(session.gate?.satisfiedNotes).toEqual([60]);
    await act(async () => session.handleHeldNotesChange([]));
    expect(session.gate?.satisfiedNotes).toEqual([]);
    await act(async () => session.handleMidiNoteOn(64, 1300, [64]));
    expect(session.phase).toBe("waiting-note");
    await act(async () => session.handleMidiNoteOn(60, 1400, [60, 64]));
    expect(session.phase).toBe("playing");
    expect(session.results).toHaveLength(2);
    expect(session.results.every((result) => result.result === "correct")).toBe(true);
  });

  it("accepts a released arpeggio in order instead of requiring a held chord", async () => {
    const rolled = { ...scoreEvent, midiNotes: [60, 64, 67], sourceNoteIds: ["60", "64", "67"], noteDetails: [60, 64, 67].map((midiNote) => ({ ...scoreEvent.noteDetails[0], midiNote, sourceNoteId: String(midiNote), arpeggio: { direction: "up" as const } })) };
    await render(0, "once", true, [rolled]);
    await act(async () => session.start());
    await act(async () => session.handleMidiNoteOn(60, 1100, [60]));
    await act(async () => session.handleHeldNotesChange([]));
    await act(async () => session.handleMidiNoteOn(64, 1300, [64]));
    await act(async () => session.handleHeldNotesChange([]));
    expect(session.phase).toBe("waiting-note");
    await act(async () => session.handleMidiNoteOn(67, 1500, [67]));
    expect(session.phase).toBe("playing");
    expect(session.results).toHaveLength(3);
    expect(session.results.every((result) => result.result === "correct")).toBe(true);
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

  it("previews only the next unopened gate after completing a sustained note", async () => {
    const sustained = { ...scoreEvent, durationQuarters: 4 };
    const next = { ...scoreEvent, id: "b", startQuarter: 1, midiNotes: [67], sourceNoteIds: ["67"], noteDetails: [{ ...scoreEvent.noteDetails[0], midiNote: 67, sourceNoteId: "67" }] };
    await render(0, "once", true, [sustained, next]);
    await act(async () => session.start());
    expect(session.nextPendingGateOnsetMs).toBe(0);

    await act(async () => session.handleMidiNoteOn(60, 1100, [60]));

    expect(session.phase).toBe("playing");
    expect(session.nextPendingGateOnsetMs).toBe(500);
    expect(session.expectedNotes).toEqual([67]);
  });

  it("reveals the complete next gate one quarter-note beat before its onset", async () => {
    const first = scoreEvent;
    const chord = { ...scoreEvent, id: "later", startQuarter: 4, midiNotes: [64, 67], sourceNoteIds: ["64", "67"], noteDetails: [64, 67].map((midiNote) => ({ ...scoreEvent.noteDetails[0], midiNote, sourceNoteId: String(midiNote) })) };
    await render(0, "once", true, [first, chord]);
    await act(async () => session.start());
    await act(async () => session.handleMidiNoteOn(60, 1100, [60]));

    await act(async () => nextFrame?.(2000));
    expect(session.elapsedMs).toBe(900);
    expect(session.expectedNotes).toEqual([]);
    expect(session.expectationStrength).toBeUndefined();

    await act(async () => nextFrame?.(2600));
    expect(session.elapsedMs).toBe(1500);
    expect(session.expectedNotes).toEqual([64, 67]);
    expect(session.expectedEventIndices).toEqual([1]);
    expect(session.expectationStrength).toBe("preview");

    await act(async () => nextFrame?.(3100));
    expect(session.phase).toBe("waiting-note");
    expect(session.expectedNotes).toEqual([64, 67]);
    expect(session.expectationStrength).toBe("active");
  });

  it("advances an untimed scored practice directly between gates", async () => {
    const repeated = [scoreEvent, { ...scoreEvent, id: "b", startQuarter: 4, midiNotes: [64], sourceNoteIds: ["64"], noteDetails: [{ ...scoreEvent.noteDetails[0], midiNote: 64, sourceNoteId: "64" }] }];
    await render(0, "once", false, repeated, true);
    await act(async () => session.start());
    expect(session.phase).toBe("waiting-note");
    await act(async () => session.handleMidiNoteOn(61, 1100));
    await act(async () => session.handleMidiNoteOn(60, 1200));
    expect(session.phase).toBe("waiting-note");
    expect(session.elapsedMs).toBe(2000);
    expect(session.expectedNotes).toEqual([64]);
    await act(async () => session.handleMidiNoteOn(64, 1300));
    expect(session.phase).toBe("idle");
    expect(session.results.map((result) => result.result)).toEqual(["wrong", "correct", "correct"]);
    expect(session.completedRun).toMatchObject({ id: 1, results: [{ result: "wrong" }, { result: "correct" }, { result: "correct" }] });
  });

  it("skips the configured countdown and start cue in untimed practice", async () => {
    await render(1, "once", false, scoreEvents, true);
    await act(async () => session.start());
    expect(session.phase).toBe("waiting-note");
    expect(session.countInPlan).toEqual({ durationMs: 0, beats: [] });
    expect(session.countdownValue).toBeUndefined();
    expect(session.showStartCue).toBe(false);
  });

  it("carries completed gate notes until they are physically released", async () => {
    const next = { ...scoreEvent, id: "b", startQuarter: 1, midiNotes: [64], sourceNoteIds: ["64"], noteDetails: [{ ...scoreEvent.noteDetails[0], midiNote: 64, sourceNoteId: "64" }] };
    await render(0, "once", false, [scoreEvent, next], true);
    await act(async () => session.start());
    await act(async () => session.handleMidiNoteOn(60, 1100, [60]));
    expect(session.expectedNotes).toEqual([64]);
    expect(session.carriedNotes).toEqual([60]);
    await act(async () => session.handleHeldNotesChange([60]));
    expect(session.carriedNotes).toEqual([60]);
    await act(async () => session.handleHeldNotesChange([]));
    expect(session.carriedNotes).toEqual([]);
  });

  it("can stop from loop restart waiting", async () => {
    await render(0, "loop");
    await act(async () => session.start());
    await act(async () => nextFrame?.(1600));
    expect(session.phase).toBe("waiting-restart");
    await act(async () => session.stopAtPlanStart());
    expect(session.phase).toBe("idle");
    expect(session.elapsedMs).toBe(0);
  });

  it("can enable for the next onset and disable an active gate", async () => {
    const repeated = [scoreEvent, { ...scoreEvent, id: "b", startQuarter: 1 }];
    let setPauseOnNotes!: (enabled: boolean) => void;
    function Harness() {
      const [pauseOnNotes, setPause] = useState(false);
      setPauseOnNotes = setPause;
      session = usePlaybackSession({ events: repeated, tempoChanges: [], handMode: "both", runMode: "once", pauseOnNotes, settings: { playMode: "play", countInBars: 0, fallbackBpm: 120, hitToleranceMs: 250, showHitsWhilePlaying: false, playFullscreen: false } });
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

  it("pauses playback and uses a fresh countdown before resuming from the frozen position", async () => {
    const repeated = [scoreEvent, { ...scoreEvent, id: "b", startQuarter: 2 }];
    await render(1, "once", false, repeated);
    await act(async () => session.start());
    await act(async () => nextFrame?.(3000));
    await act(async () => nextFrame?.(3400));
    expect(session.elapsedMs).toBe(400);

    await act(async () => session.pause());
    expect(session.phase).toBe("paused");
    expect(session.elapsedMs).toBe(400);

    vi.mocked(performance.now).mockReturnValue(4000);
    await act(async () => session.resume());
    expect(session.phase).toBe("countdown");
    expect(session.rollElapsedMs).toBe(-1600);
    await act(async () => nextFrame?.(6000));
    expect(session.phase).toBe("playing");
    await act(async () => nextFrame?.(6250));
    expect(session.elapsedMs).toBe(650);
  });

  it("stops at the plan start, preserves results, and starts a fresh attempt next time", async () => {
    const repeated = [scoreEvent, { ...scoreEvent, id: "b", startQuarter: 2 }];
    await render(1, "once", false, repeated);
    await act(async () => session.start());
    await act(async () => nextFrame?.(3000));
    await act(async () => session.handleMidiNoteOn(60, 3050));
    await act(async () => nextFrame?.(3400));
    expect(session.elapsedMs).toBe(400);

    await act(async () => session.stopAtPlanStart());
    expect(session.phase).toBe("idle");
    expect(session.elapsedMs).toBe(0);
    expect(session.results).toHaveLength(1);
    expect(session.completedRun).toBeUndefined();

    vi.mocked(performance.now).mockReturnValue(4000);
    await act(async () => session.togglePlayback());
    expect(session.phase).toBe("countdown");
    expect(session.rollElapsedMs).toBe(-2000);
    expect(session.results).toHaveLength(0);
    await act(async () => nextFrame?.(6000));
    expect(session.phase).toBe("playing");
    await act(async () => nextFrame?.(6200));
    expect(session.elapsedMs).toBe(200);
  });

  it("stops a gate at the plan start and clears partial satisfaction", async () => {
    const chord = { ...scoreEvent, midiNotes: [60, 64], sourceNoteIds: ["60", "64"], noteDetails: [{ ...scoreEvent.noteDetails[0], midiNote: 60, sourceNoteId: "60" }, { ...scoreEvent.noteDetails[0], midiNote: 64, sourceNoteId: "64" }] };
    await render(0, "once", true, [chord]);
    await act(async () => session.start());
    await act(async () => session.handleMidiNoteOn(60, 1100, [60]));
    expect(session.gate?.satisfiedNotes).toEqual([60]);
    await act(async () => session.stopAtPlanStart());
    expect(session.phase).toBe("idle");
    expect(session.elapsedMs).toBe(0);
    expect(session.results).toHaveLength(1);
    await act(async () => session.togglePlayback());
    expect(session.phase).toBe("waiting-note");
    expect(session.gate?.satisfiedNotes).toEqual([]);
    expect(session.results).toHaveLength(0);
  });

  it("uses the selected range start as the Stop destination", async () => {
    const repeated = [scoreEvent, { ...scoreEvent, id: "b", startQuarter: 2, midiNotes: [64], sourceNoteIds: ["64"], noteDetails: [{ ...scoreEvent.noteDetails[0], midiNote: 64, sourceNoteId: "64" }] }];
    await render(0, "once", false, repeated, false, { startIndex: 1, endIndex: 1 });
    expect(session.plan?.events[0]?.eventIndex).toBe(1);
    await act(async () => session.start());
    await act(async () => session.handleMidiNoteOn(64, 1100));
    await act(async () => session.stopAtPlanStart());
    expect(session.phase).toBe("idle");
    expect(session.elapsedMs).toBe(0);
    expect(session.results).toHaveLength(1);
  });

  it("suspends a note gate while manually paused and restores it after the resume countdown", async () => {
    await render(1, "once", true);
    await act(async () => session.start());
    await act(async () => nextFrame?.(3000));
    expect(session.phase).toBe("waiting-note");
    await act(async () => session.pause());
    await act(async () => session.handleMidiNoteOn(60, 2100));
    expect(session.results).toHaveLength(0);

    vi.mocked(performance.now).mockReturnValue(3200);
    await act(async () => session.resume());
    expect(session.phase).toBe("countdown");
    await act(async () => nextFrame?.(5200));
    expect(session.phase).toBe("waiting-note");
    expect(session.gate?.expectedNotes).toEqual([60]);
  });

  it("seeks to a playable event in a clean paused state and reset returns to the start", async () => {
    const repeated = [scoreEvent, { ...scoreEvent, id: "b", startQuarter: 2 }];
    await render(0, "once", false, repeated);
    await act(async () => session.start());
    await act(async () => session.handleMidiNoteOn(60, 1100));
    expect(session.results).toHaveLength(1);
    await act(async () => session.seekToEvent(1));
    expect(session.phase).toBe("paused");
    expect(session.elapsedMs).toBe(1000);
    expect(session.currentEventIndex).toBe(1);
    expect(session.results).toHaveLength(0);
    await act(async () => session.reset());
    expect(session.phase).toBe("idle");
    expect(session.elapsedMs).toBe(0);
  });

  it("can start a fresh run from the current playable event", async () => {
    const repeated = [scoreEvent, { ...scoreEvent, id: "b", startQuarter: 2 }];
    await render(1, "once", false, repeated);
    await act(async () => session.startAtEvent(1));
    expect(session.phase).toBe("countdown");
    expect(session.elapsedMs).toBe(1000);
    expect(session.currentEventIndex).toBe(1);
    expect(session.rollElapsedMs).toBe(-1000);
    await act(async () => nextFrame?.(3000));
    expect(session.phase).toBe("playing");
    expect(session.elapsedMs).toBe(1000);
  });
});
