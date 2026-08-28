import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { AudioControls } from "./AudioControls";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("AudioControls", () => {
  it("opens an accessible shared volume and mute surface", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onChange = vi.fn();
    await act(async () => root.render(<AudioControls settings={{ muted: false, volume: 65 }} onSettingsChange={onChange} />));
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Score audio controls"]')?.click());
    const slider = container.querySelector<HTMLInputElement>('[aria-label="Score audio volume"]');
    expect(slider?.value).toBe("65");
    await act(async () => { if (slider) { slider.value = "40"; slider.dispatchEvent(new Event("input", { bubbles: true })); } });
    await act(async () => container.querySelector<HTMLButtonElement>(".audio-mute-button")?.click());
    expect(onChange).toHaveBeenCalledWith({ volume: 40, muted: false });
    expect(onChange).toHaveBeenCalledWith({ muted: true });
    await act(async () => root.unmount());
    container.remove();
  });
});
