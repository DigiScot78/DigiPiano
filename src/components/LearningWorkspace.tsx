import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { ScoreSelectionRange } from "../learning/matcher";
import type { GuidedPiecePlan } from "../learning/guidedPractice";
import type { LearningItem } from "../learning/catalog";
import { LearningPanel, type LearningTab } from "./LearningPanel";
import type { SightReadingHand, SightReadingLength, SightReadingLevel, SightReadingOptions, SightReadingPreparation, SightReadingTempo } from "../learning/sightReading";
import { midiNoteToName } from "../music/note";
import { generatePianoLayout } from "../piano/piano";
import { recommendLearningRoute, type LearningExperience, type LearningGoal } from "../learning/routeRecommendation";
import { PianoSynthEngine } from "../audio/pianoSynth";
import { WebAudioMetronomeEngine } from "../audio/metronome";
import type { AudioSettings } from "../audio/settings";
import type { CapturedMidiMessage } from "../hooks/useMidiInput";
import { FoundationRhythmLesson } from "./FoundationRhythmLesson";
import { FoundationPhraseLesson } from "./FoundationPhraseLesson";
import { FoundationRestLesson } from "./FoundationRestLesson";
import { FoundationPieceLesson } from "./FoundationPieceLesson";

type LearningView = "home" | "reference" | "sight-reading" | "readiness" | "route" | "foundations";
const learningClockNow = () => performance.now();

export interface MidiReadinessState { supported: boolean; secureContext: boolean; accessStatus: "idle" | "requesting" | "ready" | "error"; deviceName?: string; lastNote?: number; messageId: number; heldNotes: number[]; sustainOn?: boolean; lastSustainMessageId?: number; lastSustainOn?: boolean }

interface LearningWorkspaceProps {
  bottomOffset: number;
  rightColor: string;
  scoreTitle?: string;
  selectedRange?: ScoreSelectionRange;
  plan?: GuidedPiecePlan;
  tab: LearningTab;
  onTabChange: (tab: LearningTab) => void;
  onItemActivate: (item: LearningItem) => void;
  onOpenScore: () => void;
  onCreatePlan: (scope?: ScoreSelectionRange) => void;
  onContinuePlan: () => void;
  onStartSightReading: (options: SightReadingOptions) => void;
  midiReadiness?: MidiReadinessState;
  audioSettings?: AudioSettings;
  midiEvents?: CapturedMidiMessage[];
  onConnectMidi?: () => void;
  onClose: () => void;
}

export function LearningWorkspace(props: LearningWorkspaceProps) {
  const [view, setView] = useState<LearningView>("home");
  const { onClose } = props;
  useEffect(() => {
    const closeFromEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeFromEscape);
    return () => window.removeEventListener("keydown", closeFromEscape);
  }, [onClose]);
  const style = { bottom: props.bottomOffset, "--learning-right": props.rightColor } as CSSProperties;

  return <section className="learning-panel learning-workspace" aria-label="Learning" style={style}>
    <header className={`learning-workspace-header${view === "foundations" ? " compact" : ""}`}>
      <div>
        <span className="learning-eyebrow">Learning</span>
        <h2>{view === "home" ? "What would you like to practise?" : view === "reference" ? "Chord and scale reference" : view === "sight-reading" ? "Sight reading" : view === "readiness" ? "Keyboard check" : view === "foundations" ? "Beginner foundations" : "Find your starting point"}</h2>
      </div>
      <nav aria-label="Learning areas">
        <button type="button" className={view === "home" ? "active" : ""} aria-current={view === "home" ? "page" : undefined} onClick={() => setView("home")}>Home</button>
        <button type="button" className={view === "reference" ? "active" : ""} aria-current={view === "reference" ? "page" : undefined} onClick={() => setView("reference")}>Reference</button>
      </nav>
    </header>
    {view === "reference" ? <LearningPanel {...props} embedded /> : view === "sight-reading" ? <SightReadingSetup onStart={props.onStartSightReading} onBack={() => setView("home")} /> : view === "readiness" ? <KeyboardReadiness state={props.midiReadiness} onConnect={props.onConnectMidi} onBack={() => setView("home")} /> : view === "foundations" ? <BeginnerFoundations state={props.midiReadiness} midiEvents={props.midiEvents} audioSettings={props.audioSettings} onConnect={props.onConnectMidi} onOpenSightReading={() => setView("sight-reading")} /> : view === "route" ? <RouteFinder {...props} onOpenHome={() => setView("home")} onOpenReference={() => setView("reference")} onOpenSightReading={() => setView("sight-reading")} onOpenReadiness={() => setView("readiness")} onOpenFoundations={() => setView("foundations")} /> : <LearningHome {...props} onOpenReference={() => setView("reference")} onOpenSightReading={() => setView("sight-reading")} onOpenReadiness={() => setView("readiness")} onOpenRoute={() => setView("route")} onOpenFoundations={() => setView("foundations")} />}
  </section>;
}

function LearningHome({ scoreTitle, selectedRange, plan, onOpenScore, onCreatePlan, onContinuePlan, onOpenReference, onOpenSightReading, onOpenReadiness, onOpenRoute, onOpenFoundations }: LearningWorkspaceProps & { onOpenReference: () => void; onOpenSightReading: () => void; onOpenReadiness: () => void; onOpenRoute: () => void; onOpenFoundations: () => void }) {
  return <div className="learning-home">
    <section className="learning-home-hero">
      <div>
        <span className="learning-eyebrow">Guided piece practice</span>
        <h3>{scoreTitle ?? "Choose a piece to begin"}</h3>
        <p>{scoreTitle ? "Turn this score into manageable lessons. You can review and adjust every section before practising." : "Open a MusicXML score, then divide the whole piece or a selected passage into editable lessons."}</p>
      </div>
      <div className="learning-home-actions">
        {!scoreTitle ? <button type="button" className="primary" onClick={onOpenScore}>Open score</button> : <>
          {plan ? <button type="button" className="primary" onClick={onContinuePlan}>Continue plan</button> : <button type="button" className="primary" onClick={() => onCreatePlan()}>Plan whole score</button>}
          <button type="button" onClick={() => onCreatePlan(selectedRange)} disabled={!selectedRange}>Plan selected passage</button>
          <button type="button" onClick={onOpenScore}>Choose another score</button>
        </>}
      </div>
    </section>
    <div className="learning-home-grid">
      <button type="button" className="learning-area-card foundation-card" aria-label="Open beginner foundations" onClick={onOpenFoundations}><span>Start here</span><strong>Beginner foundations</strong><small>Find middle C and learn your first neighbouring notes with live guidance.</small></button>
      <button type="button" className="learning-area-card" onClick={onOpenReference}><span>Reference</span><strong>Chords and scales</strong><small>Explore fingerings, shapes, and generated practice scores.</small></button>
      <button type="button" className="learning-area-card" aria-label="Open sight reading" onClick={onOpenSightReading}><span>New</span><strong>Sight reading</strong><small>Read a fresh four-measure excerpt in one uninterrupted attempt.</small></button>
      <button type="button" className="learning-area-card" aria-label="Open keyboard check" onClick={onOpenReadiness}><span>Setup</span><strong>Keyboard check</strong><small>Confirm MIDI, note names, octave mapping, and detected range.</small></button>
      <button type="button" className="learning-area-card" aria-label="Open route finder" onClick={onOpenRoute}><span>Not sure?</span><strong>Find my starting point</strong><small>Choose your experience and goal for a suggested next activity.</small></button>
    </div>
  </div>;
}

function RouteFinder({ scoreTitle, plan, onOpenScore, onCreatePlan, onContinuePlan, onOpenHome, onOpenReference, onOpenSightReading, onOpenReadiness, onOpenFoundations }: LearningWorkspaceProps & { onOpenHome: () => void; onOpenReference: () => void; onOpenSightReading: () => void; onOpenReadiness: () => void; onOpenFoundations: () => void }) {
  const [experience, setExperience] = useState<LearningExperience>("new");
  const [goal, setGoal] = useState<LearningGoal>("read-music");
  const recommendation = recommendLearningRoute(experience, goal);
  const followRecommendation = () => {
    if (recommendation.action === "foundations") onOpenFoundations();
    else if (recommendation.action === "keyboard-check") onOpenReadiness();
    else if (recommendation.action === "reference") onOpenReference();
    else if (recommendation.action === "sight-reading") onOpenSightReading();
    else if (!scoreTitle) onOpenScore();
    else if (plan) onContinuePlan();
    else onCreatePlan();
  };
  return <div className="learning-home route-finder-home">
    <section className="learning-home-hero"><div><span className="learning-eyebrow">A quick recommendation</span><h3>What brings you to the piano today?</h3><p>This only suggests a useful place to begin. It does not lock features, set a permanent level, or save a profile.</p></div></section>
    <section className="settings-card route-finder-card">
      <fieldset><legend>Your experience</legend><div className="route-choice-grid">{([{ id: "new", title: "I’m just starting", detail: "New to piano or notation" }, { id: "returning", title: "I know the basics", detail: "Returning or early learner" }, { id: "confident", title: "I play confidently", detail: "Comfortable reading and practising" }] as const).map((choice) => <label key={choice.id} className={experience === choice.id ? "selected" : ""}><input type="radio" name="route-experience" checked={experience === choice.id} onChange={() => setExperience(choice.id)} /><span><strong>{choice.title}</strong><small>{choice.detail}</small></span></label>)}</div></fieldset>
      <fieldset><legend>Your goal today</legend><div className="route-choice-grid goals">{([{ id: "read-music", title: "Read music" }, { id: "learn-piece", title: "Learn a piece" }, { id: "technique", title: "Chords and scales" }, { id: "sight-reading", title: "Sight reading" }] as const).map((choice) => <label key={choice.id} className={goal === choice.id ? "selected" : ""}><input type="radio" name="route-goal" checked={goal === choice.id} onChange={() => setGoal(choice.id)} /><strong>{choice.title}</strong></label>)}</div></fieldset>
      <article className="route-recommendation"><span>Suggested next activity</span><h3>{recommendation.title}</h3><p>{recommendation.description}</p><button type="button" className="primary" onClick={followRecommendation}>{recommendation.action === "guided-piece" && !scoreTitle ? "Choose a score" : "Start here"}</button></article>
      <button type="button" className="guided-leave" onClick={onOpenHome}>Back to Learning</button>
    </section>
  </div>;
}

const FOUNDATION_NOTES = [
  { midi: 60, name: "C4", title: "Find middle C", instruction: "Find the group of two black keys near the centre of your piano. Middle C is the white key immediately to their left. Play it now." },
  { midi: 62, name: "D4", title: "Step right to D", instruction: "Keep your hand relaxed and move one white key to the right. Play D." },
  { midi: 64, name: "E4", title: "One more step to E", instruction: "Move one more white key to the right and play E." },
] as const;
const FIVE_NOTE_PATTERN = [60, 62, 64, 65, 67, 67, 65, 64, 62, 60].map((midi, index) => ({
  midi,
  name: midiNoteToName(midi),
  finger: index < 5 ? index + 1 : 10 - index,
  title: index === 0 ? "Set your right hand" : index < 5 ? "Step upward" : index === 5 ? "Turn around" : "Step back down",
  instruction: index === 0 ? "Place your right thumb on middle C, then let fingers 2, 3, 4, and 5 rest naturally over D, E, F, and G. Play C with finger 1." : `Play ${midiNoteToName(midi)} with right-hand finger ${index < 5 ? index + 1 : 10 - index}.`,
}));
const FIRST_STAFF_PATTERN = [60, 62, 64, 64, 62, 60].map((midi, index) => ({
  midi,
  name: midiNoteToName(midi),
  title: index < 3 ? "Meet the written note" : "Read it once more",
  instruction: midi === 60 ? "Middle C sits on its own short ledger line below the treble staff. Read the note, then play C4." : midi === 62 ? "D sits just below the bottom staff line. Read the note, then play D4." : "E sits on the bottom line of the treble staff. Read the note, then play E4.",
}));
const FIRST_RHYTHM_PATTERN = [
  ...Array.from({ length: 4 }, (_, index) => ({ midi: 60, name: "C4", rhythm: "quarter" as const, beats: 1, title: "Quarter note · one beat", instruction: `Play middle C for count ${index + 1}. Say “${index + 1}” aloud, then release before the next note.` })),
  ...Array.from({ length: 2 }, (_, index) => ({ midi: 60, name: "C4", rhythm: "half" as const, beats: 2, title: "Half note · two beats", instruction: `Play middle C and hold it while you count “${index * 2 + 1}–${index * 2 + 2}”, then release.` })),
];
const FIRST_READING_PATTERN = [
  { midi: 60, name: "C4", beats: 1, title: "Read the phrase", instruction: "Start on middle C. This quarter note lasts one beat." },
  { midi: 62, name: "D4", beats: 1, title: "Step upward", instruction: "Read D below the staff and play it for one beat." },
  { midi: 64, name: "E4", beats: 2, title: "Hold for two", instruction: "Read E on the bottom line and hold this half note for two beats." },
  { midi: 62, name: "D4", beats: 1, title: "Second measure", instruction: "Return to D for one beat." },
  { midi: 60, name: "C4", beats: 1, title: "Step back down", instruction: "Read middle C and play it for one beat." },
  { midi: 64, name: "E4", beats: 2, title: "Finish on E", instruction: "Finish with E and count two full beats." },
];
const BASS_CLEF_PATTERN = [48, 50, 52, 52, 50, 48].map((midi, index) => ({
  midi,
  name: midiNoteToName(midi),
  finger: [5, 4, 3, 3, 4, 5][index],
  title: index === 0 ? "Find bass C" : index < 3 ? "Step upward" : index === 3 ? "Turn around" : "Read back down",
  instruction: midi === 48 ? "C3 sits in the space above the second line of the bass staff. Play it with left-hand finger 5." : midi === 50 ? "D3 sits on the middle line of the bass staff. Play it with left-hand finger 4." : "E3 sits in the space above D. Play it with left-hand finger 3.",
}));
const HANDS_TOGETHER_PATTERN = [
  { midi: 48, midiNotes: [48], name: "C3", fingers: [{ midi: 48, finger: 5 }], title: "Left hand first", instruction: "Play bass C with left-hand finger 5, then release it." },
  { midi: 60, midiNotes: [60], name: "C4", fingers: [{ midi: 60, finger: 1 }], title: "Answer with the right", instruction: "Play middle C with right-hand finger 1, then release it." },
  { midi: 50, midiNotes: [50], name: "D3", fingers: [{ midi: 50, finger: 4 }], title: "Left hand steps up", instruction: "Play D3 with left-hand finger 4." },
  { midi: 62, midiNotes: [62], name: "D4", fingers: [{ midi: 62, finger: 2 }], title: "Right hand answers", instruction: "Play D4 with right-hand finger 2." },
  { midi: 52, midiNotes: [52], name: "E3", fingers: [{ midi: 52, finger: 3 }], title: "One more left-hand step", instruction: "Play E3 with left-hand finger 3." },
  { midi: 64, midiNotes: [64], name: "E4", fingers: [{ midi: 64, finger: 3 }], title: "One more right-hand step", instruction: "Play E4 with right-hand finger 3." },
  { midi: 48, midiNotes: [48, 60], name: "C3 + C4", fingers: [{ midi: 48, finger: 5 }, { midi: 60, finger: 1 }], title: "Bring both hands together", instruction: "Hold bass C with left-hand finger 5 and middle C with right-hand finger 1. The notes may arrive one after the other, but hold both together." },
];
const FIRST_RESTS_PATTERN = [
  { midi: 60, name: "C4", beats: 1, restAfter: 1, title: "Quarter note, then quarter rest", instruction: "Play middle C for count 1, then leave count 2 completely silent before the next note." },
  { midi: 60, name: "C4", beats: 2, restAfter: 0, title: "Half note", instruction: "Play middle C again and hold it through counts 3–4. Together, the note, rest, and half note fill one complete bar." },
  { midi: 62, name: "D4", beats: 2, restAfter: 2, title: "Half note, then half rest", instruction: "Play D for counts 1–2, then leave counts 3–4 silent. Keep counting even though no key is sounding." },
];
const FIRST_ACCIDENTALS_PATTERN = [
  { midi: 61, name: "C♯4", natural: "C4", accidental: "♯", title: "Sharp means one key higher", instruction: "Start from middle C and move to the very next key on the right — the black key C sharp." },
  { midi: 61, name: "D♭4", natural: "D4", accidental: "♭", title: "Flat means one key lower", instruction: "Start from D and move to the very next key on the left. D flat is the same piano key as C sharp." },
  { midi: 66, name: "F♯4", natural: "F4", accidental: "♯", title: "Find another sharp", instruction: "Find F, then move one key to the right and play F sharp." },
  { midi: 63, name: "E♭4", natural: "E4", accidental: "♭", title: "Find another flat", instruction: "Find E, then move one key to the left and play E flat." },
] as const;
const FOUNDATION_PIECE_PATTERN = [
  { midi: 60, name: "C4", beats: 1, restAfter: 0, measure: 1, title: "Right hand begins", instruction: "Play middle C for one beat with right-hand finger 1." },
  { midi: 62, name: "D4", beats: 1, restAfter: 0, measure: 1, title: "Step up", instruction: "Play D4 for one beat with right-hand finger 2." },
  { midi: 64, name: "E4", beats: 2, restAfter: 0, measure: 1, title: "Complete bar 1", instruction: "Hold E4 for two beats with right-hand finger 3." },
  { midi: 48, name: "C3", beats: 1, restAfter: 0, measure: 2, title: "Left hand answers", instruction: "Play bass C for one beat with left-hand finger 5." },
  { midi: 50, name: "D3", beats: 1, restAfter: 0, measure: 2, title: "Step up", instruction: "Play D3 for one beat with left-hand finger 4." },
  { midi: 52, name: "E3", beats: 2, restAfter: 0, measure: 2, title: "Complete bar 2", instruction: "Hold E3 for two beats with left-hand finger 3." },
  { midi: 61, name: "C♯4", beats: 1, restAfter: 0, measure: 3, title: "Read the sharp", instruction: "Play C sharp for one beat — the black key immediately to the right of middle C." },
  { midi: 62, name: "D4", beats: 1, restAfter: 0, measure: 3, title: "Resolve upward", instruction: "Step up to D4 for one beat." },
  { midi: 64, name: "E4", beats: 2, restAfter: 0, measure: 3, title: "Complete bar 3", instruction: "Hold E4 for two beats." },
  { midi: 48, midiNotes: [48, 60], name: "C3 + C4", beats: 2, restAfter: 2, measure: 4, fingers: [{ midi: 48, finger: 5 }, { midi: 60, finger: 1 }], title: "Finish together", instruction: "Play bass C and middle C together for two beats, then keep counting through the final two-beat rest." },
];
const FOUNDATION_KEYBOARD_KEYS = generatePianoLayout(48, 72);

const FOUNDATION_STAFF_STEP_BY_PITCH_CLASS = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];

function foundationStaffY(midiNote: number): number {
  const octave = Math.floor(midiNote / 12) - 1;
  const pitchClass = ((midiNote % 12) + 12) % 12;
  const stepsFromC4 = octave * 7 + FOUNDATION_STAFF_STEP_BY_PITCH_CLASS[pitchClass] - 28;
  return Math.max(17, Math.min(118, 101 - stepsFromC4 * 6));
}

function foundationBassStaffY(midiNote: number): number {
  const octave = Math.floor(midiNote / 12) - 1;
  const pitchClass = ((midiNote % 12) + 12) % 12;
  const stepsFromC3 = octave * 7 + FOUNDATION_STAFF_STEP_BY_PITCH_CLASS[pitchClass] - 21;
  return Math.max(17, Math.min(118, 71 - stepsFromC3 * 6));
}

function FoundationStaffNote({ midiNote, heldNotes, clef = "treble" }: { midiNote: number; heldNotes: number[]; clef?: "treble" | "bass" }) {
  const noteY = clef === "bass" ? foundationBassStaffY(midiNote) : foundationStaffY(midiNote);
  const visibleHeldNotes = heldNotes.filter((note) => note >= 48 && note <= 72);
  return <figure className="foundation-staff-note" role="img" aria-label={`${midiNoteToName(midiNote)} written on the ${clef} staff. ${heldNotes.length ? `${heldNotes.map(midiNoteToName).join(", ")} currently pressed.` : "No key currently pressed."}`}>
    <svg viewBox="0 0 280 130" aria-hidden="true">
      {[41, 53, 65, 77, 89].map((y) => <line key={y} x1="22" x2="258" y1={y} y2={y} />)}
      <text x="31" y={clef === "bass" ? "80" : "91"}>{clef === "bass" ? "𝄢" : "𝄞"}</text>
      {clef === "treble" && midiNote === 60 ? <line className="ledger" x1="169" x2="209" y1="101" y2="101" /> : null}
      <ellipse className="notehead" cx="189" cy={noteY} rx="11" ry="7" transform={`rotate(-18 189 ${noteY})`} />
      <line className="stem" x1="198" x2="198" y1={noteY - 2} y2={noteY - 42} />
      {visibleHeldNotes.map((note, index) => {
        const y = clef === "bass" ? foundationBassStaffY(note) : foundationStaffY(note);
        const x = 226 + Math.min(index, 2) * 13;
        return <g className="played-note-marker" key={`${note}-${index}`}><ellipse cx={x} cy={y} rx="10" ry="7" /><text x={x} y={Math.max(12, y - 11)}>{midiNoteToName(note)}</text></g>;
      })}
    </svg>
    <figcaption>{midiNoteToName(midiNote)}{midiNote === 60 ? " · middle C" : ""}</figcaption>
  </figure>;
}

function FoundationAccidentalCard({ natural, accidental, name }: { natural: string; accidental: "♯" | "♭"; name: string }) {
  const naturalMidi = natural === "C4" ? 60 : natural === "D4" ? 62 : natural === "E4" ? 64 : 65;
  const y = foundationStaffY(naturalMidi);
  return <figure className="foundation-accidental-card" role="img" aria-label={`${name} written on the treble staff with a ${accidental === "♯" ? "sharp" : "flat"} sign.`}>
    <svg viewBox="0 0 300 130" aria-hidden="true">
      {[41, 53, 65, 77, 89].map((lineY) => <line key={lineY} x1="22" x2="278" y1={lineY} y2={lineY} />)}
      <text className="clef" x="31" y="91">𝄞</text>
      {naturalMidi === 60 ? <line className="ledger" x1="182" x2="224" y1={y} y2={y} /> : null}
      <text className="accidental" x="164" y={y + 9}>{accidental}</text>
      <ellipse className="notehead" cx="204" cy={y} rx="11" ry="7" transform={`rotate(-18 204 ${y})`} />
      <line className="stem" x1="213" x2="213" y1={y - 2} y2={y - 42} />
    </svg>
    <figcaption>{name} · {accidental === "♯" ? `${natural} raised one key` : `${natural} lowered one key`}</figcaption>
  </figure>;
}

function FoundationKeyboard({ targetNote, heldNotes, targetFinger, targets, targetName }: { targetNote: number; heldNotes: number[]; targetFinger?: number; targets?: { midi: number; finger: number }[]; targetName?: string }) {
  const pressed = new Set(heldNotes);
  const targetMap = new Map((targets ?? [{ midi: targetNote, finger: targetFinger }]).map((target) => [target.midi, target.finger]));
  return <figure className="foundation-keyboard-diagram" role="img" aria-label={`Compact piano from C3 to C5. ${targetName ?? [...targetMap.keys()].map(midiNoteToName).join(" and ")} ${targetMap.size === 1 ? "is" : "are"} the target. ${heldNotes.length ? `${heldNotes.map(midiNoteToName).join(", ")} currently pressed.` : "No key currently pressed."}`}>
    <div className="foundation-keyboard" aria-hidden="true">
      {FOUNDATION_KEYBOARD_KEYS.map((key) => {
        const name = targetName && key.midiNote === targetNote ? targetName : midiNoteToName(key.midiNote);
        const target = targetMap.has(key.midiNote);
        const finger = targetMap.get(key.midiNote);
        const isPressed = pressed.has(key.midiNote);
        return <i key={key.midiNote} className={`foundation-piano-key ${key.isBlack ? "black" : "white"}${target ? " target" : ""}${isPressed ? " pressed" : ""}`} style={{ left: `${key.x * 100}%`, width: `${key.width * 100}%` }}>{finger ? <b aria-hidden="true">{finger}</b> : null}<span>{name}</span>{key.midiNote === 60 ? <small>middle C</small> : null}</i>;
      })}
    </div>
    <figcaption><span><i className="target-swatch" />Note to play</span><span><i className="pressed-swatch" />Key pressed</span></figcaption>
  </figure>;
}

type FoundationLesson = "landmark" | "five-note" | "staff-notes" | "rhythm" | "first-phrase" | "bass-clef" | "hands-together" | "rests" | "accidentals" | "foundation-piece";
const FOUNDATION_LESSON_TILES: { id: FoundationLesson; number: number; title: string }[] = [
  { id:"landmark",number:1,title:"Find C, D, E" },{ id:"five-note",number:2,title:"Five-note position" },{ id:"staff-notes",number:3,title:"Notes on the staff" },{ id:"rhythm",number:4,title:"Pulse and rhythm" },{ id:"first-phrase",number:5,title:"First phrase" },
  { id:"bass-clef",number:6,title:"Bass clef" },{ id:"hands-together",number:7,title:"Both hands" },{ id:"rests",number:8,title:"Bars and rests" },{ id:"accidentals",number:9,title:"Sharps and flats" },{ id:"foundation-piece",number:10,title:"First complete piece" },
];

function BeginnerFoundations({ state, audioSettings, midiEvents = [], onConnect, onOpenSightReading }: { state?: MidiReadinessState; audioSettings?: AudioSettings; midiEvents?: CapturedMidiMessage[]; onConnect?: () => void; onOpenSightReading: () => void }) {
  const [lesson, setLesson] = useState<FoundationLesson>("landmark");
  const [completedLessons, setCompletedLessons] = useState<FoundationLesson[]>([]);
  const [step, setStep] = useState(0);
  const [feedback, setFeedback] = useState("Take your time — there is no score and no countdown.");
  const [demo, setDemo] = useState<{ active: boolean; elapsedMs: number; notes?: number[] }>({ active: false, elapsedMs: 0 });
  const [synth] = useState(() => new PianoSynthEngine());
  const [demoMetronome] = useState(() => new WebAudioMetronomeEngine());
  const demoTimersRef = useRef<number[]>([]);
  const initialMessageIdRef = useRef(state?.messageId ?? 0);
  const processedMessageIdRef = useRef(state?.messageId ?? 0);
  const sequence = lesson === "landmark" ? FOUNDATION_NOTES : lesson === "five-note" ? FIVE_NOTE_PATTERN : lesson === "staff-notes" ? FIRST_STAFF_PATTERN : lesson === "rhythm" ? FIRST_RHYTHM_PATTERN : lesson === "first-phrase" ? FIRST_READING_PATTERN : lesson === "bass-clef" ? BASS_CLEF_PATTERN : lesson === "hands-together" ? HANDS_TOGETHER_PATTERN : lesson === "rests" ? FIRST_RESTS_PATTERN : lesson === "accidentals" ? FIRST_ACCIDENTALS_PATTERN : FOUNDATION_PIECE_PATTERN;
  const complete = step >= sequence.length;
  const teachingRhythm = lesson === "rhythm";
  const teachingPhrase = lesson === "first-phrase";
  const teachingRests = lesson === "rests";
  const teachingPiece = lesson === "foundation-piece";
  const markLessonComplete = useCallback((completed: FoundationLesson) => setCompletedLessons((previous) => previous.includes(completed) ? previous : [...previous, completed]), []);
  const completeRhythm = useCallback(() => markLessonComplete("rhythm"), [markLessonComplete]);
  const completePhrase = useCallback(() => markLessonComplete("first-phrase"), [markLessonComplete]);
  const completeRests = useCallback(() => markLessonComplete("rests"), [markLessonComplete]);
  const completePiece = useCallback(() => markLessonComplete("foundation-piece"), [markLessonComplete]);
  useEffect(() => { if (complete && !teachingRhythm && !teachingPhrase && !teachingRests && !teachingPiece) markLessonComplete(lesson); }, [complete, lesson, markLessonComplete, teachingPhrase, teachingPiece, teachingRests, teachingRhythm]);
  useEffect(() => {
    if (teachingRhythm || teachingPhrase || teachingRests || teachingPiece || complete || state?.lastNote === undefined || state.messageId <= initialMessageIdRef.current || state.messageId <= processedMessageIdRef.current) return;
    processedMessageIdRef.current = state.messageId;
    const expected = sequence[step];
    const expectedNotes: number[] = "midiNotes" in expected && Array.isArray(expected.midiNotes) ? expected.midiNotes : [expected.midi];
    const expectedPressed = expectedNotes.every((note) => state.heldNotes.includes(note));
    if (expectedNotes.includes(state.lastNote) && expectedPressed) {
      const next = step + 1;
      setStep(next);
setFeedback(next === sequence.length ? lesson === "landmark" ? "You found C, D, and E. That three-note shape is the beginning of your keyboard map." : lesson === "five-note" ? "You played the complete five-note position up and back down with the correct fingers." : lesson === "staff-notes" ? "You connected all six written notes to the correct piano keys." : lesson === "bass-clef" ? "You found bass C and read C3, D3, and E3 up and back down with your left hand." : lesson === "hands-together" ? "You alternated between both hands and finished by playing both C notes together." : lesson === "accidentals" ? "You used sharp and flat signs to find four written black-key notes." : "You played a complete four-bar piece using both staves, two hands, an accidental, and a final rest." : `That’s ${expected.name}. Nicely found${"finger" in expected ? ` with finger ${expected.finger}` : ""}.`);
    } else if (expectedNotes.includes(state.lastNote)) {
      const remaining = expectedNotes.filter((note) => !state.heldNotes.includes(note)).map(midiNoteToName).join(" and ");
      setFeedback(`Good — keep holding that note and add ${remaining}.`);
    } else {
      const played = midiNoteToName(state.lastNote);
      setFeedback(`You played ${played}. Look for ${expected.name} and try again — wrong notes are part of finding your way.`);
    }
  }, [complete, teachingPhrase, teachingPiece, teachingRests, teachingRhythm, lesson, sequence, state?.heldNotes, state?.lastNote, state?.messageId, step]);
  const restart = () => {
    stopDemo();
    initialMessageIdRef.current = state?.messageId ?? 0;
    processedMessageIdRef.current = initialMessageIdRef.current;
    setStep(0);
    setFeedback("Take your time — there is no score and no countdown.");
  };
  const stopDemo = () => {
    for (const timer of demoTimersRef.current) window.clearTimeout(timer);
    demoTimersRef.current = [];
    synth.stopAll();
    demoMetronome.stopAll();
    setDemo({ active: false, elapsedMs: 0 });
  };
  useEffect(() => () => { for (const timer of demoTimersRef.current) window.clearTimeout(timer); synth.close(); demoMetronome.close(); }, [demoMetronome, synth]);
  const startDemo = async () => {
    if (demo.active) { stopDemo(); return; }
    if (audioSettings?.muted || audioSettings?.volume === 0) { setFeedback("Sound is muted. Unmute score audio to hear this lesson."); return; }
    const rhythmic = lesson === "foundation-piece";
    const beatMs = 750;
    const demoSequence = sequence;
    const timings: { notes: number[]; onsetMs: number; durationMs: number }[] = [];
    let totalMs = 0;
    for (const item of demoSequence) { const beats = rhythmic && "beats" in item && typeof item.beats === "number" ? item.beats : 1; const restAfter = "restAfter" in item && typeof item.restAfter === "number" ? item.restAfter : 0; const notes: number[] = "midiNotes" in item && Array.isArray(item.midiNotes) ? item.midiNotes : [item.midi]; timings.push({ notes, onsetMs: totalMs, durationMs: rhythmic ? beats * beatMs : 430 }); totalMs += rhythmic ? (beats + restAfter) * beatMs : 550; }
    try {
      await synth.prepare(); synth.setOutput(audioSettings?.volume ?? 65, false);
      if (rhythmic) { await demoMetronome.prepare(); demoMetronome.setVolume(audioSettings?.metronomeVolume ?? 55); for (let beat = 0; beat < totalMs / beatMs; beat += 1) demoMetronome.scheduleClick(`foundation:${beat}`, beat * beatMs, beat % 4 === 0); }
      timings.forEach((item, index) => { item.notes.forEach((note) => synth.scheduleNote(`foundation:${index}:${note}`, note, item.onsetMs, item.durationMs)); demoTimersRef.current.push(window.setTimeout(() => setDemo((value) => ({ ...value, notes: item.notes })), item.onsetMs), window.setTimeout(() => setDemo((value) => ({ ...value, notes: undefined })), item.onsetMs + item.durationMs)); });
      const startedAt = learningClockNow(); setDemo({ active: true, elapsedMs: 0, notes: timings[0]?.notes });
      const tick = () => { const elapsedMs = learningClockNow() - startedAt; if (elapsedMs >= totalMs) { stopDemo(); return; } setDemo((value) => ({ ...value, elapsedMs })); demoTimersRef.current.push(window.setTimeout(tick, 32)); };
      demoTimersRef.current.push(window.setTimeout(tick, 32));
    } catch { setFeedback("Audio could not be started in this browser."); stopDemo(); }
  };
  const chooseLesson = (nextLesson: FoundationLesson) => {
    stopDemo();
    initialMessageIdRef.current = state?.messageId ?? 0;
    processedMessageIdRef.current = initialMessageIdRef.current;
    setLesson(nextLesson);
    setStep(0);
    setFeedback("Take your time — there is no score and no countdown.");
  };
  const hasNextLesson = lesson !== "foundation-piece";
  const unavailable = !state?.supported ? "Web MIDI is not supported in this browser." : !state.secureContext ? "MIDI needs localhost or HTTPS." : undefined;
  const current = sequence[Math.min(step, sequence.length - 1)];
  const currentFinger = "finger" in current && typeof current.finger === "number" ? current.finger : undefined;
  const currentTargets = "fingers" in current && Array.isArray(current.fingers) ? current.fingers as { midi: number; finger: number }[] : undefined;
  const shownHeldNotes = demo.notes === undefined ? state?.heldNotes ?? [] : demo.notes;
  const activeTile = FOUNDATION_LESSON_TILES.find((tile) => tile.id === lesson) ?? FOUNDATION_LESSON_TILES[0];
  return <div className="learning-home foundation-home">
    <section className="settings-card foundation-lesson-card">
      <header className="foundation-course-strip"><div><span>Unit 1 · Lesson {activeTile.number} of {FOUNDATION_LESSON_TILES.length}</span><strong>{activeTile.title}</strong></div><div className="foundation-course-progress" aria-label={`${completedLessons.length} of ${FOUNDATION_LESSON_TILES.length} foundation lessons complete`}><strong>{completedLessons.length} of {FOUNDATION_LESSON_TILES.length} complete</strong><div><span style={{ width: `${completedLessons.length / FOUNDATION_LESSON_TILES.length * 100}%` }} /></div></div></header>
      <nav className="foundation-lesson-picker" aria-label="Unit 1 lessons">{FOUNDATION_LESSON_TILES.map((tile) => { const done=completedLessons.includes(tile.id); return <button key={tile.id} type="button" className={`${lesson===tile.id?"active ":""}${done?"complete":""}`.trim()} aria-current={lesson===tile.id?"page":undefined} aria-label={`Lesson ${tile.number}: ${tile.title}${done?", complete":""}`} onClick={()=>chooseLesson(tile.id)}><span aria-hidden="true">{done?"✓":tile.number}</span></button>; })}</nav>
      {teachingRhythm ? <FoundationRhythmLesson events={midiEvents} connected={state?.accessStatus === "ready"} heldNotes={state?.heldNotes ?? []} audioSettings={audioSettings} keyboard={(notes) => <FoundationKeyboard targetNote={60} heldNotes={notes} />} onNext={() => chooseLesson("first-phrase")} onComplete={completeRhythm} onConnect={onConnect} /> : teachingPhrase ? <FoundationPhraseLesson events={midiEvents} connected={state?.accessStatus === "ready"} heldNotes={state?.heldNotes ?? []} audioSettings={audioSettings} keyboard={(target, notes) => <FoundationKeyboard targetNote={target} heldNotes={notes} />} onNext={() => chooseLesson("bass-clef")} onComplete={completePhrase} onConnect={onConnect} /> : teachingRests ? <FoundationRestLesson events={midiEvents} connected={state?.accessStatus === "ready"} heldNotes={state?.heldNotes ?? []} audioSettings={audioSettings} keyboard={(target, notes) => <FoundationKeyboard targetNote={target ?? 60} targets={target === undefined ? [] : undefined} heldNotes={notes} />} onNext={() => chooseLesson("accidentals")} onComplete={completeRests} onConnect={onConnect} /> : teachingPiece ? <FoundationPieceLesson events={midiEvents} connected={state?.accessStatus === "ready"} heldNotes={state?.heldNotes ?? []} audioSettings={audioSettings} keyboard={(targets, notes) => <FoundationKeyboard targetNote={targets[0] ?? 60} targetName={targets[0] === 61 ? "C♯4" : undefined} targets={targets.map((midi) => ({ midi, finger: targets.length > 1 ? midi === 48 ? 5 : 1 : 0 }))} heldNotes={notes} />} onFinish={onOpenSightReading} onComplete={completePiece} onConnect={onConnect} /> : <>
      {lesson === "landmark" ? <ol className="foundation-step-rail" aria-label="Lesson progress">{FOUNDATION_NOTES.map((note, index) => <li key={note.name} className={index < step ? "done" : index === step ? "active" : ""}><span>{index < step ? "✓" : index + 1}</span><strong>{note.name}</strong></li>)}</ol> : <div className="foundation-pattern-progress" aria-label={`Pattern step ${Math.min(step + 1, sequence.length)} of ${sequence.length}`}><div><span>{lesson === "five-note" ? "Up to G" : lesson === "staff-notes" ? "Meet C, D, E" : lesson === "bass-clef" ? "Left hand up" : lesson === "hands-together" ? "Take turns" : lesson === "accidentals" ? "Read sharps" : "Bars 1–2"}</span><span>{lesson === "five-note" ? "Back to C" : lesson === "staff-notes" ? "Read them again" : lesson === "bass-clef" ? "Read back down" : lesson === "hands-together" ? "Play together" : lesson === "accidentals" ? "Read flats" : lesson === "foundation-piece" ? "Bars 3–4" : "Measure 2"}</span></div><ol style={{ "--foundation-step-count": sequence.length } as CSSProperties}>{sequence.map((note, index) => <li key={`${note.name}-${index}`} className={index < step ? "done" : index === step ? "active" : ""}>{index < step ? "✓" : note.name.replace(/\d/g, "")}</li>)}</ol><strong>Step {Math.min(step + 1, sequence.length)} of {sequence.length}</strong></div>}
      {unavailable ? <p className="error">{unavailable}</p> : state?.accessStatus !== "ready" ? <div className="foundation-connect"><h3>Connect your MIDI piano</h3><p>You can hear and watch every demonstration now. Connect a keyboard when you are ready for live note guidance.</p><button type="button" className="primary" disabled={state?.accessStatus === "requesting"} onClick={onConnect}>{state?.accessStatus === "requesting" ? "Connecting…" : "Connect MIDI"}</button></div> : null}
      {complete ? <div className="foundation-complete" role="status"><span>Lesson complete</span><h3>{lesson === "landmark" ? "You’ve mapped C, D, and E" : lesson === "five-note" ? "You’ve played your first five-note pattern" : lesson === "staff-notes" ? "You’ve read your first staff notes" : lesson === "bass-clef" ? "You’ve found your first bass-clef notes" : lesson === "hands-together" ? "You’ve played your first notes with both hands" : lesson === "accidentals" ? "You’ve found your first sharps and flats" : "You’ve played your first complete piece"}</h3><p>{feedback}</p><div className="foundation-complete-actions lesson-action-dock"><button type="button" onClick={restart}>Practise again</button>{hasNextLesson ? <button type="button" className="primary" onClick={() => chooseLesson(lesson === "landmark" ? "five-note" : lesson === "five-note" ? "staff-notes" : lesson === "staff-notes" ? "rhythm" : lesson === "bass-clef" ? "hands-together" : lesson === "hands-together" ? "rests" : "foundation-piece")}>Next lesson</button> : <button type="button" className="primary" onClick={onOpenSightReading}>Try sight reading</button>}</div></div> : <>
        <article className="foundation-instruction"><span>{current.title}</span><h3>{`Play ${current.name}${currentFinger ? ` · finger ${currentFinger}` : ""}`}</h3><p>{current.instruction}</p><button type="button" className={`foundation-demo-button${demo.active ? " playing" : ""}`} onClick={startDemo}><EarIcon />{demo.active ? "Stop demonstration" : "Hear this in action"}</button>{lesson === "staff-notes" ? <FoundationStaffNote midiNote={current.midi} heldNotes={shownHeldNotes} /> : lesson === "bass-clef" ? <FoundationStaffNote midiNote={current.midi} heldNotes={shownHeldNotes} clef="bass" /> : lesson === "accidentals" && "natural" in current && "accidental" in current ? <FoundationAccidentalCard natural={current.natural} accidental={current.accidental} name={current.name} /> : null}<FoundationKeyboard targetNote={current.midi} targetName={lesson === "accidentals" && current.name.includes("♯") ? current.name : undefined} heldNotes={shownHeldNotes} targetFinger={currentFinger} targets={currentTargets} /></article>
        <p className="foundation-feedback" role="status">{state?.accessStatus === "ready" ? feedback : "Hear the example, then connect your MIDI piano to try it with live guidance."}</p>
      </>}
      </>}
    </section>
  </div>;
}

function KeyboardReadiness({ state, onConnect, onBack }: { state?: MidiReadinessState; onConnect?: () => void; onBack: () => void }) {
  const [check, setCheck] = useState<{ low?: number; middle?: number; high?: number }>({});
  const initialMessageIdRef = useRef(state?.messageId ?? 0);
  const processedMessageIdRef = useRef(state?.messageId ?? 0);
  const processedSustainMessageIdRef = useRef(state?.messageId ?? 0);
  const [pedalCheck, setPedalCheck] = useState({ pressed: false, released: false });
  useEffect(() => {
    if (state?.lastNote === undefined || state.messageId <= initialMessageIdRef.current || state.messageId <= processedMessageIdRef.current) return;
    processedMessageIdRef.current = state.messageId;
    const note = state.lastNote;
    setCheck((current) => current.low === undefined ? { ...current, low: note } : current.middle === undefined ? { ...current, middle: note } : current.high === undefined ? { ...current, high: note } : current);
  }, [state?.lastNote, state?.messageId]);
  useEffect(() => {
    if (state?.lastSustainMessageId === undefined || state.lastSustainOn === undefined || state.lastSustainMessageId <= initialMessageIdRef.current || state.lastSustainMessageId <= processedSustainMessageIdRef.current) return;
    processedSustainMessageIdRef.current = state.lastSustainMessageId;
    setPedalCheck((current) => state.lastSustainOn ? { ...current, pressed: true } : { ...current, released: true });
  }, [state?.lastSustainMessageId, state?.lastSustainOn]);
  const reset = () => {
    initialMessageIdRef.current = state?.messageId ?? 0;
    processedMessageIdRef.current = initialMessageIdRef.current;
    processedSustainMessageIdRef.current = initialMessageIdRef.current;
    setCheck({});
    setPedalCheck({ pressed: false, released: false });
  };
  const step = check.low === undefined ? "Play your lowest comfortable key." : check.middle === undefined ? "Now play the physical middle C key." : check.high === undefined ? "Finally, play your highest comfortable key." : "Range check complete.";
  const lastCaptured = check.high ?? check.middle ?? check.low;
  const middleMatches = check.middle === undefined ? undefined : check.middle === 60;
  const rangeOrderMatches = check.low === undefined || check.middle === undefined || check.high === undefined ? undefined : check.low < check.middle && check.middle < check.high;
  const unavailable = !state?.supported ? "Web MIDI is not supported in this browser." : !state.secureContext ? "MIDI needs localhost or HTTPS." : undefined;
  return <div className="learning-home readiness-home">
    <section className="learning-home-hero"><div><span className="learning-eyebrow">Practice readiness</span><h3>Make sure the keyboard agrees</h3><p>Play a few notes before practising. This check confirms the selected MIDI device, the app’s octave labels, and the range currently reaching the browser.</p></div></section>
    <section className="settings-card readiness-card">
      <header><div><span className="settings-label">MIDI keyboard</span><h3>{state?.accessStatus === "ready" ? state.deviceName ?? "Keyboard connected" : "Connect your keyboard"}</h3></div><span className={`readiness-status ${state?.accessStatus === "ready" ? "ready" : ""}`}>{state?.accessStatus === "ready" ? "Ready" : state?.accessStatus === "requesting" ? "Connecting…" : "Not connected"}</span></header>
      {unavailable ? <p className="error">{unavailable}</p> : state?.accessStatus !== "ready" ? <><p>Connect MIDI, then play notes at the low, middle, and high ends of the range you expect to use.</p><button type="button" className="primary" disabled={state?.accessStatus === "requesting"} onClick={onConnect}>Connect MIDI</button></> : <>
        <div className="readiness-prompt" role="status"><span>Next step</span><strong>{step}</strong></div>
        <div className="readiness-note"><span>Last captured</span><strong>{lastCaptured === undefined ? "—" : midiNoteToName(lastCaptured)}</strong><small>{lastCaptured === undefined ? "Play a note to begin" : state.heldNotes.length ? `${state.heldNotes.map(midiNoteToName).join(" + ")} held` : "Release detected"}</small></div>
        <div className="readiness-range"><div className={check.low === undefined ? "active" : "done"}><span>1 · Low key</span><strong>{check.low === undefined ? "Waiting…" : midiNoteToName(check.low)}</strong></div><div className={check.low !== undefined && check.middle === undefined ? "active" : check.middle === undefined ? "" : middleMatches ? "done" : "warning"}><span>2 · Middle C</span><strong>{check.middle === undefined ? "Waiting…" : midiNoteToName(check.middle)}</strong></div><div className={check.middle !== undefined && check.high === undefined ? "active" : check.high === undefined ? "" : "done"}><span>3 · High key</span><strong>{check.high === undefined ? "Waiting…" : midiNoteToName(check.high)}</strong></div></div>
        {middleMatches === false ? <p className="readiness-warning">The physical middle C arrived as {midiNoteToName(check.middle!)} rather than C4. Check the keyboard’s octave or transpose controls.</p> : null}
        {rangeOrderMatches === false ? <p className="readiness-warning">Those notes are not ordered low–middle–high. Reset and try the three steps again.</p> : null}
        {middleMatches && rangeOrderMatches ? <p className="readiness-success">Keyboard labels and range are consistent. You’re ready to practise.</p> : null}
        <section className="readiness-pedal" aria-label="Sustain pedal check"><div><span>Sustain pedal</span><strong>{pedalCheck.pressed && pedalCheck.released ? "Press and release detected" : pedalCheck.pressed ? "Pedal down detected — now release it" : pedalCheck.released ? "Pedal release detected — press it once" : "Press and release your pedal"}</strong><small>{pedalCheck.pressed || pedalCheck.released ? `Current state: ${state.sustainOn ? "down" : "up"}` : "Optional — skip this if you do not use a pedal."}</small></div><span className={`readiness-status ${pedalCheck.pressed && pedalCheck.released ? "ready" : ""}`}>{pedalCheck.pressed && pedalCheck.released ? "Detected" : state.sustainOn ? "Down" : "Not tested"}</span></section>
        <p className="settings-hint">Sustain is currently shown as input evidence only; note-on timing remains the basis of performance scoring.</p>
        <button type="button" onClick={reset}>Start range check again</button>
      </>}
      <button type="button" className="guided-leave" onClick={onBack}>Back to Learning</button>
    </section>
  </div>;
}

function SightReadingSetup({ onStart, onBack }: { onStart: (options: SightReadingOptions) => void; onBack: () => void }) {
  const [level, setLevel] = useState<SightReadingLevel>("beginner");
  const [hand, setHand] = useState<SightReadingHand>("right");
  const [measures, setMeasures] = useState<SightReadingLength>(4);
  const [tempoBpm, setTempoBpm] = useState<SightReadingTempo>(80);
  const [preparationSeconds, setPreparationSeconds] = useState<SightReadingPreparation>(0);
  return <div className="learning-home sight-reading-setup">
    <section className="learning-home-hero"><div><span className="learning-eyebrow">One look, one attempt</span><h3>Practise reading forward</h3><p>You’ll receive a fresh excerpt at your chosen length and tempo. Take a moment to inspect it, then play through once without stopping; feedback appears only afterward.</p></div></section>
    <section className="settings-card sight-reading-levels"><span className="settings-label">Choose a level</span>
      <div className="learning-preset-choices" role="radiogroup" aria-label="Sight-reading level">{(["beginner", "developing", "intermediate"] as SightReadingLevel[]).map((id) => <label key={id} className={level === id ? "selected" : ""}><input type="radio" name="sight-reading-level" checked={level === id} onChange={() => setLevel(id)} /><span><strong>{id[0].toUpperCase() + id.slice(1)}</strong><small>{id === "beginner" ? "Five-note position in C" : id === "developing" ? "Wider treble range" : "Wider range in G major"}</small></span></label>)}</div>
      <div className="sight-reading-options-grid">
        <label>Hands<select value={hand} onChange={(event) => setHand(event.target.value as SightReadingHand)}><option value="right">Right hand</option><option value="left">Left hand</option><option value="both">Both hands</option></select></label>
        <label>Length<select value={measures} onChange={(event) => setMeasures(Number(event.target.value) as SightReadingLength)}><option value="4">4 measures</option><option value="8">8 measures</option><option value="12">12 measures</option></select></label>
        <label>Tempo<select value={tempoBpm} onChange={(event) => setTempoBpm(Number(event.target.value) as SightReadingTempo)}><option value="60">60 BPM</option><option value="80">80 BPM</option><option value="100">100 BPM</option><option value="120">120 BPM</option></select></label>
        <label>Preparation<select value={preparationSeconds} onChange={(event) => setPreparationSeconds(Number(event.target.value) as SightReadingPreparation)}><option value="0">Unlimited</option><option value="15">15 seconds</option><option value="30">30 seconds</option><option value="60">60 seconds</option></select></label>
      </div>
      <div className="button-row"><button type="button" className="primary" onClick={() => onStart({ level, hand, measures, tempoBpm, preparationSeconds })}>Generate excerpt</button><button type="button" onClick={onBack}>Back</button></div>
    </section>
  </div>;
}

function EarIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.5 3a7 7 0 0 0-7 7h2a5 5 0 1 1 8.7 3.35c-1.17 1.28-2.7 1.9-3.2 3.62-.28.94-.73 2.03-2 2.03-1.1 0-2-.9-2-2H7c0 2.21 1.79 4 4 4 2.75 0 3.62-2.22 3.92-3.24.3-1.02 1.35-1.53 2.75-3.06A7 7 0 0 0 12.5 3Zm-.5 4a3 3 0 0 0-3 3h2a1 1 0 1 1 1.74.67c-.82.9-1.74 1.58-1.74 3.33h2c0-.93.34-1.23 1.22-2.2A3 3 0 0 0 12 7Z" /></svg>; }
