import { describe, expect, it } from "vitest";
import { metronomeBeatsInWindow, metronomeBeatsToSchedule } from "./metronome";

describe("metronome scheduling", () => {
  const beats = [
    { id: "a", onsetMs: 0, accent: true },
    { id: "b", onsetMs: 500, accent: false },
    { id: "c", onsetMs: 1000, accent: false },
  ];

  it("selects only unscheduled clicks inside the lookahead", () => {
    expect(metronomeBeatsInWindow(beats, 390, new Set(["b"]), 120)).toEqual([]);
    expect(metronomeBeatsInWindow(beats, 390, new Set(), 120)).toEqual([beats[1]]);
  });

  it("does not replay clicks that are already behind the transport", () => {
    expect(metronomeBeatsInWindow(beats, 700, new Set(), 120)).toEqual([]);
  });

  it("queues every remaining count-in click instead of relying on rolling lookahead", () => {
    expect(metronomeBeatsToSchedule(beats, 0, new Set(), "countdown")).toEqual(beats);
    expect(metronomeBeatsToSchedule(beats, 0, new Set(), "playing")).toEqual([beats[0]]);
  });
});
