import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LearningPanel } from "./LearningPanel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("LearningPanel", () => {
  let container: HTMLDivElement;
  let root: Root;
  const onClose = vi.fn();
  const onItemActivate = vi.fn();

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    function Harness() {
      const [tab, setTab] = useState<"chords" | "scales">("chords");
      return <LearningPanel tab={tab} bottomOffset={120} rightColor="#445566" onTabChange={setTab} onItemActivate={onItemActivate} onClose={onClose} />;
    }
    await act(async () => root.render(<Harness />));
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.clearAllMocks(); });

  it("renders a complete chord chart with consistent miniature keyboards", () => {
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Chords");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(17);
    expect(container.querySelectorAll("thead th")).toHaveLength(5);
    expect(container.querySelectorAll(".mini-piano-diagram")).toHaveLength(68);
    expect(container.querySelectorAll(".mini-piano-diagram")[0]?.querySelectorAll(".mini-piano-key")).toHaveLength(25);
    expect(container.querySelectorAll(".mini-piano-diagram")[0]?.querySelectorAll(".mini-piano-key.highlighted")).toHaveLength(3);
    expect((container.querySelector(".learning-panel") as HTMLElement).style.bottom).toBe("120px");
  });

  it("switches tabs by keyboard and always shows both hand fingerings on the keys", async () => {
    const chords = container.querySelector<HTMLButtonElement>("#learning-tab-chords");
    await act(async () => chords?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Scales");
    expect(container.querySelectorAll(".mini-piano-diagram.scale")).toHaveLength(68);
    expect(container.querySelector(".learning-hand-toolbar")).toBeNull();
    expect(container.querySelectorAll(".mini-piano-finger-number.hand-left")).toHaveLength(68 * 8);
    expect(container.querySelectorAll(".mini-piano-finger-number.hand-right")).toHaveLength(68 * 8);
    expect(container.querySelectorAll(".mini-piano-finger-number")).toHaveLength(68 * 16);
    expect(container.querySelector('[role="img"]')?.getAttribute("aria-label")).toContain("Left hand");
    expect(container.querySelector('[role="img"]')?.getAttribute("aria-label")).toContain("Right hand");
  });

  it("closes from Escape while focus is in the panel", async () => {
    await act(async () => container.querySelector(".learning-panel")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("activates every chord and scale catalog practice score", async () => {
    const chordButton = container.querySelector<HTMLButtonElement>('[aria-label="Open C major practice score"]');
    expect(chordButton).not.toBeNull();
    expect(container.querySelectorAll(".learning-score-button")).toHaveLength(68);
    await act(async () => chordButton?.click());
    expect(onItemActivate).toHaveBeenCalledWith(expect.objectContaining({ id: "chord:c:major" }));

    await act(async () => container.querySelector<HTMLButtonElement>("#learning-tab-scales")?.click());
    expect(container.querySelectorAll(".learning-score-button")).toHaveLength(68);
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Open B melodic minor ascending practice score"]')?.click());
    expect(onItemActivate).toHaveBeenLastCalledWith(expect.objectContaining({ id: "scale:b:melodic-minor" }));
    expect(container.querySelector('[aria-label="Open D♯ harmonic minor practice score"]')).not.toBeNull();
  });
});
