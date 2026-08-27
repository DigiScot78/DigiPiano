import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScoreRenderer } from "./components/ScoreRenderer";
import {
  advanceWhenSatisfied,
  compareHeldNotesToEvent,
  filterEventForHand,
  feedbackMarkersForHeldNotes,
  firstPlayableIndex,
  initialLearningState,
  isEventPlayableForHand,
  nextPlayableIndex,
  resolvePracticeIndex,
  type HandMode,
  type LearningState,
  type PracticeRunMode,
  type ScoreSelectionRange,
} from "./learning/matcher";
import { midiNoteToName } from "./music/note";
import { loadScoreFile } from "./music/musicXmlLoader";
import { parseMusicXmlTimeline } from "./music/musicXmlParser";
import type { LoadedScore, ParsedScore, ScoreEvent } from "./music/scoreTypes";
import { useMidiInput } from "./hooks/useMidiInput";
import "./styles.css";

interface PracticeAttemptDiagnostic {
  source: "midi" | "simulation";
  triggeringMidiNote?: number;
  heldNotesBefore: number[];
  heldNotesAfter: number[];
  startingIndex: number;
  resolvedIndex: number;
  resultingIndex: number;
  expectedEventId?: string;
  measureNumber?: number;
  expectedNotes: number[];
  satisfied: boolean;
  missingNotes: number[];
  extraNotes: number[];
  advanced: boolean;
  completed: boolean;
}

function App() {
  const midi = useMidiInput();
  const [loadedScore, setLoadedScore] = useState<LoadedScore | null>(null);
  const [parsedScore, setParsedScore] = useState<ParsedScore>({ events: [], warnings: [] });
  const [learningState, setLearningState] = useState<LearningState>(initialLearningState());
  const learningStateRef = useRef<LearningState>(learningState);
  const [scoreError, setScoreError] = useState<string | undefined>();
  const [scoreStatus, setScoreStatus] = useState<"empty" | "loading" | "ready" | "error">("empty");
  const [renderError, setRenderError] = useState<string | undefined>();
  const [simulatedHeldNotes, setSimulatedHeldNotes] = useState<number[]>([]);
  const [selectedRange, setSelectedRange] = useState<ScoreSelectionRange | undefined>();
  const [handMode, setHandMode] = useState<HandMode>("both");
  const [runMode, setRunMode] = useState<PracticeRunMode>("once");
  const [lastPracticeAttempt, setLastPracticeAttempt] = useState<PracticeAttemptDiagnostic | undefined>();
  const [showCorrectNoteNames, setShowCorrectNoteNames] = useState(true);
  const [showWrongNoteNames, setShowWrongNoteNames] = useState(true);
  const [carriedCompletedNotes, setCarriedCompletedNotes] = useState<number[]>([]);
  const previousHeldNotesRef = useRef<number[]>([]);

  const currentEvent = parsedScore.events[learningState.currentIndex];
  const expectedEvent = useMemo(() => filterEventForHand(currentEvent, handMode), [currentEvent, handMode]);
  const currentEventPlayable = isEventPlayableForHand(currentEvent, handMode);
  const nextPlayableEventIndex = useMemo(() => nextPlayableIndex(
    parsedScore.events,
    learningState.currentIndex + 1,
    selectedRange?.endIndex ?? parsedScore.events.length - 1,
    handMode,
  ), [handMode, learningState.currentIndex, parsedScore.events, selectedRange]);
  const combinedHeldNotes = useMemo(
    () => Array.from(new Set([...midi.heldNotes, ...simulatedHeldNotes])).sort((a, b) => a - b),
    [midi.heldNotes, simulatedHeldNotes],
  );
  const scoreFeedbackMarkers = useMemo(
    () => feedbackMarkersForHeldNotes(combinedHeldNotes, currentEvent, handMode, carriedCompletedNotes),
    [carriedCompletedNotes, combinedHeldNotes, currentEvent, handMode],
  );

  const practiceOptions = useMemo(() => ({ handMode, runMode, range: selectedRange }), [handMode, runMode, selectedRange]);

  useEffect(() => {
    setLearningState((current) => {
      const nextIndex = resolvePracticeIndex(current.currentIndex, parsedScore.events, handMode, selectedRange);
      const next = nextIndex === current.currentIndex ? current : initialLearningState(nextIndex);
      learningStateRef.current = next;
      return next;
    });
    setSimulatedHeldNotes([]);
  }, [handMode, parsedScore.events, selectedRange]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setScoreError(undefined);
    setRenderError(undefined);
    setScoreStatus("loading");
    const resetState = initialLearningState();
    learningStateRef.current = resetState;
    setLearningState(resetState);
    setSimulatedHeldNotes([]);
    setSelectedRange(undefined);

    try {
      const score = await loadScoreFile(file);
      const parsed = parseMusicXmlTimeline(score.xmlText);
      console.debug("[score-import]", importDiagnosticsForDebug(parsed));
      setLoadedScore(score);
      setParsedScore(parsed);
      const nextState = initialLearningState(firstPlayableIndex(parsed.events, handMode) ?? 0);
      learningStateRef.current = nextState;
      setLearningState(nextState);
    } catch (error) {
      setLoadedScore(null);
      setParsedScore({ events: [], warnings: [] });
      setScoreStatus("error");
      setScoreError(error instanceof Error ? error.message : "Score loading failed.");
    }
  };

  const advanceWithNotes = useCallback((
    notes: number[],
    diagnosticContext?: {
      source: PracticeAttemptDiagnostic["source"];
      triggeringMidiNote?: number;
      heldNotesBefore: number[];
      heldNotesAfter: number[];
    },
  ) => {
    const current = learningStateRef.current;
    const resolvedIndexBeforeAdvance = resolvePracticeIndex(current.currentIndex, parsedScore.events, handMode, selectedRange);
    const activeEventBeforeAdvance = parsedScore.events[resolvedIndexBeforeAdvance];
    const expectedNotesBeforeAdvance = filterEventForHand(activeEventBeforeAdvance, handMode)?.midiNotes ?? [];
    const next = advanceWhenSatisfied(current, parsedScore.events, notes, practiceOptions);
    learningStateRef.current = next;
    setLearningState(next);

    const advanced = next.currentIndex !== resolvedIndexBeforeAdvance || next.completedEventIds.length > current.completedEventIds.length || next.isComplete !== current.isComplete;
    if (advanced) {
      const held = new Set(notes);
      setCarriedCompletedNotes(expectedNotesBeforeAdvance.filter((note) => held.has(note)));
    }

    if (diagnosticContext) {
      const resolvedIndex = resolvedIndexBeforeAdvance;
      const activeEvent = activeEventBeforeAdvance;
      const comparison = compareHeldNotesToEvent(notes, activeEvent, handMode);
      const diagnostic: PracticeAttemptDiagnostic = {
        source: diagnosticContext.source,
        triggeringMidiNote: diagnosticContext.triggeringMidiNote,
        heldNotesBefore: diagnosticContext.heldNotesBefore,
        heldNotesAfter: diagnosticContext.heldNotesAfter,
        startingIndex: current.currentIndex,
        resolvedIndex,
        resultingIndex: next.currentIndex,
        expectedEventId: activeEvent?.id,
        measureNumber: activeEvent?.measureNumber,
        expectedNotes: filterEventForHand(activeEvent, handMode)?.midiNotes ?? [],
        satisfied: comparison.satisfied,
        missingNotes: comparison.missingNotes,
        extraNotes: comparison.extraNotes,
        advanced,
        completed: next.isComplete,
      };
      setLastPracticeAttempt(diagnostic);
      console.debug("[practice-attempt]", diagnostic);
    }
  }, [handMode, parsedScore.events, practiceOptions, selectedRange]);

  useEffect(() => {
    setCarriedCompletedNotes((current) => current.filter((note) => combinedHeldNotes.includes(note)));
  }, [combinedHeldNotes]);

  useEffect(() => {
    if (midi.messageCounter === 0) {
      return;
    }

    const heldNotesBefore = previousHeldNotesRef.current;
    previousHeldNotesRef.current = combinedHeldNotes;
    if (midi.lastMessage?.kind !== "note-on" || midi.lastMessage.noteNumber === undefined) {
      return;
    }

    advanceWithNotes(combinedHeldNotes, {
      source: "midi",
      triggeringMidiNote: midi.lastMessage.noteNumber,
      heldNotesBefore,
      heldNotesAfter: combinedHeldNotes,
    });
  }, [advanceWithNotes, combinedHeldNotes, midi.lastMessage, midi.messageCounter]);

  const handleSelectionChange = useCallback((range: ScoreSelectionRange | undefined) => {
    setSelectedRange(range);
    const nextState = initialLearningState(firstPlayableIndex(parsedScore.events, handMode, range) ?? range?.startIndex ?? 0);
    learningStateRef.current = nextState;
    setLearningState(nextState);
    setSimulatedHeldNotes([]);
    setCarriedCompletedNotes([]);
  }, [handMode, parsedScore.events]);

  const simulateCurrentEvent = () => {
    if (!expectedEvent || expectedEvent.midiNotes.length === 0) {
      return;
    }
    setSimulatedHeldNotes(expectedEvent.midiNotes);
    advanceWithNotes(expectedEvent.midiNotes, {
      source: "simulation",
      heldNotesBefore: combinedHeldNotes,
      heldNotesAfter: expectedEvent.midiNotes,
    });
  };

  const clearSelection = () => {
    handleSelectionChange(undefined);
  };

  const resetProgress = () => {
    const nextState = initialLearningState(firstPlayableIndex(parsedScore.events, handMode, selectedRange) ?? selectedRange?.startIndex ?? 0);
    learningStateRef.current = nextState;
    setLearningState(nextState);
    setSimulatedHeldNotes([]);
    setCarriedCompletedNotes([]);
  };

  const handleHandModeChange = (nextHandMode: HandMode) => {
    setHandMode(nextHandMode);
    setSimulatedHeldNotes([]);
    setCarriedCompletedNotes([]);
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>Piano Learning PoC</h1>
          <p>MusicXML score to rendered notation to expected MIDI event to live-key recognition.</p>
        </div>
        <div className="browser-badges" aria-label="Browser capabilities">
          <span className={midi.secureContext ? "badge ok" : "badge warning"}>{midi.secureContext ? "Secure context" : "Insecure context"}</span>
          <span className={midi.supported ? "badge ok" : "badge warning"}>{midi.supported ? "Web MIDI available" : "Web MIDI unavailable"}</span>
        </div>
      </header>

      <section className="control-grid">
        <section className="panel">
          <h2>Score File</h2>
          <input type="file" accept=".mxl,.musicxml,.xml" onChange={handleFileChange} />
          {loadedScore ? <ScoreInfo score={loadedScore} eventCount={parsedScore.events.length} /> : <p className="muted">Select `Samples/Mad_world_Piano.mxl` or another MusicXML score from this computer.</p>}
          {scoreError ? <p className="error">{scoreError}</p> : null}
          {renderError ? <p className="error">Renderer: {renderError}</p> : null}
        </section>

        <section className="panel">
          <h2>MIDI Input</h2>
          <button type="button" onClick={midi.requestAccess} disabled={!midi.supported || midi.accessStatus === "requesting"}>
            {midi.accessStatus === "requesting" ? "Requesting..." : "Request MIDI Access"}
          </button>
          <p className="muted">Status: {midi.accessStatus}; permission: {midi.permissionStatus}</p>
          {midi.error ? <p className="error">{midi.error}</p> : null}
          <label>
            MIDI input
            <select value={midi.selectedInputId ?? ""} onChange={(event) => midi.selectInput(event.target.value)} disabled={midi.inputs.length === 0}>
              <option value="">No input selected</option>
              {midi.inputs.map((input) => (
                <option key={input.id} value={input.id}>{input.name}</option>
              ))}
            </select>
          </label>
          <div className="device-list">
            {midi.inputs.length === 0 ? <span className="muted">No MIDI inputs listed yet.</span> : midi.inputs.map((input) => (
              <span key={input.id} className="device-chip">{input.name} ({input.state ?? "unknown"})</span>
            ))}
          </div>
        </section>

        <section className="panel current-event-panel">
          <h2>Practice</h2>
          <div className="practice-controls">
            <label>
              Hand
              <select value={handMode} onChange={(event) => handleHandModeChange(event.target.value as HandMode)}>
                <option value="both">Both hands</option>
                <option value="right">Right hand</option>
                <option value="left">Left hand</option>
              </select>
            </label>
            <label>
              Run mode
              <select value={runMode} onChange={(event) => setRunMode(event.target.value as PracticeRunMode)}>
                <option value="once">Play once</option>
                <option value="loop">Loop selection</option>
              </select>
            </label>
          </div>
          <div className="feedback-controls">
            <label><input type="checkbox" checked={showCorrectNoteNames} onChange={(event) => setShowCorrectNoteNames(event.target.checked)} /> Correct note names</label>
            <label><input type="checkbox" checked={showWrongNoteNames} onChange={(event) => setShowWrongNoteNames(event.target.checked)} /> Wrong note names</label>
          </div>
          <SelectionSummary range={selectedRange} events={parsedScore.events} />
          {expectedEvent ? <ExpectedEvent event={expectedEvent} index={learningState.currentIndex} total={parsedScore.events.length} isComplete={learningState.isComplete} /> : <p className="muted">Load a score to begin.</p>}
          <div className="button-row">
            <button type="button" onClick={simulateCurrentEvent} disabled={!expectedEvent || expectedEvent.midiNotes.length === 0 || learningState.isComplete}>Simulate Current Event</button>
<button type="button" onClick={() => { setSimulatedHeldNotes([]); setCarriedCompletedNotes([]); }}>Release Simulated Notes</button>
            <button type="button" onClick={resetProgress}>Reset</button>
            <button type="button" onClick={clearSelection} disabled={!selectedRange}>Clear Selection</button>
          </div>
          <ComparisonSummary state={learningState} />
        </section>
      </section>

      <section className="score-layout">
        <div className="score-frame">
          {scoreStatus === "empty" ? <div className="score-placeholder">No score loaded.</div> : null}
          {scoreStatus === "loading" ? <div className="score-placeholder">Loading score...</div> : null}
          <ScoreRenderer
            xmlText={loadedScore?.xmlText}
            currentEventIndex={learningState.currentIndex}
            currentEvent={currentEvent}
            eventCount={parsedScore.events.length}
            events={parsedScore.events}
            selectedRange={selectedRange}
            feedbackMarkers={scoreFeedbackMarkers}
            showCorrectNoteNames={showCorrectNoteNames}
            showWrongNoteNames={showWrongNoteNames}
            onSelectedRangeChange={handleSelectionChange}
            onRenderStateChange={(next) => {
              setScoreStatus(next.status);
              setRenderError(next.error);
            }}
          />
        </div>
        <DebugPanel
          loadedScore={loadedScore}
          parsedScore={parsedScore}
          currentEvent={currentEvent}
          expectedEvent={expectedEvent}
          currentIndex={learningState.currentIndex}
          selectedRange={selectedRange}
          handMode={handMode}
          runMode={runMode}
          isComplete={learningState.isComplete}
          currentEventPlayable={currentEventPlayable}
          nextPlayableEventIndex={nextPlayableEventIndex}
          selectedMidiDevice={midi.inputs.find((input) => input.id === midi.selectedInputId)?.name}
          lastMessage={midi.lastMessage}
          heldNotes={combinedHeldNotes}
          sustainOn={midi.heldState.sustainOn}
          comparison={learningState.lastComparison}
          lastPracticeAttempt={lastPracticeAttempt}
          simulatedHeldNotes={simulatedHeldNotes}
          carriedCompletedNotes={carriedCompletedNotes}
        />
      </section>
    </main>
  );
}

function ScoreInfo({ score, eventCount }: { score: LoadedScore; eventCount: number }) {
  return (
    <dl className="info-list">
      <div><dt>File</dt><dd>{score.fileName}</dd></div>
      <div><dt>Type</dt><dd>{score.fileType}</dd></div>
      <div><dt>Title</dt><dd>{score.info.title ?? "Unknown"}</dd></div>
      <div><dt>Composer</dt><dd>{score.info.composer ?? "Unknown"}</dd></div>
      <div><dt>Parts</dt><dd>{score.info.partCount}</dd></div>
      <div><dt>Playable events</dt><dd>{eventCount}</dd></div>
    </dl>
  );
}

function SelectionSummary({ range, events }: { range?: ScoreSelectionRange; events: ScoreEvent[] }) {
  if (!range) {
    return <p className="muted">Drag across the score to select a practice range.</p>;
  }

  const start = events[range.startIndex];
  const end = events[range.endIndex];
  return (
    <p className="selection-summary">
      Selected events {range.startIndex + 1}-{range.endIndex + 1}
      {start && end ? `, measures ${start.measureNumber}-${end.measureNumber}` : ""}
    </p>
  );
}

function ExpectedEvent({ event, index, total, isComplete }: { event: ScoreEvent; index: number; total: number; isComplete: boolean }) {
  return (
    <div className="expected-event">
      <p className="event-count">Event {index + 1} of {total}{isComplete ? " complete" : ""}</p>
      <p className="note-set">{formatNotes(event.midiNotes)}</p>
      <p className="muted">Measure {event.measureNumber}; start {event.startQuarter.toFixed(2)} quarters; duration {event.durationQuarters.toFixed(2)} quarters.</p>
    </div>
  );
}

function ComparisonSummary({ state }: { state: LearningState }) {
  if (state.isComplete) {
    return <p className="comparison ok"><strong>Selected range complete</strong></p>;
  }

  if (!state.lastComparison) {
    return <p className="muted">Waiting for a note-on message or simulation.</p>;
  }

  return (
    <div className={state.lastComparison.satisfied ? "comparison ok" : "comparison warning"}>
      <strong>{state.lastComparison.satisfied ? "Correct event matched" : "Still waiting"}</strong>
      <span>Missing: {formatNotes(state.lastComparison.missingNotes)}</span>
      <span>Extra: {formatNotes(state.lastComparison.extraNotes)}</span>
    </div>
  );
}

function DebugPanel(props: {
  loadedScore: LoadedScore | null;
  parsedScore: ParsedScore;
  currentEvent?: ScoreEvent;
  expectedEvent?: ScoreEvent;
  currentIndex: number;
  selectedRange?: ScoreSelectionRange;
  handMode: HandMode;
  runMode: PracticeRunMode;
  isComplete: boolean;
  currentEventPlayable: boolean;
  nextPlayableEventIndex?: number;
  selectedMidiDevice?: string;
  lastMessage?: unknown;
  heldNotes: number[];
  sustainOn: boolean;
  comparison?: unknown;
  lastPracticeAttempt?: PracticeAttemptDiagnostic;
  simulatedHeldNotes: number[];
  carriedCompletedNotes: number[];
}) {
  return (
    <aside className="debug-panel">
      <h2>Debug</h2>
      <dl className="info-list compact">
        <div><dt>Loaded file</dt><dd>{props.loadedScore?.fileName ?? "None"}</dd></div>
        <div><dt>Selected MIDI</dt><dd>{props.selectedMidiDevice ?? "None"}</dd></div>
        <div><dt>Held notes</dt><dd>{formatNotes(props.heldNotes)}</dd></div>
        <div><dt>Simulated notes</dt><dd>{formatNotes(props.simulatedHeldNotes)}</dd></div>
        <div><dt>Ignored held</dt><dd>{formatNotes(props.carriedCompletedNotes)}</dd></div>
        <div><dt>Sustain</dt><dd>{props.sustainOn ? "On" : "Off"}</dd></div>
        <div><dt>Event index</dt><dd>{props.currentIndex}</dd></div>
        <div><dt>Hand mode</dt><dd>{props.handMode}</dd></div>
        <div><dt>Run mode</dt><dd>{props.runMode}</dd></div>
        <div><dt>Range</dt><dd>{props.selectedRange ? `${props.selectedRange.startIndex}-${props.selectedRange.endIndex}` : "Full score"}</dd></div>
        <div><dt>Complete</dt><dd>{props.isComplete ? "Yes" : "No"}</dd></div>
        <div><dt>Playable</dt><dd>{props.currentEventPlayable ? "Yes" : "No"}</dd></div>
        <div><dt>Next playable</dt><dd>{props.nextPlayableEventIndex ?? "None"}</dd></div>
        <div><dt>Parsed events</dt><dd>{props.parsedScore.events.length}</dd></div>
      </dl>
      <h3>Current Event</h3>
      <pre>{JSON.stringify(props.currentEvent ?? null, null, 2)}</pre>
      <h3>Expected Event</h3>
      <pre>{JSON.stringify(props.expectedEvent ?? null, null, 2)}</pre>
      <h3>Last MIDI Message</h3>
      <pre>{JSON.stringify(props.lastMessage ?? null, null, 2)}</pre>
      <h3>Last Comparison</h3>
      <pre>{JSON.stringify(props.comparison ?? null, null, 2)}</pre>
      <h3>Last Practice Attempt</h3>
      <pre>{JSON.stringify(props.lastPracticeAttempt ?? null, null, 2)}</pre>
      <h3>Parser Warnings</h3>
      {props.parsedScore.warnings.length === 0 ? <p className="muted">None</p> : <ul>{props.parsedScore.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul>}
      <h3>Import Diagnostics</h3>
      <pre>{JSON.stringify(importDiagnosticsForDebug(props.parsedScore), null, 2)}</pre>
    </aside>
  );
}

function importDiagnosticsForDebug(parsedScore: ParsedScore) {
  const diagnostics = parsedScore.diagnostics;
  if (!diagnostics) {
    return null;
  }

  return {
    firstPitchedMeasureByStaff: diagnostics.firstPitchedMeasureByStaff,
    firstMeasures: diagnostics.measures.slice(0, 16),
    systemBreaks: diagnostics.measures
      .filter((measure) => measure.printNewSystem || measure.printNewPage || measure.hasSystemLayout)
      .map((measure) => ({
        measureNumber: measure.measureNumber,
        printNewSystem: measure.printNewSystem,
        printNewPage: measure.printNewPage,
        hasSystemLayout: measure.hasSystemLayout,
        width: measure.width,
      })),
    firstParsedEvents: parsedScore.events.slice(0, 20).map((event, index) => ({
      index,
      id: event.id,
      measureNumber: event.measureNumber,
      startQuarter: event.startQuarter,
      durationQuarters: event.durationQuarters,
      midiNotes: event.midiNotes,
      noteNames: event.midiNotes.map(midiNoteToName),
      staffNumbers: event.staffNumbers,
      voiceNumbers: event.voiceNumbers,
      noteDetails: event.noteDetails.map((note) => ({
        midiNote: note.midiNote,
        noteName: midiNoteToName(note.midiNote),
        staffNumber: note.staffNumber,
        voiceNumber: note.voiceNumber,
        sourceNoteId: note.sourceNoteId,
      })),
    })),
  };
}
function formatNotes(notes: number[] | undefined): string {
  if (!notes || notes.length === 0) {
    return "None";
  }
  return notes.map((note) => `${note} ${midiNoteToName(note)}`).join(", ");
}

export default App;
