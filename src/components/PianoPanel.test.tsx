import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PIANO_SETTINGS, type PianoSettings } from "../piano/piano";
import type { PlaybackPlan } from "../playback/playback";
import type { ScoreEvent } from "../music/scoreTypes";
import type { ScoreAudioEngine } from "../audio/pianoSynth";
import { PianoPanel } from "./PianoPanel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("PianoPanel", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

  async function render(settings: PianoSettings = DEFAULT_PIANO_SETTINGS, expectedNotes = [60], heldNotes: number[] = [], carried: number[] = [], onChange = vi.fn()) {
    await act(async () => root.render(<PianoPanel expectedNotes={expectedNotes} heldNotes={heldNotes} ignoredCarriedNotes={carried} settings={settings} playbackPhase="idle" rollElapsedMs={0} playbackElapsedMs={0} displayedEventIndex={0} canPlay={true} runMode="once" pauseOnNotes={false} canClearPerformance={false} onSettingsChange={onChange} onTogglePlayback={vi.fn()} onReset={vi.fn()} onSeek={vi.fn()} onRunModeChange={vi.fn()} onPauseOnNotesChange={vi.fn()} onClearPerformance={vi.fn()} />));
    return onChange;
  }

  it("renders all 88 keys with hidden labels and accessible names", async () => {
    await render();
    expect(container.querySelectorAll(".piano-key")).toHaveLength(88);
    expect(container.querySelector('[aria-label="C4, expected"]')).not.toBeNull();
    expect(container.querySelector(".piano-key span")).toBeNull();
  });

  it("shows labels and distinct held states", async () => {
    await render({ ...DEFAULT_PIANO_SETTINGS, showLabels: true }, [60], [60, 61, 62], [62]);
    expect(container.querySelector('[data-midi-note="60"]')?.className).toContain("state-correct");
    expect(container.querySelector('[data-midi-note="61"]')?.className).toContain("state-wrong");
    expect(container.querySelector('[data-midi-note="62"]')?.className).toContain("state-carried");
    expect(container.querySelector('[data-midi-note="61"] span')?.textContent).toBe("C#4");
  });

  it("auditions clicked keys through an isolated audio engine", async () => {
    const auditionEngine: ScoreAudioEngine = {
      prepare: vi.fn().mockResolvedValue(undefined),
      setOutput: vi.fn(),
      scheduleNote: vi.fn(),
      cancelFuture: vi.fn(),
      stopAll: vi.fn(),
      close: vi.fn(),
    };
    await act(async () => root.render(<PianoPanel expectedNotes={[]} heldNotes={[]} ignoredCarriedNotes={[]} settings={DEFAULT_PIANO_SETTINGS} playbackPhase="idle" rollElapsedMs={0} playbackElapsedMs={0} displayedEventIndex={0} canPlay={false} runMode="once" pauseOnNotes={false} canClearPerformance={false} audioSettings={{ muted: false, volume: 42 }} auditionEngine={auditionEngine} onSettingsChange={vi.fn()} onTogglePlayback={vi.fn()} onReset={vi.fn()} onSeek={vi.fn()} onRunModeChange={vi.fn()} onPauseOnNotesChange={vi.fn()} onClearPerformance={vi.fn()} />));
    const middleC = container.querySelector<HTMLElement>('[data-midi-note="60"]');
    await act(async () => middleC?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 })));
    expect(auditionEngine.prepare).toHaveBeenCalledOnce();
    expect(auditionEngine.setOutput).toHaveBeenLastCalledWith(42, false);
    expect(auditionEngine.scheduleNote).toHaveBeenCalledWith(expect.stringMatching(/^pointer:1:60$/), 60, 0, 650);
    expect(middleC?.className).toContain("auditioning");
  });

  it("keeps the permanent toolbar when the piano is hidden", async () => {
    const onChange = await render({ ...DEFAULT_PIANO_SETTINGS, pianoVisible: false });
    expect(container.querySelectorAll(".piano-key")).toHaveLength(0);
    const button = container.querySelector<HTMLButtonElement>(".piano-toggle");
    expect(container.querySelector(".piano-panel")?.className).toContain("piano-hidden");
    expect(button?.getAttribute("aria-label")).toBe("Show piano");
    expect(container.querySelector('[aria-label="Toggle Synthesia"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Play score from piano"]')).not.toBeNull();
    await act(async () => button?.click());
    expect(onChange).toHaveBeenCalledWith({ pianoVisible: true });
  });

  it("warns about and reveals expected notes outside the range", async () => {
    const onChange = await render({ ...DEFAULT_PIANO_SETTINGS, rangePreset: "49" }, [100]);
    expect(container.querySelector(".piano-warning")?.textContent).toContain("E7");
    await act(async () => container.querySelector<HTMLButtonElement>(".piano-warning button")?.click());
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ rangePreset: "custom", customHigh: 100 }));
  });

  it("applies Fit without a minimum keyboard width", async () => {
    await render({ ...DEFAULT_PIANO_SETTINGS, widthMode: "fit" });
    expect(container.querySelector<HTMLElement>(".piano-keyboard")?.style.minWidth).toBe("");
    expect(container.querySelector(".piano-viewport")?.className).toContain("width-fit");
  });

  it("moves piano presentation controls into an accessible options popover", async () => {
    const onChange = await render();
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Piano options"]')?.click());
    expect(container.querySelector('[role="dialog"][aria-label="Piano options"]')).not.toBeNull();
    await act(async () => container.querySelector<HTMLInputElement>('.piano-options-popover input[type="checkbox"]')?.click());
    expect(onChange).toHaveBeenCalledWith({ showLabels: true });
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(container.querySelector('[role="dialog"][aria-label="Piano options"]')).toBeNull();
  });

  it("keeps Synthesia visible independently when the piano is hidden", async () => {
    await render({ ...DEFAULT_PIANO_SETTINGS, pianoVisible: false, synthesiaEnabled: true });
    expect(container.querySelector(".synthesia-panel")).not.toBeNull();
    expect(container.querySelector('[aria-label="Toggle Synthesia"]')?.getAttribute("aria-pressed")).toBe("true");
  });

  it("renders transparent lanes and toggles Synthesia from the piano toolbar", async () => {
    const onChange = await render({ ...DEFAULT_PIANO_SETTINGS, synthesiaEnabled: true });
    expect(container.querySelectorAll(".synthesia-lane")).toHaveLength(88);
    expect(container.querySelector(".synthesia-resize-handle")).not.toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Toggle Synthesia"]')?.click());
    expect(onChange).toHaveBeenCalledWith({ synthesiaEnabled: false });
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Synthesia options"]')?.click());
    expect(container.querySelector('[role="dialog"][aria-label="Synthesia options"]')).not.toBeNull();
    const optionChecks = container.querySelectorAll<HTMLInputElement>('.synthesia-options-popover input[type="checkbox"]');
    await act(async () => { optionChecks[0]?.click(); optionChecks[1]?.click(); });
    expect(onChange).toHaveBeenCalledWith({ synthesiaOpaque: true });
    expect(onChange).toHaveBeenCalledWith({ synthesiaShowNoteLabels: true });
    const speed = container.querySelector<HTMLSelectElement>('[aria-label="Piano roll speed"]');
    expect(speed?.value).toBe("100");
    await act(async () => { if (speed) { speed.value = "140"; speed.dispatchEvent(new Event("change", { bubbles: true })); } });
    expect(onChange).toHaveBeenCalledWith({ synthesiaSpeed: 140 });
  });

  it("routes the duplicated transport controls to shared callbacks", async () => {
    const onPlay = vi.fn();
    const onReset = vi.fn();
    const onRunModeChange = vi.fn();
    const onPauseOnNotesChange = vi.fn();
    const onClearPerformance = vi.fn();
    await act(async () => root.render(<PianoPanel expectedNotes={[]} heldNotes={[]} ignoredCarriedNotes={[]} settings={DEFAULT_PIANO_SETTINGS} playbackPhase="idle" rollElapsedMs={0} playbackElapsedMs={0} displayedEventIndex={0} canPlay={true} runMode="once" pauseOnNotes={false} canClearPerformance={true} audioSettings={{ muted: false, volume: 65 }} onSettingsChange={vi.fn()} onTogglePlayback={onPlay} onReset={onReset} onSeek={vi.fn()} onRunModeChange={onRunModeChange} onPauseOnNotesChange={onPauseOnNotesChange} onClearPerformance={onClearPerformance} onAudioSettingsChange={vi.fn()} />));
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Play score from piano"]')?.click();
      container.querySelector<HTMLButtonElement>('[aria-label="Reset score progress from piano"]')?.click();
      container.querySelector<HTMLButtonElement>('[aria-label="Loop from piano"]')?.click();
      container.querySelector<HTMLButtonElement>('[aria-label="Pause at each note from piano"]')?.click();
      container.querySelector<HTMLButtonElement>('[aria-label="Clear performance from piano"]')?.click();
    });
    expect(onPlay).toHaveBeenCalledOnce();
    expect(onReset).toHaveBeenCalledOnce();
    expect(onRunModeChange).toHaveBeenCalledWith("loop");
    expect(onPauseOnNotesChange).toHaveBeenCalledWith(true);
    expect(onClearPerformance).toHaveBeenCalledOnce();
    expect(Array.from(container.querySelectorAll<HTMLButtonElement>(".toolbar-centre button")).map((button) => button.getAttribute("aria-label"))).toEqual([
      "Play score from piano",
      "Reset score progress from piano",
      "Loop from piano",
      "Pause at each note from piano",
      "Clear performance from piano",
    ]);
    expect(container.querySelector(".toolbar-left")).not.toBeNull();
    expect(container.querySelector(".toolbar-right .audio-controls")).not.toBeNull();
  });

  it("shows a selection-relative Synthesia timeline and seeks to the nearest event", async () => {
    const event = (id: string, startQuarter: number, staffNumber: number): ScoreEvent => ({ id, partId: "P1", measureNumber: 1, startQuarter, durationQuarters: 1, midiNotes: [60], staffNumbers: [staffNumber], voiceNumbers: ["1"], sourceNoteIds: [id], noteDetails: [{ midiNote: 60, staffNumber, voiceNumber: "1", sourceNoteId: id }] });
    const plan: PlaybackPlan = { startQuarter: 4, endQuarter: 6, durationMs: 1000, events: [{ eventIndex: 4, event: event("a", 4, 1), onsetMs: 0, endMs: 500 }, { eventIndex: 5, event: event("b", 5, 2), onsetMs: 500, endMs: 1000 }] };
    const onSeek = vi.fn();
    await act(async () => root.render(<PianoPanel expectedNotes={[]} heldNotes={[]} ignoredCarriedNotes={[]} settings={{ ...DEFAULT_PIANO_SETTINGS, synthesiaEnabled: true }} playbackPlan={plan} playbackPhase="playing" rollElapsedMs={400} playbackElapsedMs={400} displayedEventIndex={4} canPlay={true} runMode="once" pauseOnNotes={false} canClearPerformance={false} onSettingsChange={vi.fn()} onTogglePlayback={vi.fn()} onReset={vi.fn()} onSeek={onSeek} onRunModeChange={vi.fn()} onPauseOnNotesChange={vi.fn()} onClearPerformance={vi.fn()} />));
    expect(container.querySelectorAll(".score-timeline-event")).toHaveLength(2);
    const input = container.querySelector<HTMLInputElement>('[aria-label="Seek score timeline"]');
    await act(async () => { if (input) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "480"); input.dispatchEvent(new Event("input", { bubbles: true })); } });
    expect(onSeek).toHaveBeenCalledWith(5);
  });

  it("keeps the timeline available without Synthesia and with the piano hidden", async () => {
    const event: ScoreEvent = { id: "a", partId: "P1", measureNumber: 1, startQuarter: 0, durationQuarters: 1, midiNotes: [60], staffNumbers: [1], voiceNumbers: ["1"], sourceNoteIds: ["a"], noteDetails: [{ midiNote: 60, staffNumber: 1, voiceNumber: "1", sourceNoteId: "a" }] };
    const plan: PlaybackPlan = { startQuarter: 0, endQuarter: 1, durationMs: 500, events: [{ eventIndex: 0, event, onsetMs: 0, endMs: 500 }] };
    await act(async () => root.render(<PianoPanel expectedNotes={[]} heldNotes={[]} ignoredCarriedNotes={[]} settings={{ ...DEFAULT_PIANO_SETTINGS, pianoVisible: false, synthesiaEnabled: false }} playbackPlan={plan} playbackPhase="idle" rollElapsedMs={0} playbackElapsedMs={0} displayedEventIndex={0} canPlay={true} runMode="once" pauseOnNotes={false} canClearPerformance={false} onSettingsChange={vi.fn()} onTogglePlayback={vi.fn()} onReset={vi.fn()} onSeek={vi.fn()} onRunModeChange={vi.fn()} onPauseOnNotesChange={vi.fn()} onClearPerformance={vi.fn()} />));
    expect(container.querySelector(".piano-panel")?.className).toContain("timeline-visible");
    expect(container.querySelector(".score-timeline")).not.toBeNull();
    expect(container.querySelectorAll(".piano-key")).toHaveLength(0);
  });
});
