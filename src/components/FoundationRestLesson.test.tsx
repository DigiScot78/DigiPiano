import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CapturedMidiMessage } from "../hooks/useMidiInput";
import { FoundationRestLesson } from "./FoundationRestLesson";

vi.mock("../audio/pianoSynth", () => ({ PianoSynthEngine: class { prepare = vi.fn().mockResolvedValue(undefined); setOutput = vi.fn(); scheduleNote = vi.fn(); stopAll = vi.fn(); close = vi.fn(); } }));
vi.mock("../audio/metronome", () => ({ WebAudioMetronomeEngine: class { prepare = vi.fn().mockResolvedValue(undefined); setVolume = vi.fn(); scheduleClick = vi.fn(); stopAll = vi.fn(); close = vi.fn(); } }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Lesson 8 guided rests", () => {
  let root: Root; let container: HTMLDivElement; let events: CapturedMidiMessage[] = []; let held: number[] = [];
  beforeEach(() => { vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] }); container=document.createElement("div");document.body.append(container);root=createRoot(container);events=[];held=[]; });
  afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.useRealTimers();});
  const render=async()=>{await act(async()=>root.render(<FoundationRestLesson events={events} connected heldNotes={held} keyboard={()=>null} onNext={vi.fn()}/>));};
  const advance=async(ms:number)=>{await act(async()=>vi.advanceTimersByTime(ms));};
  const key=async(kind:"note-on"|"note-off",note:number)=>{const before=held;held=kind==="note-on"?[note]:[];events=[...events,{id:events.length+1,message:{kind,command:kind==="note-on"?144:128,raw:[],noteNumber:note,velocity:kind==="note-on"?90:0,channel:0},receivedAtMs:performance.now(),heldNotesBefore:before,heldNotesAfter:held}];await render();};
  it("shows separate successful feedback for notes and silent rests",async()=>{await render();const start=[...container.querySelectorAll("button")].find(button=>button.textContent?.includes("Try with guidance"));await act(async()=>start!.click());
    expect(container.querySelector(".rhythm-notehead.filled")?.getAttribute("cy")).toBe("101");
    await key("note-on",60);await advance(1000);await key("note-off",60);await advance(1000);
    await key("note-on",60);await advance(2000);await key("note-off",60);await key("note-on",62);expect(container.querySelector(".demo-marker")?.getAttribute("x1")).toBe("275");await advance(2000);await key("note-off",62);await advance(2350);
    expect(container.textContent).toContain("That filled both bars");expect(container.querySelectorAll(".rhythm-note-result.correct")).toHaveLength(3);expect(container.querySelectorAll(".rhythm-note-result.quiet")).toHaveLength(2);expect(container.textContent).toContain("Next lesson");
  });
});
