import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PIANO_SETTINGS, pianoExpectationsForEvents, type PianoSettings } from "../piano/piano";
import type { PlaybackPlan } from "../playback/playback";
import type { ScoreEvent } from "../music/scoreTypes";
import type { ScoreAudioEngine } from "../audio/pianoSynth";
import { PianoPanel } from "./PianoPanel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("PianoPanel", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });

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

  it("fills practice expectations by score hand independently of Synthesia", async () => {
    const event: ScoreEvent = { id: "hands", partId: "P1", measureNumber: 1, startQuarter: 0, durationQuarters: 1, midiNotes: [48, 60], staffNumbers: [1, 2], voiceNumbers: ["1", "2"], sourceNoteIds: ["lh", "rh"], noteDetails: [{ midiNote: 48, staffNumber: 2, voiceNumber: "2", sourceNoteId: "lh" }, { midiNote: 60, staffNumber: 1, voiceNumber: "1", sourceNoteId: "rh" }] };
    const plan: PlaybackPlan = { startQuarter: 0, endQuarter: 1, durationMs: 500, events: [{ eventIndex: 0, event, onsetMs: 0, endMs: 500 }] };
    const settings = { ...DEFAULT_PIANO_SETTINGS, playRightColor: "#112233", playLeftColor: "#445566", synthesiaRightColor: "#778899", synthesiaLeftColor: "#aabbcc" };
    await act(async () => root.render(<PianoPanel expectations={pianoExpectationsForEvents([event], [48, 60], "active")} heldNotes={[]} ignoredCarriedNotes={[]} settings={settings} playbackPlan={plan} playbackPhase="idle" rollElapsedMs={100} playbackElapsedMs={100} displayedEventIndex={0} canPlay={true} runMode="once" pauseOnNotes={false} canClearPerformance={false} onSettingsChange={vi.fn()} onTogglePlayback={vi.fn()} onReset={vi.fn()} onSeek={vi.fn()} onRunModeChange={vi.fn()} onPauseOnNotesChange={vi.fn()} onClearPerformance={vi.fn()} />));
    expect(container.querySelector('[data-midi-note="48"]')?.className).toContain("play-expected hand-left");
    expect(container.querySelector('[data-midi-note="60"]')?.className).toContain("play-expected hand-right");
    const panel = container.querySelector<HTMLElement>(".piano-panel");
    expect(panel?.style.getPropertyValue("--play-right")).toBe("#112233");
    expect(panel?.style.getPropertyValue("--synthesia-left")).toBe("#aabbcc");

    await act(async () => root.render(<PianoPanel expectations={pianoExpectationsForEvents([event], [48, 60], "preview")} heldNotes={[]} ignoredCarriedNotes={[]} settings={settings} playbackPlan={plan} playbackPhase="playing" rollElapsedMs={100} playbackElapsedMs={100} displayedEventIndex={0} canPlay={true} runMode="once" pauseOnNotes={true} canClearPerformance={false} onSettingsChange={vi.fn()} onTogglePlayback={vi.fn()} onReset={vi.fn()} onSeek={vi.fn()} onRunModeChange={vi.fn()} onPauseOnNotesChange={vi.fn()} onClearPerformance={vi.fn()} />));
    expect(container.querySelector('[data-midi-note="48"]')?.className).toContain("expectation-preview");
    expect(container.querySelector('[data-midi-note="60"]')?.className).toContain("expectation-preview");
  });

  it("returns a correct held playback key to carried neutral after its written duration", async () => {
    const event: ScoreEvent = { id: "held", partId: "P1", measureNumber: 1, startQuarter: 0, durationQuarters: 1, midiNotes: [60], staffNumbers: [1], voiceNumbers: ["1"], sourceNoteIds: ["held"], noteDetails: [{ midiNote: 60, staffNumber: 1, voiceNumber: "1", sourceNoteId: "held" }] };
    const plan: PlaybackPlan = { startQuarter: 0, endQuarter: 1, durationMs: 500, events: [{ eventIndex: 0, event, onsetMs: 0, endMs: 500 }] };
    const props = { expectedNotes: [60], heldNotes: [60], ignoredCarriedNotes: [], settings: DEFAULT_PIANO_SETTINGS, playbackPlan: plan, playbackPhase: "playing" as const, rollElapsedMs: 100, playbackElapsedMs: 100, displayedEventIndex: 0, canPlay: true, runMode: "once" as const, pauseOnNotes: false, canClearPerformance: false, onSettingsChange: vi.fn(), onTogglePlayback: vi.fn(), onReset: vi.fn(), onSeek: vi.fn(), onRunModeChange: vi.fn(), onPauseOnNotesChange: vi.fn(), onClearPerformance: vi.fn() };
    await act(async () => root.render(<PianoPanel {...props} />));
    expect(container.querySelector('[data-midi-note="60"]')?.className).toContain("state-correct");
    await act(async () => root.render(<PianoPanel {...props} expectedNotes={[]} rollElapsedMs={600} playbackElapsedMs={600} />));
    expect(container.querySelector('[data-midi-note="60"]')?.className).toContain("state-carried");
    expect(container.querySelector('[data-midi-note="60"]')?.className).not.toContain("state-wrong");
  });

  it("sustains a held key and retriggers it after leaving and re-entering", async () => {
    const auditionEngine: ScoreAudioEngine = {
      prepare: vi.fn().mockResolvedValue(undefined),
      setOutput: vi.fn(),
      scheduleNote: vi.fn(),
      stopNote: vi.fn(),
      cancelFuture: vi.fn(),
      stopAll: vi.fn(),
      close: vi.fn(),
    };
    await act(async () => root.render(<PianoPanel expectedNotes={[]} heldNotes={[]} ignoredCarriedNotes={[]} settings={DEFAULT_PIANO_SETTINGS} playbackPhase="idle" rollElapsedMs={0} playbackElapsedMs={0} displayedEventIndex={0} canPlay={false} runMode="once" pauseOnNotes={false} canClearPerformance={false} audioSettings={{ muted: false, volume: 42, metronomeEnabled: false, metronomeVolume: 55 }} auditionEngine={auditionEngine} onSettingsChange={vi.fn()} onTogglePlayback={vi.fn()} onReset={vi.fn()} onSeek={vi.fn()} onRunModeChange={vi.fn()} onPauseOnNotesChange={vi.fn()} onClearPerformance={vi.fn()} />));
    const middleC = container.querySelector<HTMLElement>('[data-midi-note="60"]');
    const d = container.querySelector<HTMLElement>('[data-midi-note="62"]');
    await act(async () => middleC?.dispatchEvent(pointerEvent("pointerdown", 7, 0)));
    expect(auditionEngine.prepare).toHaveBeenCalledOnce();
    expect(auditionEngine.setOutput).toHaveBeenLastCalledWith(42, false);
    expect(auditionEngine.scheduleNote).toHaveBeenCalledWith(expect.stringMatching(/^pointer:1:60$/), 60, 0, 600_000);
    expect(middleC?.className).toContain("auditioning");
    await act(async () => d?.dispatchEvent(pointerEvent("pointerover", 7)));
    expect(auditionEngine.stopNote).toHaveBeenCalledWith(expect.stringMatching(/^pointer:1:60$/));
    expect(auditionEngine.scheduleNote).toHaveBeenLastCalledWith(expect.stringMatching(/^pointer:2:62$/), 62, 0, 600_000);
    await act(async () => middleC?.dispatchEvent(pointerEvent("pointerover", 7)));
    expect(auditionEngine.scheduleNote).toHaveBeenLastCalledWith(expect.stringMatching(/^pointer:3:60$/), 60, 0, 600_000);
    expect(auditionEngine.scheduleNote).toHaveBeenCalledTimes(3);
    expect(auditionEngine.stopNote).toHaveBeenCalledTimes(2);
    expect(middleC?.className).toContain("auditioning");
    await act(async () => d?.dispatchEvent(pointerEvent("pointerup", 7)));
    expect(auditionEngine.stopNote).toHaveBeenLastCalledWith(expect.stringMatching(/^pointer:3:60$/));
    expect(d?.className).not.toContain("auditioning");
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

  it("temporarily reveals and extends the piano for See Note without changing settings", async () => {
    const onChange = vi.fn();
    await act(async () => root.render(<PianoPanel expectedNotes={[]} heldNotes={[]} ignoredCarriedNotes={[]} settings={{ ...DEFAULT_PIANO_SETTINGS, pianoVisible: false, rangePreset: "49" }} playbackPhase="idle" rollElapsedMs={0} playbackElapsedMs={0} displayedEventIndex={0} canPlay={true} runMode="once" pauseOnNotes={false} canClearPerformance={false} seeNoteEnabled inspectedMidiNote={100} onSeeNoteToggle={vi.fn()} onSettingsChange={onChange} onTogglePlayback={vi.fn()} onReset={vi.fn()} onSeek={vi.fn()} onRunModeChange={vi.fn()} onClearPerformance={vi.fn()} />));
    expect(container.querySelector('[data-midi-note="100"]')?.className).toContain("inspected");
    expect(container.querySelector('[data-midi-note="100"]')?.getAttribute("aria-label")).toContain("inspected score note");
    expect(container.querySelector('.piano-panel')?.className).not.toContain("piano-hidden");
    expect(onChange).not.toHaveBeenCalled();
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

  it("enables training fingerings and renders both hand styles above note names", async () => {
    const onChange = vi.fn();
    await act(async () => root.render(<PianoPanel expectedNotes={[]} heldNotes={[]} ignoredCarriedNotes={[]} fingerings={[{ midiNote: 60, hand: "left", finger: 1 }, { midiNote: 60, hand: "right", finger: 1 }, { midiNote: 62, hand: "right", finger: 2 }]} settings={{ ...DEFAULT_PIANO_SETTINGS, showLabels: true, showTrainingFingerings: true }} playbackPhase="idle" rollElapsedMs={0} playbackElapsedMs={0} displayedEventIndex={0} canPlay={true} runMode="once" pauseOnNotes={false} canClearPerformance={false} onSettingsChange={onChange} onTogglePlayback={vi.fn()} onReset={vi.fn()} onSeek={vi.fn()} onRunModeChange={vi.fn()} onClearPerformance={vi.fn()} />));
    const middleC = container.querySelector('[data-midi-note="60"]');
    expect(middleC?.querySelector(".piano-finger-number.hand-left")?.textContent).toBe("1");
    expect(middleC?.querySelector(".piano-finger-number.hand-right")?.textContent).toBe("1");
    expect(middleC?.querySelector(".piano-note-name")?.textContent).toBe("C4");
    expect(middleC?.getAttribute("aria-label")).toContain("left hand finger 1");
    expect(middleC?.getAttribute("aria-label")).toContain("right hand finger 1");

    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Piano options"]')?.click());
    const checks = container.querySelectorAll<HTMLInputElement>('.piano-options-popover input[type="checkbox"]');
    expect(checks[1]?.checked).toBe(true);
    await act(async () => checks[1]?.click());
    expect(onChange).toHaveBeenCalledWith({ showTrainingFingerings: false });
  });

  it("keeps Synthesia visible independently when the piano is hidden", async () => {
    await render({ ...DEFAULT_PIANO_SETTINGS, pianoVisible: false, synthesiaEnabled: true });
    expect(container.querySelector(".synthesia-panel")).not.toBeNull();
    expect(container.querySelector('[aria-label="Toggle Synthesia"]')?.getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps Learning idle-only and mutually exclusive with Synthesia", async () => {
    const onSettingsChange = vi.fn();
    const onLearningOpenChange = vi.fn();
    const props = { expectedNotes: [], heldNotes: [], ignoredCarriedNotes: [], settings: { ...DEFAULT_PIANO_SETTINGS, synthesiaEnabled: true }, playbackPhase: "idle" as const, rollElapsedMs: 0, playbackElapsedMs: 0, displayedEventIndex: 0, canPlay: true, runMode: "once" as const, pauseOnNotes: false, canClearPerformance: false, onSettingsChange, onLearningOpenChange, onTogglePlayback: vi.fn(), onReset: vi.fn(), onSeek: vi.fn(), onRunModeChange: vi.fn(), onClearPerformance: vi.fn() };
    await act(async () => root.render(<PianoPanel {...props} />));
    const learning = container.querySelector<HTMLButtonElement>('[aria-label="Toggle Learning"]');
    expect(learning?.getAttribute("aria-pressed")).toBe("false");
    expect(learning?.disabled).toBe(false);
    await act(async () => learning?.click());
    expect(onSettingsChange).toHaveBeenCalledWith({ synthesiaEnabled: false });
    expect(onLearningOpenChange).toHaveBeenCalledWith(true);

    onSettingsChange.mockClear();
    onLearningOpenChange.mockClear();
    await act(async () => root.render(<PianoPanel {...props} settings={{ ...DEFAULT_PIANO_SETTINGS, synthesiaEnabled: false }} learningOpen />));
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Toggle Synthesia"]')?.click());
    expect(onLearningOpenChange).toHaveBeenCalledWith(false);
    expect(onSettingsChange).toHaveBeenCalledWith({ synthesiaEnabled: true });

    await act(async () => root.render(<PianoPanel {...props} settings={{ ...DEFAULT_PIANO_SETTINGS, pianoVisible: false, synthesiaEnabled: false }} learningOpen />));
    expect(container.querySelectorAll(".piano-key")).toHaveLength(0);
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Toggle Learning"]')?.getAttribute("aria-pressed")).toBe("true");

    await act(async () => root.render(<PianoPanel {...props} settings={DEFAULT_PIANO_SETTINGS} playbackPhase="paused" learningOpen={false} />));
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Toggle Learning"]')?.disabled).toBe(true);
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
    const onStop = vi.fn();
    const onRunModeChange = vi.fn();
    const onPlayModeChange = vi.fn();
    const onClearPerformance = vi.fn();
    await act(async () => root.render(<PianoPanel expectedNotes={[]} heldNotes={[]} ignoredCarriedNotes={[]} settings={DEFAULT_PIANO_SETTINGS} playbackPhase="paused" rollElapsedMs={0} playbackElapsedMs={0} displayedEventIndex={0} canPlay={true} runMode="once" pauseOnNotes={false} playMode="play" canClearPerformance={true} audioSettings={{ muted: false, volume: 65, metronomeEnabled: false, metronomeVolume: 55 }} onSettingsChange={vi.fn()} onTogglePlayback={onPlay} onStop={onStop} onReset={onReset} onSeek={vi.fn()} onRunModeChange={onRunModeChange} onPlayModeChange={onPlayModeChange} onClearPerformance={onClearPerformance} onAudioSettingsChange={vi.fn()} />));
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Resume score from piano"]')?.click();
      container.querySelector<HTMLButtonElement>('[aria-label="Stop score playback from piano"]')?.click();
      container.querySelector<HTMLButtonElement>('[aria-label="Reset score progress from piano"]')?.click();
      container.querySelector<HTMLButtonElement>('[aria-label="Clear performance from piano"]')?.click();
      container.querySelector<HTMLButtonElement>('[aria-label="Loop from piano"]')?.click();
    });
    expect(onPlay).toHaveBeenCalledOnce();
    expect(onStop).toHaveBeenCalledOnce();
    expect(onReset).toHaveBeenCalledOnce();
    expect(onRunModeChange).toHaveBeenCalledWith("loop");
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Loop from piano"]')?.disabled).toBe(false);
    expect(onPlayModeChange).not.toHaveBeenCalled();
    expect(onClearPerformance).toHaveBeenCalledOnce();
    expect(Array.from(container.querySelectorAll<HTMLButtonElement>(".toolbar-centre button")).map((button) => button.getAttribute("aria-label"))).toEqual([
      "Resume score from piano",
      "Choose play mode from piano",
      "Stop score playback from piano",
      "Loop from piano",
      "Clear performance from piano",
      "Reset score progress from piano",
    ]);
    expect(container.querySelector(".toolbar-left")).not.toBeNull();
    expect(container.querySelector(".toolbar-right .audio-controls")).not.toBeNull();
  });

  it("keeps Stop available while a loop waits to restart", async () => {
    const onStop = vi.fn();
    await act(async () => root.render(<PianoPanel expectedNotes={[]} heldNotes={[]} ignoredCarriedNotes={[]} settings={DEFAULT_PIANO_SETTINGS} playbackPhase="waiting-restart" rollElapsedMs={500} playbackElapsedMs={500} displayedEventIndex={0} canPlay={true} runMode="loop" pauseOnNotes={false} canClearPerformance={true} onSettingsChange={vi.fn()} onTogglePlayback={vi.fn()} onStop={onStop} onReset={vi.fn()} onSeek={vi.fn()} onRunModeChange={vi.fn()} onClearPerformance={vi.fn()} />));
    const stop = container.querySelector<HTMLButtonElement>('[aria-label="Stop score playback from piano"]');
    expect(stop?.disabled).toBe(false);
    await act(async () => stop?.click());
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("allows active runs to change mode and exposes the live progress preference", async () => {
    const onPlayModeChange = vi.fn();
    const onShowProgressChange = vi.fn();
    await act(async () => root.render(<PianoPanel expectedNotes={[]} heldNotes={[]} ignoredCarriedNotes={[]} settings={DEFAULT_PIANO_SETTINGS} playbackPhase="playing" rollElapsedMs={0} playbackElapsedMs={0} displayedEventIndex={0} canPlay={true} runMode="once" pauseOnNotes={false} playMode="play" showProgressWhilePlaying={false} canClearPerformance={true} onSettingsChange={vi.fn()} onTogglePlayback={vi.fn()} onStop={vi.fn()} onReset={vi.fn()} onSeek={vi.fn()} onRunModeChange={vi.fn()} onPlayModeChange={onPlayModeChange} onShowProgressWhilePlayingChange={onShowProgressChange} onClearPerformance={vi.fn()} />));
    const modeButton = container.querySelector<HTMLButtonElement>('[aria-label="Choose play mode from piano"]');
    expect(modeButton?.querySelector("path")).not.toBeNull();
    expect(modeButton?.querySelector("circle")).toBeNull();
    await act(async () => modeButton?.click());
    const practice = document.querySelector<HTMLInputElement>('input[value="practice"]');
    expect(practice?.disabled).toBe(false);
    const progress = document.querySelector<HTMLInputElement>('.play-mode-toolbar input[type="checkbox"]');
    expect(progress?.checked).toBe(false);
    await act(async () => progress?.click());
    expect(onShowProgressChange).toHaveBeenCalledWith(true);
    expect(document.querySelector('.play-mode-dialog[role="dialog"]')).not.toBeNull();
    await act(async () => practice?.click());
    expect(onPlayModeChange).toHaveBeenCalledWith("practice");
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

  it("shows Synthesia from the selected event while idle", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 500, top: 500, right: 800, bottom: 600, left: 0, width: 800, height: 100, toJSON: () => undefined });
    const makeEvent = (id: string, startQuarter: number, midiNote: number): ScoreEvent => ({ id, partId: "P1", measureNumber: 1, startQuarter, durationQuarters: 1, midiNotes: [midiNote], staffNumbers: [1], voiceNumbers: ["1"], sourceNoteIds: [id], noteDetails: [{ midiNote, staffNumber: 1, voiceNumber: "1", sourceNoteId: id }] });
    const first = makeEvent("first", 0, 60);
    const selected = makeEvent("selected", 1, 62);
    const plan: PlaybackPlan = { startQuarter: 0, endQuarter: 2, durationMs: 1000, events: [{ eventIndex: 0, event: first, onsetMs: 0, endMs: 500 }, { eventIndex: 1, event: selected, onsetMs: 500, endMs: 1000 }] };
    await act(async () => root.render(<PianoPanel expectedNotes={[]} heldNotes={[]} ignoredCarriedNotes={[]} settings={{ ...DEFAULT_PIANO_SETTINGS, synthesiaEnabled: true }} playbackPlan={plan} playbackPhase="idle" rollElapsedMs={0} playbackElapsedMs={0} displayedEventIndex={1} canPlay={true} runMode="once" pauseOnNotes={false} canClearPerformance={false} onSettingsChange={vi.fn()} onTogglePlayback={vi.fn()} onReset={vi.fn()} onSeek={vi.fn()} onRunModeChange={vi.fn()} onClearPerformance={vi.fn()} />));

    const notes = Array.from(container.querySelectorAll<HTMLElement>(".synthesia-note"));
    expect(notes).toHaveLength(1);
    expect(notes[0].getAttribute("aria-label")).toContain("D4");
    expect(notes[0].style.bottom).toBe("0px");
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

function pointerEvent(type: string, pointerId: number, button = -1): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, button });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  return event;
}
