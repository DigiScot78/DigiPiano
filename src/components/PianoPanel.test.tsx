import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PIANO_SETTINGS, type PianoSettings } from "../piano/piano";
import { PianoPanel } from "./PianoPanel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("PianoPanel", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

  async function render(settings: PianoSettings = DEFAULT_PIANO_SETTINGS, expectedNotes = [60], heldNotes: number[] = [], carried: number[] = [], onChange = vi.fn()) {
    await act(async () => root.render(<PianoPanel expectedNotes={expectedNotes} heldNotes={heldNotes} ignoredCarriedNotes={carried} settings={settings} playbackPhase="idle" rollElapsedMs={0} canPlay={true} runMode="once" pauseOnNotes={false} canClearPerformance={false} onSettingsChange={onChange} onPlay={vi.fn()} onStop={vi.fn()} onRunModeChange={vi.fn()} onPauseOnNotesChange={vi.fn()} onClearPerformance={vi.fn()} />));
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

  it("keeps a restoration control when collapsed", async () => {
    const onChange = await render({ ...DEFAULT_PIANO_SETTINGS, expanded: false });
    expect(container.querySelectorAll(".piano-key")).toHaveLength(0);
    const button = container.querySelector<HTMLButtonElement>(".piano-toggle");
    expect(container.querySelector(".piano-panel")?.className).toContain("collapsed");
    expect(button?.getAttribute("aria-label")).toBe("Show piano");
    expect(button?.querySelector("svg")).not.toBeNull();
    await act(async () => button?.click());
    expect(onChange).toHaveBeenCalledWith({ expanded: true });
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

  it("keeps Synthesia and its controls hidden with a collapsed piano", async () => {
    await render({ ...DEFAULT_PIANO_SETTINGS, expanded: false, synthesiaEnabled: true });
    expect(container.querySelector(".synthesia-panel")).toBeNull();
    expect(container.querySelector('[aria-label="Toggle Synthesia"]')).toBeNull();
  });

  it("renders transparent lanes and toggles Synthesia from the piano toolbar", async () => {
    const onChange = await render({ ...DEFAULT_PIANO_SETTINGS, synthesiaEnabled: true });
    expect(container.querySelectorAll(".synthesia-lane")).toHaveLength(88);
    expect(container.querySelector(".synthesia-resize-handle")).not.toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Toggle Synthesia"]')?.click());
    expect(onChange).toHaveBeenCalledWith({ synthesiaEnabled: false });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Toggle opaque Synthesia"]')?.click();
      container.querySelector<HTMLButtonElement>('[aria-label="Show falling note labels"]')?.click();
    });
    expect(onChange).toHaveBeenCalledWith({ synthesiaOpaque: true });
    expect(onChange).toHaveBeenCalledWith({ synthesiaShowNoteLabels: true });
  });

  it("routes the duplicated transport controls to shared callbacks", async () => {
    const onPlay = vi.fn();
    const onRunModeChange = vi.fn();
    const onPauseOnNotesChange = vi.fn();
    const onClearPerformance = vi.fn();
    await act(async () => root.render(<PianoPanel expectedNotes={[]} heldNotes={[]} ignoredCarriedNotes={[]} settings={DEFAULT_PIANO_SETTINGS} playbackPhase="idle" rollElapsedMs={0} canPlay={true} runMode="once" pauseOnNotes={false} canClearPerformance={true} onSettingsChange={vi.fn()} onPlay={onPlay} onStop={vi.fn()} onRunModeChange={onRunModeChange} onPauseOnNotesChange={onPauseOnNotesChange} onClearPerformance={onClearPerformance} />));
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Play score from piano"]')?.click();
      container.querySelector<HTMLButtonElement>('[aria-label="Loop from piano"]')?.click();
      container.querySelector<HTMLButtonElement>('[aria-label="Pause at each note from piano"]')?.click();
      container.querySelector<HTMLButtonElement>('[aria-label="Clear performance from piano"]')?.click();
    });
    expect(onPlay).toHaveBeenCalledOnce();
    expect(onRunModeChange).toHaveBeenCalledWith("loop");
    expect(onPauseOnNotesChange).toHaveBeenCalledWith(true);
    expect(onClearPerformance).toHaveBeenCalledOnce();
  });
});
