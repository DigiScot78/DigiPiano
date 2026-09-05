import { useEffect, useRef, useState, type ReactNode } from "react";
import type { CapturedMidiMessage } from "../hooks/useMidiInput";
import type { AudioSettings } from "../audio/settings";
import { PianoSynthEngine } from "../audio/pianoSynth";
import { WebAudioMetronomeEngine } from "../audio/metronome";
import { RHYTHM_BEAT_MS, RHYTHM_GRACE_MS, rhythmNotes, rhythmResult, type RhythmExercise, type RhythmStrike } from "../learning/foundationRhythm";

interface Props {
  events: CapturedMidiMessage[];
  connected: boolean;
  heldNotes: number[];
  audioSettings?: AudioSettings;
  keyboard: (notes: number[]) => ReactNode;
  onNext: () => void;
  onComplete?: () => void;
  onConnect?: () => void;
}
type Phase = "idle" | "preparing" | "armed" | "running" | "result";
interface Run { start: number; duration: number; demo: boolean; strikes: RhythmStrike[] }
const clockNow = () => performance.now();

export function FoundationRhythmLesson({ events, connected, heldNotes, audioSettings, keyboard, onNext, onComplete, onConnect }: Props) {
  const [exercise, setExercise] = useState<RhythmExercise>("quarters");
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [demonstrating, setDemonstrating] = useState(false);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<ReturnType<typeof rhythmResult>>();
  const [mastered, setMastered] = useState<RhythmExercise[]>([]);
  const [synth] = useState(() => new PianoSynthEngine());
  const [metronome] = useState(() => new WebAudioMetronomeEngine());
  const run = useRef<Run | undefined>(undefined);
  const lastMessage = useRef(events.at(-1)?.id ?? 0);
  const generation = useRef(0);
  const notes = rhythmNotes(exercise);
  const duration = exercise === "phrase" ? 8000 : 4000;
  const active = phase === "running" || phase === "armed" || phase === "preparing";

  function stop() {
    generation.current += 1;
    run.current = undefined;
    synth.stopAll(); metronome.stopAll();
    setPhase("idle"); setElapsed(0);
  }
  function schedule(start: number, demo: boolean) {
    const delay = start - clockNow();
    const countIn = demo || exercise !== "phrase" ? 0 : 4;
    for (let beat = -countIn; beat < duration / RHYTHM_BEAT_MS; beat += 1) {
      metronome.scheduleClick(`pulse:${beat}`, Math.max(0, delay + beat * RHYTHM_BEAT_MS), beat % 4 === 0);
    }
    if (demo) notes.forEach((note, i) => synth.scheduleNote(`demo:${i}`, 60, delay + note.onset, note.beats * RHYTHM_BEAT_MS - 80));
  }
  async function begin(demo: boolean) {
    stop(); setNotice(""); setResult(undefined);
    if (demo && (audioSettings?.muted || audioSettings?.volume === 0)) { setNotice("Sound is muted. Unmute piano audio to hear the example."); return; }
    if (!demo && heldNotes.length) { setNotice("Release the keys first, then start your practice."); return; }
    const token = generation.current;
    setPhase("preparing");
    try {
      await metronome.prepare();
      if (demo) await synth.prepare();
    } catch {
      if (token !== generation.current) return;
      if (demo) { setNotice("Audio could not start. Please try again."); setPhase("idle"); return; }
      setNotice("The click could not start. You can follow the visible beat count.");
    }
    if (token !== generation.current) return;
    metronome.setVolume(audioSettings?.metronomeVolume ?? 55);
    synth.setOutput(audioSettings?.volume ?? 65, audioSettings?.muted ?? false);
    setDemonstrating(demo);
    if (!demo && exercise !== "phrase") { setPhase("armed"); return; }
    const start = clockNow() + (demo ? 100 : 4000);
    run.current = { start, duration, demo, strikes: [] };
    schedule(start, demo); setElapsed(clockNow() - start); setPhase("running");
  }

  useEffect(() => {
    for (const event of events) {
      if (event.id <= lastMessage.current) continue;
      lastMessage.current = event.id;
      const message = event.message;
      if (phase === "armed" && !run.current && message.kind === "note-on") {
        if (message.noteNumber !== 60 || event.heldNotesBefore.length) { setNotice("Release the keys, then start with a fresh middle C."); continue; }
        const start = event.receivedAtMs;
        run.current = { start, duration, demo: false, strikes: [] };
        for (let beat = 0; beat < duration / RHYTHM_BEAT_MS; beat += 1) metronome.scheduleClick(`pulse:${beat}`, Math.max(0, start + beat * RHYTHM_BEAT_MS - clockNow()), beat % 4 === 0);
        setNotice(""); setPhase("running");
      }
      const current = run.current;
      if (!current || current.demo) continue;
      const at = event.receivedAtMs - current.start;
      if (at < -RHYTHM_GRACE_MS || at > current.duration + RHYTHM_GRACE_MS) continue;
      if (message.kind === "note-on" && message.noteNumber !== undefined) current.strikes.push({ note: message.noteNumber, at });
      if (message.kind === "note-off") {
        const strike = [...current.strikes].reverse().find((item) => item.note === message.noteNumber && item.releasedAt === undefined);
        if (strike) {
          strike.releasedAt = at;
          const expected = rhythmNotes(exercise).find((note) => Math.abs(strike.at - note.onset) <= RHYTHM_GRACE_MS);
          if (expected && at < expected.onset + expected.beats * RHYTHM_BEAT_MS - RHYTHM_GRACE_MS) setNotice("Released early — keep counting. We’ll review this bar at the end.");
        }
      }
    }
  }, [events, phase, duration, exercise, metronome]);

  useEffect(() => {
    if (phase !== "running") return;
    const timer = window.setInterval(() => {
      const current = run.current;
      if (!current) return;
      const time = performance.now() - current.start;
      setElapsed(time);
      if (time < current.duration + (current.demo ? 0 : RHYTHM_GRACE_MS + 50)) return;
      run.current = undefined; metronome.stopAll(); synth.stopAll();
      if (current.demo) { setPhase("idle"); setElapsed(0); setNotice("Your turn. Follow the pulse and give each note its full length."); }
      else {
        const outcome = rhythmResult(exercise, current.strikes);
        setResult(outcome); setPhase("result"); setNotice("");
        if (outcome.passed) setMastered((previous) => previous.includes(exercise) ? previous : [...previous, exercise]);
      }
    }, 25);
    return () => window.clearInterval(timer);
  }, [phase, exercise, metronome, synth]);
  useEffect(() => { synth.setOutput(audioSettings?.volume ?? 65, audioSettings?.muted ?? false); metronome.setVolume(audioSettings?.metronomeVolume ?? 55); }, [audioSettings, synth, metronome]);
  useEffect(() => { if (mastered.includes("quarters") && mastered.includes("halves")) onComplete?.(); }, [mastered, onComplete]);
  useEffect(() => () => { generation.current += 1; run.current = undefined; synth.close(); metronome.close(); }, [synth, metronome]);
  useEffect(() => {
    if (connected) return;
    if (run.current?.demo) return;
    generation.current += 1; run.current = undefined; metronome.stopAll(); setPhase("idle");
  }, [connected, metronome]);

  const playing = phase === "running" && elapsed >= 0;
  const beat = Math.min(duration / 1000 - 0.001, Math.max(0, elapsed / 1000));
  const currentNote = notes.find((note) => elapsed >= note.onset && elapsed < note.onset + note.beats * 1000);
  const demoPlaying = phase === "running" && demonstrating;
  const shownHeld = demoPlaying ? currentNote && elapsed < currentNote.onset + currentNote.beats * 1000 - 80 ? [60] : [] : heldNotes;
  const statusLabel = { correct: "✓ On time", early: "Early", late: "Late", missed: "Missed" } as const;
  return <div className="rhythm-teacher">
    <nav aria-label="Rhythm lesson stages" className="rhythm-stage-tabs">
      {(["quarters", "halves", "phrase"] as const).map((stage, i) => <button key={stage} aria-pressed={exercise === stage} disabled={active} onClick={() => { stop(); setExercise(stage); setResult(undefined); setNotice(""); }}>{mastered.includes(stage) ? "✓ " : `${i + 1}. `}{stage === "quarters" ? "One-beat notes" : stage === "halves" ? "Two-beat holds" : "Play it through"}</button>)}
    </nav>
    <h3>{exercise === "quarters" ? "Give each C one whole beat" : exercise === "halves" ? "Hold C through two counts" : "Put both note lengths together"}</h3>
    <p>{exercise === "phrase" ? "Optional: four quarter notes, then two half notes. You’ll hear four preparation beats before you begin." : "Hear the example, then try a four-beat bar. Your first middle C starts the pulse when you are ready."} Release each note as the next begins, and release the last note at the end. Keep the pedal up.</p>
    <div className="rhythm-teacher-actions">
      <button className="foundation-demo-button" disabled={active} onClick={() => void begin(true)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a7 7 0 0 0-7 7h2a5 5 0 0 1 10 0c0 2-1 3-2.5 4.3-1.3 1.1-2.5 2.2-2.5 3.7a2 2 0 0 1-4 0H6a4 4 0 0 0 8 0c0-.6.7-1.3 1.8-2.2C17.3 14.5 19 13 19 10a7 7 0 0 0-7-7Zm0 4a3 3 0 0 0-3 3v3h2v-3a1 1 0 0 1 2 0h2a3 3 0 0 0-3-3Z" /></svg> Hear and watch</button>
      <button disabled={active || !connected} onClick={() => void begin(false)}>{result ? "Try again" : exercise === "phrase" ? "Start play-through" : "Try with guidance"}</button>
      {active ? <button onClick={stop}>Stop</button> : null}
    </div>
    {!connected ? <div><p>Connect your MIDI piano to practise. The demonstration is available now.</p><button onClick={onConnect}>Connect MIDI</button></div> : null}
    <div className="rhythm-count" aria-live="off"><strong>{phase === "armed" ? "Ready" : phase === "preparing" ? "Preparing…" : phase === "running" && elapsed < 0 ? `Count in · ${Math.min(4, Math.floor((elapsed + 4000) / 1000) + 1)}` : playing ? elapsed >= duration ? "Release" : `Count ${Math.floor(beat) % 4 + 1}` : "60 BPM"}</strong><span>{phase === "armed" ? "Press middle C to begin" : playing && currentNote?.beats === 2 ? "Keep holding through both counts" : "A steady, gentle pulse"}</span></div>
    <figure className="rhythm-teacher-score" aria-label="Middle C rhythm notation">
      <svg viewBox={`0 0 ${exercise === "phrase" ? 760 : 440} 168`} aria-hidden="true">
        {[40, 52, 64, 76, 88].map((y) => <line key={y} x1="20" x2={exercise === "phrase" ? 735 : 415} y1={y} y2={y} />)}
        <text x="23" y="85" className="rhythm-clef">𝄞</text>
        {notes.map((note, i) => { const x = 95 + note.onset / 1000 * 80; const selected = playing && currentNote === note; const noteResult = result?.notes[i]; return <g key={i} className={selected ? "active" : ""}><line x1={x - 15} x2={x + 15} y1="100" y2="100" /><ellipse cx={x} cy="100" rx="9" ry="6" className={note.beats === 1 ? "filled" : ""} /><line x1={x + 8} x2={x + 8} y1="98" y2="61" /><text x={x} y="126">{note.beats === 2 ? `${note.onset / 1000 % 4 + 1}–${note.onset / 1000 % 4 + 2}` : note.onset / 1000 + 1}</text>{noteResult ? <g className={`rhythm-note-result ${noteResult.status}`}><rect x={x - 30} y="137" width="60" height="22" rx="11" /><text x={x} y="152">{statusLabel[noteResult.status]}</text></g> : null}</g>; })}
        <line x1="415" x2="415" y1="40" y2="88" />{exercise === "phrase" ? <line x1="735" x2="735" y1="40" y2="88" /> : null}
        {playing ? <line className="rhythm-moving-marker" x1={95 + Math.min(duration / 1000, elapsed / 1000) * 80} x2={95 + Math.min(duration / 1000, elapsed / 1000) * 80} y1="27" y2="112" /> : null}
      </svg>
    </figure>
    {keyboard(shownHeld)}
    <div className="rhythm-teacher-feedback" role="status">{result ? <><strong>{result.passed ? "That matched the rhythm" : "Let’s try that bar again"}</strong><p>{result.passed ? exercise === "quarters" ? "All four notes had a full beat and a clear release." : exercise === "halves" ? "Both notes lasted two beats and ended with the pulse." : "You kept the pulse through both note lengths and released the final note." : result.issue}</p></> : notice || "Watch the count and the moving line. Small timing differences are welcome; there are no percentages."}</div>
    {!active && exercise === "quarters" && mastered.includes("quarters") ? <div className="lesson-action-dock"><button className="primary" onClick={() => { setExercise("halves"); setResult(undefined); }}>Continue to two-beat holds</button></div> : null}
    {!active && mastered.includes("quarters") && mastered.includes("halves") ? <div className="rhythm-teacher-actions lesson-action-dock"><button className="primary" onClick={onNext}>Next lesson</button>{exercise !== "phrase" ? <button onClick={() => { setExercise("phrase"); setResult(undefined); }}>Optional play-through</button> : null}</div> : null}
  </div>;
}
