import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { DigiPianoHome } from "./DigiPianoHome";

describe("DigiPianoHome", () => {
  it("offers one clear route into Learning with theme-ready artwork", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const onStartLearning = vi.fn();
    await act(async () => root.render(<DigiPianoHome onStartLearning={onStartLearning} />));
    expect(container.querySelectorAll(".site-home-splash")).toHaveLength(2);
    expect(container.querySelector<HTMLImageElement>(".site-home-splash.light")?.src).toContain("digipiano-splash-light.png");
    const button = [...container.querySelectorAll("button")].find((item) => item.textContent === "Start learning");
    await act(async () => button?.click());
    expect(onStartLearning).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
  });
});
