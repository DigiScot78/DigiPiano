import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LearningWorkspace } from "./LearningWorkspace";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("LearningWorkspace", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

  it("starts at Learning Home and offers score planning at whole-score and selected scope", async () => {
    const onCreatePlan = vi.fn();
    await act(async () => root.render(<LearningWorkspace bottomOffset={80} rightColor="#456" scoreTitle="Prelude" selectedRange={{ startIndex: 3, endIndex: 8 }} tab="chords" onTabChange={vi.fn()} onItemActivate={vi.fn()} onOpenScore={vi.fn()} onCreatePlan={onCreatePlan} onContinuePlan={vi.fn()} onStartSightReading={vi.fn()} onClose={vi.fn()} />));
    expect(container.textContent).toContain("What would you like to practise?");
    await act(async () => findButton(container, "Plan whole score").click());
    expect(onCreatePlan).toHaveBeenCalledWith();
    await act(async () => findButton(container, "Plan selected passage").click());
    expect(onCreatePlan).toHaveBeenLastCalledWith({ startIndex: 3, endIndex: 8 });
  });

  it("keeps the existing chord and scale catalog available as Reference", async () => {
    await act(async () => root.render(<LearningWorkspace bottomOffset={80} rightColor="#456" tab="chords" onTabChange={vi.fn()} onItemActivate={vi.fn()} onOpenScore={vi.fn()} onCreatePlan={vi.fn()} onContinuePlan={vi.fn()} onStartSightReading={vi.fn()} onClose={vi.fn()} />));
    await act(async () => findButton(container, "Reference").click());
    expect(container.querySelector(".learning-reference")).not.toBeNull();
    expect(container.querySelectorAll(".mini-piano-diagram")).toHaveLength(68);
  });

  it("opens sight-reading setup and starts the selected level", async () => {
    const onStartSightReading = vi.fn();
    await act(async () => root.render(<LearningWorkspace bottomOffset={80} rightColor="#456" tab="chords" onTabChange={vi.fn()} onItemActivate={vi.fn()} onOpenScore={vi.fn()} onCreatePlan={vi.fn()} onContinuePlan={vi.fn()} onStartSightReading={onStartSightReading} onClose={vi.fn()} />));
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Open sight reading"]')?.click());
    await act(async () => container.querySelectorAll<HTMLInputElement>('input[name="sight-reading-level"]')[1].click());
    await act(async () => { const selects = container.querySelectorAll("select"); selects[0].value = "both"; selects[0].dispatchEvent(new Event("change", { bubbles: true })); selects[1].value = "8"; selects[1].dispatchEvent(new Event("change", { bubbles: true })); selects[2].value = "100"; selects[2].dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => findButton(container, "Generate excerpt").click());
    expect(onStartSightReading).toHaveBeenCalledWith({ level: "developing", hand: "both", measures: 8, tempoBpm: 100, preparationSeconds: 0 });
  });

  it("offers a live keyboard readiness check from Learning Home", async () => {
    await act(async () => root.render(<LearningWorkspace bottomOffset={80} rightColor="#456" tab="chords" midiReadiness={{ supported: true, secureContext: true, accessStatus: "ready", deviceName: "Test Piano", lastNote: 60, messageId: 1, heldNotes: [60] }} onConnectMidi={vi.fn()} onTabChange={vi.fn()} onItemActivate={vi.fn()} onOpenScore={vi.fn()} onCreatePlan={vi.fn()} onContinuePlan={vi.fn()} onStartSightReading={vi.fn()} onClose={vi.fn()} />));
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Open keyboard check"]')?.click());
    expect(container.textContent).toContain("Test Piano");
    expect(container.textContent).toContain("Play your lowest comfortable key");
    expect(container.textContent).not.toContain("C4 held");
    await act(async () => root.render(<LearningWorkspace bottomOffset={80} rightColor="#456" tab="chords" midiReadiness={{ supported: true, secureContext: true, accessStatus: "ready", deviceName: "Test Piano", lastNote: 48, messageId: 2, heldNotes: [48] }} onConnectMidi={vi.fn()} onTabChange={vi.fn()} onItemActivate={vi.fn()} onOpenScore={vi.fn()} onCreatePlan={vi.fn()} onContinuePlan={vi.fn()} onStartSightReading={vi.fn()} onClose={vi.fn()} />));
    expect(container.textContent).toContain("C3 held");
    expect(container.textContent).toContain("Now play the physical middle C key");
    await act(async () => root.render(<LearningWorkspace bottomOffset={80} rightColor="#456" tab="chords" midiReadiness={{ supported: true, secureContext: true, accessStatus: "ready", deviceName: "Test Piano", messageId: 3, heldNotes: [], sustainOn: true, lastSustainMessageId: 3, lastSustainOn: true }} onConnectMidi={vi.fn()} onTabChange={vi.fn()} onItemActivate={vi.fn()} onOpenScore={vi.fn()} onCreatePlan={vi.fn()} onContinuePlan={vi.fn()} onStartSightReading={vi.fn()} onClose={vi.fn()} />));
    expect(container.textContent).toContain("Pedal down detected");
    await act(async () => root.render(<LearningWorkspace bottomOffset={80} rightColor="#456" tab="chords" midiReadiness={{ supported: true, secureContext: true, accessStatus: "ready", deviceName: "Test Piano", messageId: 4, heldNotes: [], sustainOn: false, lastSustainMessageId: 4, lastSustainOn: false }} onConnectMidi={vi.fn()} onTabChange={vi.fn()} onItemActivate={vi.fn()} onOpenScore={vi.fn()} onCreatePlan={vi.fn()} onContinuePlan={vi.fn()} onStartSightReading={vi.fn()} onClose={vi.fn()} />));
    expect(container.textContent).toContain("Press and release detected");
    expect(container.textContent).toContain("Current state: up");
  });

  it("guides a beginner through fresh C, D, and E notes without scoring", async () => {
    const props = { bottomOffset: 80, rightColor: "#456", tab: "chords" as const, onConnectMidi: vi.fn(), onTabChange: vi.fn(), onItemActivate: vi.fn(), onOpenScore: vi.fn(), onCreatePlan: vi.fn(), onContinuePlan: vi.fn(), onStartSightReading: vi.fn(), onClose: vi.fn() };
    await act(async () => root.render(<LearningWorkspace {...props} midiReadiness={{ supported: true, secureContext: true, accessStatus: "ready", deviceName: "Test Piano", lastNote: 64, messageId: 10, heldNotes: [] }} />));
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Open beginner foundations"]')?.click());
    expect(container.textContent).toContain("Play C4");
    expect(container.textContent).toContain("Take your time — there is no score and no countdown.");
    expect(container.querySelector(".foundation-course-strip")?.textContent).toContain("Unit 1 · Lesson 1 of 10");
    expect(container.querySelectorAll('[aria-label="Unit 1 lessons"] button')).toHaveLength(10);
    expect(container.querySelector(".learning-home-hero")).toBeNull();
    expect(findButton(container, "Hear this in action")).not.toBeNull();
    expect(container.textContent).not.toContain("You played E4");
    expect(container.querySelectorAll(".foundation-piano-key")).toHaveLength(25);
    expect(container.querySelector(".foundation-piano-key.target")?.textContent).toContain("C4");

    await act(async () => root.render(<LearningWorkspace {...props} midiReadiness={{ supported: true, secureContext: true, accessStatus: "ready", deviceName: "Test Piano", lastNote: 60, messageId: 11, heldNotes: [60] }} />));
    expect(container.textContent).toContain("Play D4");
    await act(async () => root.render(<LearningWorkspace {...props} midiReadiness={{ supported: true, secureContext: true, accessStatus: "ready", deviceName: "Test Piano", lastNote: 63, messageId: 12, heldNotes: [63] }} />));
    expect(container.textContent).toContain("You played D#4");
    expect(container.textContent).toContain("Play D4");
    expect(container.querySelector(".foundation-piano-key.pressed")?.textContent).toContain("D#4");
    expect(container.querySelector(".foundation-piano-key.target")?.textContent).toContain("D4");
    await act(async () => root.render(<LearningWorkspace {...props} midiReadiness={{ supported: true, secureContext: true, accessStatus: "ready", deviceName: "Test Piano", lastNote: 62, messageId: 13, heldNotes: [62] }} />));
    await act(async () => root.render(<LearningWorkspace {...props} midiReadiness={{ supported: true, secureContext: true, accessStatus: "ready", deviceName: "Test Piano", lastNote: 64, messageId: 14, heldNotes: [64] }} />));
    expect(container.textContent).toContain("Lesson complete");
    expect(container.textContent).toContain("You’ve mapped C, D, and E");
    expect(container.querySelector(".foundation-course-progress strong")?.textContent).toBe("1 of 10 complete");
    expect(findButtonByLabel(container, "Lesson 1: Find C, D, E, complete").classList.contains("complete")).toBe(true);

    await act(async () => findButton(container, "Next lesson").click());
    expect(container.querySelector(".foundation-course-strip")?.textContent).toContain("Five-note position");
    expect(container.querySelector(".foundation-course-progress strong")?.textContent).toBe("1 of 10 complete");
    expect(container.textContent).toContain("Play C4 · finger 1");
    expect(container.querySelector(".foundation-piano-key.target b")?.textContent).toBe("1");
    const pattern = [60, 62, 64, 65, 67, 67, 65, 64, 62, 60];
    for (const [index, note] of pattern.entries()) {
      await act(async () => root.render(<LearningWorkspace {...props} midiReadiness={{ supported: true, secureContext: true, accessStatus: "ready", deviceName: "Test Piano", lastNote: note, messageId: 15 + index, heldNotes: [note] }} />));
    }
    expect(container.textContent).toContain("You’ve played your first five-note pattern");
    await act(async () => findButton(container, "Next lesson").click());
    expect(container.querySelector(".foundation-course-strip")?.textContent).toContain("Notes on the staff");
    expect(container.getElementsByClassName("foundation-staff-note")).toHaveLength(1);
    expect(container.querySelector(".foundation-staff-note")?.getAttribute("aria-label")).toContain("C4 written on the treble staff");
    await act(async () => root.render(<LearningWorkspace {...props} midiReadiness={{ supported: true, secureContext: true, accessStatus: "ready", deviceName: "Test Piano", lastNote: 59, messageId: 25, heldNotes: [59] }} />));
    expect(container.querySelector(".foundation-staff-note")?.getAttribute("aria-label")).toContain("B3 currently pressed");
    expect(container.querySelector(".played-note-marker text")?.textContent).toBe("B3");
    for (const [index, note] of [60, 62, 64, 64, 62, 60].entries()) {
      await act(async () => root.render(<LearningWorkspace {...props} midiReadiness={{ supported: true, secureContext: true, accessStatus: "ready", deviceName: "Test Piano", lastNote: note, messageId: 26 + index, heldNotes: [note] }} />));
    }
    expect(container.textContent).toContain("You’ve read your first staff notes");
    await act(async () => findButton(container, "Next lesson").click());
    expect(container.querySelector(".foundation-course-strip")?.textContent).toContain("Pulse and rhythm");
    expect(container.querySelector('[aria-label="Rhythm lesson stages"]')).not.toBeNull();
    expect(container.textContent).toContain("Try with guidance");
    await act(async () => findButtonByLabel(container, "Lesson 5: First phrase").click());
    expect(container.querySelector(".foundation-course-strip")?.textContent).toContain("First phrase");
    expect(container.querySelector(".foundation-phrase-card")?.getAttribute("aria-label")).toContain("C, D, E, D, C, E");
    expect(container.textContent).toContain("Try with guidance");
    await act(async () => findButtonByLabel(container, "Lesson 6: Bass clef").click());
    expect(container.querySelector(".foundation-course-strip")?.textContent).toContain("Bass clef");
    expect(container.textContent).toContain("Play C3 · finger 5");
    expect(container.querySelector(".foundation-staff-note")?.getAttribute("aria-label")).toContain("C3 written on the bass staff");
    expect(container.querySelector(".foundation-piano-key.target b")?.textContent).toBe("5");
    for (const [index, note] of [48, 50, 52, 52, 50, 48].entries()) {
      await act(async () => root.render(<LearningWorkspace {...props} midiReadiness={{ supported: true, secureContext: true, accessStatus: "ready", deviceName: "Test Piano", lastNote: note, messageId: 44 + index, heldNotes: [note] }} />));
    }
    expect(container.textContent).toContain("You’ve found your first bass-clef notes");
    await act(async () => findButton(container, "Next lesson").click());
    expect(container.querySelector(".foundation-course-strip")?.textContent).toContain("Both hands");
    for (const [index, note] of [48, 60, 50, 62, 52, 64].entries()) {
      await act(async () => root.render(<LearningWorkspace {...props} midiReadiness={{ supported: true, secureContext: true, accessStatus: "ready", deviceName: "Test Piano", lastNote: note, messageId: 50 + index, heldNotes: [note] }} />));
    }
    expect(container.textContent).toContain("Play C3 + C4");
    expect(container.querySelectorAll(".foundation-piano-key.target")).toHaveLength(2);
    await act(async () => root.render(<LearningWorkspace {...props} midiReadiness={{ supported: true, secureContext: true, accessStatus: "ready", deviceName: "Test Piano", lastNote: 48, messageId: 56, heldNotes: [48] }} />));
    expect(container.textContent).toContain("keep holding that note and add C4");
    await act(async () => root.render(<LearningWorkspace {...props} midiReadiness={{ supported: true, secureContext: true, accessStatus: "ready", deviceName: "Test Piano", lastNote: 60, messageId: 57, heldNotes: [48, 60] }} />));
    expect(container.textContent).toContain("You’ve played your first notes with both hands");
    await act(async () => findButton(container, "Next lesson").click());
    expect(container.textContent).toContain("Bars and rests");
    expect(container.querySelector(".foundation-rest-card")?.getAttribute("aria-label")).toContain("quarter rest");
    expect(container.textContent).toContain("Try with guidance");
    await act(async () => findButtonByLabel(container, "Lesson 9: Sharps and flats").click());
    expect(container.textContent).toContain("Sharps and flats");
    expect(container.querySelector(".foundation-accidental-card")?.getAttribute("aria-label")).toContain("C♯4 written on the treble staff with a sharp sign");
    expect(container.querySelector(".foundation-piano-key.target")?.textContent).toContain("C♯4");
    for (const [index, note] of [61, 61, 66, 63].entries()) {
      await act(async () => root.render(<LearningWorkspace {...props} midiReadiness={{ supported: true, secureContext: true, accessStatus: "ready", deviceName: "Test Piano", lastNote: note, messageId: 61 + index, heldNotes: [note] }} />));
    }
    expect(container.textContent).toContain("You’ve found your first sharps and flats");
    await act(async () => findButton(container, "Next lesson").click());
    expect(container.querySelector(".foundation-course-strip")?.textContent).toContain("First complete piece");
    expect(container.querySelector(".foundation-piece-card")?.getAttribute("aria-label")).toContain("Four-bar beginner piece");
    expect(container.textContent).toContain("Try with guidance");
  });

  it("recommends and opens an existing activity from experience and goal", async () => {
    await act(async () => root.render(<LearningWorkspace bottomOffset={80} rightColor="#456" tab="chords" onTabChange={vi.fn()} onItemActivate={vi.fn()} onOpenScore={vi.fn()} onCreatePlan={vi.fn()} onContinuePlan={vi.fn()} onStartSightReading={vi.fn()} onClose={vi.fn()} />));
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Open route finder"]')?.click());
    await act(async () => container.querySelectorAll<HTMLInputElement>('input[name="route-experience"]')[1].click());
    await act(async () => container.querySelectorAll<HTMLInputElement>('input[name="route-goal"]')[2].click());
    expect(container.textContent).toContain("Explore chords and scales");
    await act(async () => findButton(container, "Start here").click());
    expect(container.querySelector(".learning-reference")).not.toBeNull();
  });
});

function findButton(container: HTMLElement, text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.trim() === text);
  if (!button) throw new Error(`Button not found: ${text}`);
  return button;
}

function findButtonByLabel(container: HTMLElement, label: string): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`Button not found: ${label}`);
  return button;
}
