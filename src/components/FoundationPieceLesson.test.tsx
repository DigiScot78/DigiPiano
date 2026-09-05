import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CapturedMidiMessage } from "../hooks/useMidiInput";
import { FoundationPieceLesson } from "./FoundationPieceLesson";

vi.mock("../audio/pianoSynth",()=>({PianoSynthEngine:class{prepare=vi.fn().mockResolvedValue(undefined);setOutput=vi.fn();scheduleNote=vi.fn();stopAll=vi.fn();close=vi.fn();}}));
vi.mock("../audio/metronome",()=>({WebAudioMetronomeEngine:class{prepare=vi.fn().mockResolvedValue(undefined);setVolume=vi.fn();scheduleClick=vi.fn();stopAll=vi.fn();close=vi.fn();}}));
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
describe("Lesson 10 complete piece",()=>{let root:Root;let container:HTMLDivElement;let events:CapturedMidiMessage[]=[];let held:number[]=[];
  beforeEach(()=>{vi.useFakeTimers({toFake:["setInterval","clearInterval","performance"]});container=document.createElement("div");document.body.append(container);root=createRoot(container);events=[];held=[];});afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.useRealTimers();});
  const render=async()=>{await act(async()=>root.render(<FoundationPieceLesson events={events} connected heldNotes={held} keyboard={()=>null} onFinish={vi.fn()}/>));};const advance=async(ms:number)=>{await act(async()=>vi.advanceTimersByTime(ms));};
  const key=async(kind:"note-on"|"note-off",note:number)=>{const before=[...held];held=kind==="note-on"?[...held,note]:held.filter(item=>item!==note);events=[...events,{id:events.length+1,message:{kind,command:kind==="note-on"?144:128,raw:[],noteNumber:note,velocity:kind==="note-on"?90:0,channel:0},receivedAtMs:performance.now(),heldNotesBefore:before,heldNotesAfter:[...held]}];await render();};
  it("checks every event, the ending chord, and final silence",async()=>{await render();const start=[...container.querySelectorAll("button")].find(button=>button.textContent?.includes("Try with guidance"));await act(async()=>start!.click());
    for(const[note,beats]of[[60,1],[62,1],[64,2],[48,1],[50,1],[52,2],[61,1],[62,1],[64,2]]as const){await key("note-on",note);await advance(beats*1000);await key("note-off",note);}await key("note-on",48);await key("note-on",60);await advance(2000);await key("note-off",48);await key("note-off",60);await advance(2350);
    expect(container.textContent).toContain("You completed the whole piece");expect(container.querySelectorAll(".rhythm-note-result.correct")).toHaveLength(10);expect(container.querySelectorAll(".rhythm-note-result.quiet")).toHaveLength(1);expect(container.textContent).toContain("Try sight reading");
  });
});
