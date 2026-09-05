import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CapturedMidiMessage } from "../hooks/useMidiInput";
import { FoundationRhythmLesson } from "./FoundationRhythmLesson";

vi.mock("../audio/pianoSynth", () => ({ PianoSynthEngine: class { prepare = vi.fn().mockResolvedValue(undefined); setOutput = vi.fn(); scheduleNote = vi.fn(); stopAll = vi.fn(); close = vi.fn(); } }));
vi.mock("../audio/metronome", () => ({ WebAudioMetronomeEngine: class { prepare = vi.fn().mockResolvedValue(undefined); setVolume = vi.fn(); scheduleClick = vi.fn(); stopAll = vi.fn(); close = vi.fn(); } }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
describe("Lesson 4 guided rhythm", () => {
  let root: Root;
  let container: HTMLDivElement;
  let events: CapturedMidiMessage[];
  let held: number[];
  beforeEach(() => { vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] }); container = document.createElement("div"); document.body.append(container); root = createRoot(container); events = []; held = []; });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); });
  const render = async () => { await act(async () => root.render(<FoundationRhythmLesson events={events} connected heldNotes={held} keyboard={() => null} onNext={vi.fn()} />)); };
  const click = async (text: string) => { const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes(text)); expect(button).toBeDefined(); await act(async () => button!.click()); };
  const advance = async (ms: number) => { await act(async () => vi.advanceTimersByTime(ms)); };
  const key = async (kind: "note-on" | "note-off") => {
    const before = held; held = kind === "note-on" ? [60] : [];
    events = [...events, { id: events.length + 1, message: { kind, command: kind === "note-on" ? 144 : 128, raw: [], noteNumber: 60, velocity: kind === "note-on" ? 90 : 0, channel: 0 }, receivedAtMs: performance.now(), heldNotesBefore: before, heldNotesAfter: held }];
    await render();
  };
  it("waits for a fresh key, then checks a full bar including the final release", async () => {
    await render(); await click("Two-beat holds"); await click("Try with guidance");
    await advance(3000); expect(container.textContent).toContain("Press middle C to begin");
    await key("note-on"); await advance(2000); await key("note-off"); await key("note-on");
    expect(container.textContent).not.toContain("That matched the rhythm");
    await advance(2000); await key("note-off"); await advance(350);
    expect(container.textContent).toContain("That matched the rhythm");
  });
  it("keeps the bar moving after an early release and offers a retry", async () => {
    await render(); await click("Two-beat holds"); await click("Try with guidance"); await key("note-on"); await advance(300); await key("note-off");
    expect(container.textContent).toContain("Released early");
    expect(container.textContent).not.toContain("Let’s try that bar again");
    await advance(4050); expect(container.textContent).toContain("Let’s try that bar again");
    expect(container.textContent).toContain("Early");
    expect(container.querySelectorAll(".rhythm-note-result")).toHaveLength(2);
    expect(container.textContent).not.toContain("Next lesson");
  });
});
