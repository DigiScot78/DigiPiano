import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AudioSettings } from "../audio/settings";
import { WebAudioMetronomeEngine } from "../audio/metronome";
import { PianoSynthEngine } from "../audio/pianoSynth";
import type { CapturedMidiMessage } from "../hooks/useMidiInput";
import { RHYTHM_BEAT_MS, RHYTHM_GRACE_MS, timedFoundationResult, type RhythmStrike, type TimedFoundationNote } from "../learning/foundationRhythm";
import { midiNoteToName } from "../music/note";

const PHRASE: TimedFoundationNote[] = [
  { midi: 60, beats: 1, onset: 0 }, { midi: 62, beats: 1, onset: 1000 },
  { midi: 64, beats: 2, onset: 2000 }, { midi: 62, beats: 1, onset: 4000 },
  { midi: 60, beats: 1, onset: 5000 }, { midi: 64, beats: 2, onset: 6000 },
];
const DURATION = 8000;
const NOTE_XS = [92, 137, 182, 252, 297, 342];
const clockNow = () => performance.now();
type Phase = "idle" | "preparing" | "armed" | "running" | "result";
interface Run { start: number; demo: boolean; strikes: RhythmStrike[] }

interface Props {
  events: CapturedMidiMessage[]; connected: boolean; heldNotes: number[]; audioSettings?: AudioSettings;
  keyboard: (target: number, held: number[]) => ReactNode; onNext: () => void; onComplete?: () => void; onConnect?: () => void;
}

function staffY(midi: number) {
  const steps = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
  const octave = Math.floor(midi / 12) - 1;
  return Math.max(17, Math.min(118, 101 - (octave * 7 + steps[((midi % 12) + 12) % 12] - 28) * 6));
}

export function FoundationPhraseLesson({ events, connected, heldNotes, audioSettings, keyboard, onNext, onComplete, onConnect }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<ReturnType<typeof timedFoundationResult>>();
  const [demonstrating, setDemonstrating] = useState(false);
  const [synth] = useState(() => new PianoSynthEngine());
  const [metronome] = useState(() => new WebAudioMetronomeEngine());
  const run = useRef<Run | undefined>(undefined);
  const lastMessage = useRef(events.at(-1)?.id ?? 0);
  const generation = useRef(0);
  const active = phase === "preparing" || phase === "armed" || phase === "running";

  function stop() { generation.current += 1; run.current = undefined; synth.stopAll(); metronome.stopAll(); setPhase("idle"); setElapsed(0); }
  function schedule(start: number, demo: boolean) {
    const delay = start - clockNow();
    for (let beat = 0; beat < 8; beat += 1) metronome.scheduleClick(`phrase:${beat}`, Math.max(0, delay + beat * RHYTHM_BEAT_MS), beat % 4 === 0);
    if (demo) PHRASE.forEach((note, index) => synth.scheduleNote(`phrase:${index}`, note.midi, delay + note.onset, note.beats * RHYTHM_BEAT_MS - 80));
  }
  async function begin(demo: boolean) {
    stop(); setNotice(""); setResult(undefined);
    if (demo && (audioSettings?.muted || audioSettings?.volume === 0)) { setNotice("Sound is muted. Unmute piano audio to hear the example."); return; }
    if (!demo && heldNotes.length) { setNotice("Release the keys first, then start your practice."); return; }
    const token = generation.current; setPhase("preparing");
    try { await metronome.prepare(); if (demo) await synth.prepare(); }
    catch { if (token !== generation.current) return; if (demo) { setNotice("Audio could not start. Please try again."); setPhase("idle"); return; } setNotice("The click could not start. Follow the visible count."); }
    if (token !== generation.current) return;
    metronome.setVolume(audioSettings?.metronomeVolume ?? 55); synth.setOutput(audioSettings?.volume ?? 65, audioSettings?.muted ?? false); setDemonstrating(demo);
    if (!demo) { setPhase("armed"); return; }
    const start = clockNow() + 100; run.current = { start, demo, strikes: [] }; schedule(start, demo); setElapsed(clockNow() - start); setPhase("running");
  }

  useEffect(() => {
    for (const event of events) {
      if (event.id <= lastMessage.current) continue;
      lastMessage.current = event.id;
      const message = event.message;
      if (phase === "armed" && !run.current && message.kind === "note-on") {
        if (message.noteNumber !== PHRASE[0].midi || event.heldNotesBefore.length) { setNotice("Release the keys, then begin with the first written C."); continue; }
        const start = event.receivedAtMs; run.current = { start, demo: false, strikes: [] };
        for (let beat = 0; beat < 8; beat += 1) metronome.scheduleClick(`phrase:${beat}`, Math.max(0, start + beat * RHYTHM_BEAT_MS - clockNow()), beat % 4 === 0);
        setNotice(""); setPhase("running");
      }
      const current = run.current;
      if (!current || current.demo) continue;
      const at = event.receivedAtMs - current.start;
      if (at < -RHYTHM_GRACE_MS || at > DURATION + RHYTHM_GRACE_MS) continue;
      if (message.kind === "note-on" && message.noteNumber !== undefined) current.strikes.push({ note: message.noteNumber, at });
      if (message.kind === "note-off") {
        const strike = [...current.strikes].reverse().find((item) => item.note === message.noteNumber && item.releasedAt === undefined);
        if (strike) { strike.releasedAt = at; const expected = PHRASE.find((note) => note.midi === strike.note && Math.abs(strike.at - note.onset) <= RHYTHM_GRACE_MS); if (expected && at < expected.onset + expected.beats * RHYTHM_BEAT_MS - RHYTHM_GRACE_MS) setNotice(`Released ${midiNoteToName(expected.midi)} early — keep going and we’ll review the phrase at the end.`); }
      }
    }
  }, [events, phase, metronome]);

  useEffect(() => {
    if (phase !== "running") return;
    const timer = window.setInterval(() => {
      const current = run.current; if (!current) return;
      const time = clockNow() - current.start; setElapsed(time);
      if (time < DURATION + (current.demo ? 0 : RHYTHM_GRACE_MS + 50)) return;
      run.current = undefined; metronome.stopAll(); synth.stopAll();
      if (current.demo) { setPhase("idle"); setElapsed(0); setNotice("Your turn. Read from left to right and keep the pulse through the two-beat notes."); }
      else { const outcome=timedFoundationResult(PHRASE, current.strikes); setResult(outcome); if(outcome.passed)onComplete?.(); setPhase("result"); setNotice(""); }
    }, 25);
    return () => window.clearInterval(timer);
  }, [phase, metronome, onComplete, synth]);
  useEffect(() => { synth.setOutput(audioSettings?.volume ?? 65, audioSettings?.muted ?? false); metronome.setVolume(audioSettings?.metronomeVolume ?? 55); }, [audioSettings, synth, metronome]);
  useEffect(() => () => { generation.current += 1; run.current = undefined; synth.close(); metronome.close(); }, [synth, metronome]);
  useEffect(() => { if (connected || run.current?.demo) return; generation.current += 1; run.current = undefined; metronome.stopAll(); setPhase("idle"); }, [connected, metronome]);

  const playing = phase === "running" && elapsed >= 0;
  const currentIndex = playing ? PHRASE.findIndex((note) => elapsed >= note.onset && elapsed < note.onset + note.beats * RHYTHM_BEAT_MS) : 0;
  const targetIndex = currentIndex < 0 ? PHRASE.length - 1 : currentIndex;
  const current = PHRASE[targetIndex];
  const demoHeld = phase === "running" && demonstrating && elapsed < current.onset + current.beats * RHYTHM_BEAT_MS - 80 ? [current.midi] : [];
  const shownHeld = phase === "running" && demonstrating ? demoHeld : heldNotes;
  const markerX = playing ? NOTE_XS[targetIndex] + Math.min(1, Math.max(0, (elapsed - current.onset) / (current.beats * RHYTHM_BEAT_MS))) * ((NOTE_XS[targetIndex + 1] ?? 390) - NOTE_XS[targetIndex]) : undefined;
  const labels = { correct: "✓ On time", early: "Early", late: "Late", missed: "Missed" } as const;
  return <div className="rhythm-teacher foundation-phrase-teacher">
    <h3>Read the whole phrase in a steady pulse</h3>
    <p>Play C–D–E, then D–C–E. The E notes last two beats; release the final E at the end of count 4. Your first C starts the pulse whenever you are ready.</p>
    <div className="rhythm-teacher-actions"><button className="foundation-demo-button" disabled={active} onClick={() => void begin(true)}>♫ Hear and watch</button><button disabled={active || !connected} onClick={() => void begin(false)}>{result ? "Try again" : "Try with guidance"}</button>{active ? <button onClick={stop}>Stop</button> : null}</div>
    {!connected ? <div><p>Connect your MIDI piano to practise. The demonstration is available now.</p><button onClick={onConnect}>Connect MIDI</button></div> : null}
    <div className="rhythm-count"><strong>{phase === "armed" ? "Ready" : phase === "preparing" ? "Preparing…" : playing ? elapsed >= DURATION ? "Release" : `Bar ${Math.floor(elapsed / 4000) + 1} · Count ${Math.floor(elapsed / 1000) % 4 + 1}` : "60 BPM"}</strong><span>{phase === "armed" ? "Press the first middle C to begin" : playing && current.beats === 2 ? `Keep holding ${midiNoteToName(current.midi)} through both counts` : "Read one note ahead as you play"}</span></div>
    <figure className="foundation-phrase-card timed-feedback" role="img" aria-label="Two-measure phrase C, D, E, D, C, E with note-by-note timing feedback">
      <svg viewBox="0 0 420 165" aria-hidden="true">{[35,47,59,71,83].map((y) => <line key={y} x1="20" x2="400" y1={y} y2={y} />)}<line className="barline" x1="20" x2="20" y1="35" y2="83"/><line className="barline" x1="217" x2="217" y1="35" y2="83"/><line className="barline" x1="400" x2="400" y1="35" y2="83"/><text className="time-signature" x="32" y="56">4</text><text className="time-signature" x="32" y="80">4</text>
      {PHRASE.map((note, index) => { const x=NOTE_XS[index], y=staffY(note.midi), item=result?.notes[index]; return <g key={index} className={playing && index===targetIndex ? "active" : ""}>{note.midi===60?<line className="ledger" x1={x-16} x2={x+16} y1={y} y2={y}/>:null}<ellipse className={`phrase-notehead${note.beats===1?" filled":""}`} cx={x} cy={y} rx="9" ry="6" transform={`rotate(-18 ${x} ${y})`}/><line className="phrase-stem" x1={x+8} x2={x+8} y1={y-1} y2={y-36}/><text className="beat-label" x={x} y="112">{note.beats}</text>{item?<g className={`rhythm-note-result ${item.status}`}><rect x={x-20} y="127" width="40" height="18" rx="9"/><text x={x} y="139">{labels[item.status]}</text></g>:null}</g>; })}
      {shownHeld.filter((note) => note>=48&&note<=72).slice(0,2).map((note,index)=><g className="played-note-marker" key={`${note}-${index}`}><ellipse cx={(markerX??NOTE_XS[targetIndex])+18+index*13} cy={staffY(note)} rx="9" ry="6"/><text x={(markerX??NOTE_XS[targetIndex])+18+index*13} y={Math.max(12,staffY(note)-10)}>{midiNoteToName(note)}</text></g>)}{markerX!==undefined?<line className="demo-marker" x1={markerX} x2={markerX} y1="20" y2="108"/>:null}</svg><figcaption>Counts: 1 · 1 · 2 | 1 · 1 · 2</figcaption>
    </figure>
    {keyboard(current.midi, shownHeld)}
    <div className="rhythm-teacher-feedback" role="status">{result ? <><strong>{result.passed ? "That matched the phrase" : "Let’s try that phrase again"}</strong><p>{result.passed ? "Every pitch arrived with the pulse and lasted for its written value." : result.issue}</p></> : notice || "Follow the marker and count through every full note length. The phrase is reviewed note by note, with no percentage score."}</div>
    {result?.passed ? <div className="foundation-complete-actions lesson-action-dock"><button onClick={() => void begin(false)}>Practise again</button><button className="primary" onClick={onNext}>Next lesson</button></div> : null}
  </div>;
}
