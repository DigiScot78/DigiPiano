import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AudioSettings } from "../audio/settings";
import { WebAudioMetronomeEngine } from "../audio/metronome";
import { PianoSynthEngine } from "../audio/pianoSynth";
import type { CapturedMidiMessage } from "../hooks/useMidiInput";
import { foundationRestResult } from "../learning/foundationRests";
import { RHYTHM_GRACE_MS, type RhythmStrike, type TimedFoundationNote } from "../learning/foundationRhythm";

const NOTES: TimedFoundationNote[] = [{ midi: 60, beats: 1, onset: 0 }, { midi: 60, beats: 2, onset: 2000 }, { midi: 62, beats: 2, onset: 4000 }];
const RESTS = [{ onset: 1000, beats: 1 }, { onset: 6000, beats: 2 }];
const ITEMS = [
  { kind: "note" as const, index: 0, onset: 0, beats: 1, x: 90 },
  { kind: "rest" as const, index: 0, onset: 1000, beats: 1, x: 130 },
  { kind: "note" as const, index: 1, onset: 2000, beats: 2, x: 180 },
  { kind: "note" as const, index: 2, onset: 4000, beats: 2, x: 275 },
  { kind: "rest" as const, index: 1, onset: 6000, beats: 2, x: 353 },
];
const DURATION = 8000;
const clockNow = () => performance.now();
type Phase = "idle" | "preparing" | "armed" | "running" | "result";
interface Run { start: number; demo: boolean; strikes: RhythmStrike[] }
interface Props { events: CapturedMidiMessage[]; connected: boolean; heldNotes: number[]; audioSettings?: AudioSettings; keyboard: (target: number | undefined, held: number[]) => ReactNode; onNext: () => void; onComplete?: () => void; onConnect?: () => void }

export function FoundationRestLesson({ events, connected, heldNotes, audioSettings, keyboard, onNext, onComplete, onConnect }: Props) {
  const [phase, setPhase] = useState<Phase>("idle"); const [elapsed, setElapsed] = useState(0); const [notice, setNotice] = useState("");
  const [result, setResult] = useState<ReturnType<typeof foundationRestResult>>(); const [demonstrating, setDemonstrating] = useState(false);
  const [synth] = useState(() => new PianoSynthEngine()); const [metronome] = useState(() => new WebAudioMetronomeEngine());
  const run = useRef<Run | undefined>(undefined); const lastMessage = useRef(events.at(-1)?.id ?? 0); const generation = useRef(0);
  const active = phase === "preparing" || phase === "armed" || phase === "running";
  function stop() { generation.current += 1; run.current = undefined; synth.stopAll(); metronome.stopAll(); setPhase("idle"); setElapsed(0); }
  function schedule(start: number, demo: boolean) { const delay=start-clockNow(); for(let beat=0;beat<8;beat+=1) metronome.scheduleClick(`rests:${beat}`,Math.max(0,delay+beat*1000),beat%4===0); if(demo) NOTES.forEach((note,index)=>synth.scheduleNote(`rests:${index}`,note.midi,delay+note.onset,note.beats*1000-80)); }
  async function begin(demo: boolean) {
    stop(); setNotice(""); setResult(undefined);
    if(demo&&(audioSettings?.muted||audioSettings?.volume===0)){setNotice("Sound is muted. Unmute piano audio to hear the example.");return;}
    if(!demo&&heldNotes.length){setNotice("Release the keys first, then start your practice.");return;}
    const token=generation.current; setPhase("preparing");
    try{await metronome.prepare();if(demo)await synth.prepare();}catch{if(token!==generation.current)return;if(demo){setNotice("Audio could not start. Please try again.");setPhase("idle");return;}setNotice("The click could not start. Follow the visible count.");}
    if(token!==generation.current)return; metronome.setVolume(audioSettings?.metronomeVolume??55);synth.setOutput(audioSettings?.volume??65,audioSettings?.muted??false);setDemonstrating(demo);
    if(!demo){setPhase("armed");return;}const start=clockNow()+100;run.current={start,demo,strikes:[]};schedule(start,demo);setElapsed(clockNow()-start);setPhase("running");
  }
  useEffect(()=>{for(const event of events){if(event.id<=lastMessage.current)continue;lastMessage.current=event.id;const message=event.message;
    if(phase==="armed"&&!run.current&&message.kind==="note-on"){if(message.noteNumber!==60||event.heldNotesBefore.length){setNotice("Release the keys, then begin with the first written C.");continue;}const start=event.receivedAtMs;run.current={start,demo:false,strikes:[]};for(let beat=0;beat<8;beat+=1)metronome.scheduleClick(`rests:${beat}`,Math.max(0,start+beat*1000-clockNow()),beat%4===0);setNotice("");setPhase("running");}
    const current=run.current;if(!current||current.demo)continue;const at=event.receivedAtMs-current.start;if(at< -RHYTHM_GRACE_MS||at>DURATION+RHYTHM_GRACE_MS)continue;
    if(message.kind==="note-on"&&message.noteNumber!==undefined)current.strikes.push({note:message.noteNumber,at});
    if(message.kind==="note-off"){const strike=[...current.strikes].reverse().find(item=>item.note===message.noteNumber&&item.releasedAt===undefined);if(strike)strike.releasedAt=at;}
  }},[events,phase,metronome]);
  useEffect(()=>{if(phase!=="running")return;const timer=window.setInterval(()=>{const current=run.current;if(!current)return;const time=clockNow()-current.start;setElapsed(time);if(time<DURATION+(current.demo?0:RHYTHM_GRACE_MS+50))return;run.current=undefined;metronome.stopAll();synth.stopAll();if(current.demo){setPhase("idle");setElapsed(0);setNotice("Your turn. Keep the pulse moving while the rests stay completely silent.");}else{const outcome=foundationRestResult(NOTES,RESTS,current.strikes);setResult(outcome);if(outcome.passed)onComplete?.();setPhase("result");setNotice("");}},25);return()=>window.clearInterval(timer);},[phase,metronome,onComplete,synth]);
  useEffect(()=>{synth.setOutput(audioSettings?.volume??65,audioSettings?.muted??false);metronome.setVolume(audioSettings?.metronomeVolume??55);},[audioSettings,synth,metronome]);
  useEffect(()=>()=>{generation.current+=1;run.current=undefined;synth.close();metronome.close();},[synth,metronome]);
  useEffect(()=>{if(connected||run.current?.demo)return;generation.current+=1;run.current=undefined;metronome.stopAll();setPhase("idle");},[connected,metronome]);

  const playing=phase==="running"&&elapsed>=0;const itemIndex=playing?ITEMS.findIndex(item=>elapsed>=item.onset&&elapsed<item.onset+item.beats*1000):0;const currentIndex=itemIndex<0?ITEMS.length-1:itemIndex;const current=ITEMS[currentIndex];
  const currentNote=current.kind==="note"?NOTES[current.index]:undefined;const demoHeld=phase==="running"&&demonstrating&&currentNote&&elapsed<currentNote.onset+currentNote.beats*1000-80?[currentNote.midi]:[];const shownHeld=phase==="running"&&demonstrating?demoHeld:heldNotes;const itemProgress=Math.min(1,Math.max(0,(elapsed-current.onset)/(current.beats*1000)));const markerX=playing?current.x+itemProgress*((ITEMS[currentIndex+1]?.x??400)-current.x):undefined;
  const noteLabels={correct:"✓ On time",early:"Early",late:"Late",missed:"Missed"} as const;
  return <div className="rhythm-teacher foundation-rest-teacher"><h3>Keep counting when the music is silent</h3><p>Play C, leave count 2 silent, hold C through counts 3–4, then hold D for two beats and leave the final two beats silent. Your first C starts the pulse.</p>
    <div className="rhythm-teacher-actions"><button className="foundation-demo-button" disabled={active} onClick={()=>void begin(true)}>♫ Hear and watch</button><button disabled={active||!connected} onClick={()=>void begin(false)}>{result?"Try again":"Try with guidance"}</button>{active?<button onClick={stop}>Stop</button>:null}</div>
    {!connected?<div><p>Connect your MIDI piano to practise. The demonstration is available now.</p><button onClick={onConnect}>Connect MIDI</button></div>:null}
    <div className="rhythm-count"><strong>{phase==="armed"?"Ready":phase==="preparing"?"Preparing…":playing?elapsed>=DURATION?"Stay silent":`Bar ${Math.floor(elapsed/4000)+1} · Count ${Math.floor(elapsed/1000)%4+1}`:"60 BPM"}</strong><span>{phase==="armed"?"Press the first middle C to begin":playing&&current.kind==="rest"?"Keep counting — do not play":"Give the note its complete written length"}</span></div>
    <figure className="foundation-rest-card timed-feedback" role="img" aria-label="Two bars with a quarter rest, a half rest, and note-by-note timing and silence feedback"><svg viewBox="0 0 420 165" aria-hidden="true">{[35,47,59,71,83].map(y=><line key={y} x1="20" x2="400" y1={y} y2={y}/>)}<line className="barline" x1="20" x2="20" y1="35" y2="83"/><line className="barline" x1="230" x2="230" y1="35" y2="83"/><line className="barline" x1="400" x2="400" y1="35" y2="83"/><text className="time-signature" x="31" y="56">4</text><text className="time-signature" x="31" y="80">4</text>
      <line className="ledger" x1="74" x2="106" y1="101" y2="101"/><ellipse className="rhythm-notehead filled" cx="90" cy="101" rx="9" ry="6" transform="rotate(-18 90 101)"/><line className="rhythm-stem" x1="98" x2="98" y1="99" y2="63"/><g className="rest-symbol"><text x="127" y="79">𝄽</text></g><line className="ledger" x1="164" x2="196" y1="101" y2="101"/><ellipse className="rhythm-notehead" cx="180" cy="101" rx="9" ry="6" transform="rotate(-18 180 101)"/><line className="rhythm-stem" x1="188" x2="188" y1="99" y2="63"/><ellipse className="rhythm-notehead" cx="275" cy="95" rx="9" ry="6" transform="rotate(-18 275 95)"/><line className="rhythm-stem" x1="283" x2="283" y1="93" y2="57"/><g className="rest-symbol"><rect x="342" y="59" width="22" height="6"/></g>
      {ITEMS.map((item)=>{const feedback=item.kind==="note"?result?.notes[item.index]:result?.rests[item.index];const label=!feedback?undefined:item.kind==="note"?noteLabels[feedback.status as keyof typeof noteLabels]:feedback.status==="quiet"?"✓ Quiet":"Sound";return feedback?<g key={`${item.kind}-${item.index}`} className={`rhythm-note-result ${feedback.status}`}><rect x={item.x-20} y="125" width="40" height="18" rx="9"/><text x={item.x} y="137">{label}</text></g>:null;})}{markerX!==undefined?<line className="demo-marker" x1={markerX} x2={markerX} y1="20" y2="108"/>:null}</svg><figcaption>Play · rest · play | play · rest — all eight beats continue.</figcaption></figure>
    {keyboard(currentNote?.midi,shownHeld)}
    <div className="rhythm-teacher-feedback" role="status">{result?<><strong>{result.passed?"That filled both bars":"Let’s try those bars again"}</strong><p>{result.passed?"Every note had its full value, and both rests stayed silent.":result.issue}</p></>:notice||"Follow the pulse through notes and rests. Each note and each silent space is reviewed separately, without a percentage score."}</div>
    {result?.passed?<div className="foundation-complete-actions lesson-action-dock"><button onClick={()=>void begin(false)}>Practise again</button><button className="primary" onClick={onNext}>Next lesson</button></div>:null}
  </div>;
}
