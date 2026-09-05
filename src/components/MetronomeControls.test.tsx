import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_AUDIO_SETTINGS } from "../audio/settings";
import { MetronomeControls } from "./MetronomeControls";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("MetronomeControls", () => {
  it("toggles clicks and exposes idle-only tempo and count-in options", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onAudio = vi.fn();
    const onTempo = vi.fn();
    const onCountIn = vi.fn();
    await act(async () => root.render(<MetronomeControls settings={DEFAULT_AUDIO_SETTINGS} tempoPercent={75} tempoDisabled={false} writtenTempoBpm={120} tempoVaries={true} countInBars={1} onAudioSettingsChange={onAudio} onTempoPercentChange={onTempo} onCountInBarsChange={onCountIn} />));
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Toggle metronome"]')?.click());
    expect(onAudio).toHaveBeenCalledWith({ metronomeEnabled: true });
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Metronome and tempo options"]')?.click());
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("Effective start: 90 BPM");
    await act(async () => container.querySelector<HTMLButtonElement>('.count-in-options button:last-child')?.click());
    expect(onCountIn).toHaveBeenCalledWith(2);
    await act(async () => container.querySelector<HTMLButtonElement>('.tempo-reset-button')?.click());
    expect(onTempo).toHaveBeenCalledWith(100);
    await act(async () => root.unmount());
    container.remove();
  });
});
