import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CapturedMidiMessage } from "../hooks/useMidiInput";
import { FoundationPhraseLesson } from "./FoundationPhraseLesson";

vi.mock("../audio/pianoSynth", () => ({ PianoSynthEngine: class { prepare = vi.fn().mockResolvedValue(undefined); setOutput = vi.fn(); scheduleNote = vi.fn(); stopAll = vi.fn(); close = vi.fn(); } }));
vi.mock("../audio/metronome", () => ({ WebAudioMetronomeEngine: class { prepare = vi.fn().mockResolvedValue(undefined); setVolume = vi.fn(); scheduleClick = vi.fn(); stopAll = vi.fn(); close = vi.fn(); } }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Lesson 5 guided phrase", () => {
  let root: Root; let container: HTMLDivElement; let events: CapturedMidiMessage[] = []; let held: number[] = [];
  beforeEach(() => { vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] }); container = document.createElement("div"); document.body.append(container); root = createRoot(container); events = []; held = []; });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); });
  const render = async () => { await act(async () => root.render(<FoundationPhraseLesson events={events} connected heldNotes={held} keyboard={() => null} onNext={vi.fn()} />)); };
  const key = async (kind: "note-on" | "note-off", note: number) => { const before = held; held = kind === "note-on" ? [note] : []; events = [...events, { id: events.length + 1, message: { kind, command: kind === "note-on" ? 144 : 128, raw: [], noteNumber: note, velocity: kind === "note-on" ? 90 : 0, channel: 0 }, receivedAtMs: performance.now(), heldNotesBefore: before, heldNotesAfter: held }]; await render(); };
  const advance = async (ms: number) => { await act(async () => vi.advanceTimersByTime(ms)); };

  it("reviews every pitch and release before completing the phrase", async () => {
    await render();
    const start = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Try with guidance"));
    await act(async () => start!.click());
    for (const [note, beats] of [[60, 1], [62, 1], [64, 2], [62, 1], [60, 1], [64, 2]] as const) { await key("note-on", note); await advance(beats * 1000); await key("note-off", note); }
    await advance(350);
    expect(container.textContent).toContain("That matched the phrase");
    expect(container.querySelectorAll(".rhythm-note-result.correct")).toHaveLength(6);
    expect(container.textContent).toContain("Next lesson");
  });
});
