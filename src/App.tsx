import { useCallback, useEffect, useMemo, useState } from "react";
import { ScoreRenderer } from "./components/ScoreRenderer";
import {
  advanceWhenSatisfied,
  compareHeldNotesToEvent,
  filterEventForHand,
  initialLearningState,
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

function App() {
  const midi = useMidiInput();
  const [loadedScore, setLoadedScore] = useState<LoadedScore | null>(null);
  const [parsedScore, setParsedScore] = useState<ParsedScore>({ events: [], warnings: [] });
  const [learningState, setLearningState] = useState<LearningState>(initialLearningState());
  const [scoreError, setScoreError] = useState<string | undefined>();
  const [scoreStatus, setScoreStatus] = useState<"empty" | "loading" | "ready" | "error">("empty");
  const [renderError, setRenderError] = useState<string | undefined>();
  const [simulatedHeldNotes, setSimulatedHeldNotes] = useState<number[]>([]);
  const [selectedRange, setSelectedRange] = useState<ScoreSelectionRange | undefined>();
  const [handMode, setHandMode] = useState<HandMode>("both");
  const [runMode, setRunMode] = useState<PracticeRunMode>("once");

  const currentEvent = parsedScore.events[learningState.currentIndex];
  const expectedEvent = useMemo(() => filterEventForHand(currentEvent, handMode), [currentEvent, handMode]);
  const combinedHeldNotes = useMemo(
    () => Array.from(new Set([...midi.heldNotes, ...simulatedHeldNotes])).sort((a, b) => a - b),
    [midi.heldNotes, simulatedHeldNotes],
  );
  const liveComparison = useMemo(
    () => compareHeldNotesToEvent(combinedHeldNotes, currentEvent, handMode),
    [combinedHeldNotes, currentEvent, handMode],
  );

  const practiceOptions = useMemo(() => ({ handMode, runMode, range: selectedRange }), [handMode, runMode, selectedRange]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setScoreError(undefined);
    setRenderError(undefined);
    setScoreStatus("loading");
    setLearningState(initialLearningState());
    setSimulatedHeldNotes([]);
    setSelectedRange(undefined);

    try {
      const score = await loadScoreFile(file);
      const parsed = parseMusicXmlTimeline(score.xmlText);
      setLoadedScore(score);
      setParsedScore(parsed);
    } catch (error) {
      setLoadedScore(null);
      setParsedScore({ events: [], warnings: [] });
      setScoreStatus("error");
      setScoreError(error instanceof Error ? error.message : "Score loading failed.");
    }
  };

  const advanceWithNotes = useCallback((notes: number[]) => {
    setLearningState((current) => advanceWhenSatisfied(current, parsedScore.events, notes, practiceOptions));
  }, [parsedScore.events, practiceOptions]);

  useEffect(() => {
    if (midi.messageCounter === 0 || midi.lastMessage?.kind !== "note-on") {
      return;
    }
    advanceWithNotes(combinedHeldNotes);
  }, [advanceWithNotes, combinedHeldNotes, midi.lastMessage, midi.messageCounter]);

  const handleSelectionChange = useCallback((range: ScoreSelectionRange | undefined) => {
    setSelectedRange(range);
    setLearningState(initialLearningState(range?.startIndex ?? 0));
    setSimulatedHeldNotes([]);
  }, []);

  const simulateCurrentEvent = () => {
    if (!expectedEvent || expectedEvent.midiNotes.length === 0) {
      return;
    }
    setSimulatedHeldNotes(expectedEvent.midiNotes);
    advanceWithNotes(expectedEvent.midiNotes);
  };

  const clearSelection = () => {
    handleSelectionChange(undefined);
  };

  const resetProgress = () => {
    setLearningState(initialLearningState(selectedRange?.startIndex ?? 0));
    setSimulatedHeldNotes([]);
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
              <select value={handMode} onChange={(event) => setHandMode(event.target.value as HandMode)}>
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
          <SelectionSummary range={selectedRange} events={parsedScore.events} />
          {expectedEvent ? <ExpectedEvent event={expectedEvent} index={learningState.currentIndex} total={parsedScore.events.length} isComplete={learningState.isComplete} /> : <p className="muted">Load a score to begin.</p>}
          <div className="button-row">
            <button type="button" onClick={simulateCurrentEvent} disabled={!expectedEvent || expectedEvent.midiNotes.length === 0 || learningState.isComplete}>Simulate Current Event</button>
            <button type="button" onClick={() => setSimulatedHeldNotes([])}>Release Simulated Notes</button>
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
            selectedRange={selectedRange}
            wrongNotes={liveComparison.extraNotes}
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
          selectedMidiDevice={midi.inputs.find((input) => input.id === midi.selectedInputId)?.name}
          lastMessage={midi.lastMessage}
          heldNotes={combinedHeldNotes}
          sustainOn={midi.heldState.sustainOn}
          comparison={learningState.lastComparison}
          simulatedHeldNotes={simulatedHeldNotes}
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
  selectedMidiDevice?: string;
  lastMessage?: unknown;
  heldNotes: number[];
  sustainOn: boolean;
  comparison?: unknown;
  simulatedHeldNotes: number[];
}) {
  return (
    <aside className="debug-panel">
      <h2>Debug</h2>
      <dl className="info-list compact">
        <div><dt>Loaded file</dt><dd>{props.loadedScore?.fileName ?? "None"}</dd></div>
        <div><dt>Selected MIDI</dt><dd>{props.selectedMidiDevice ?? "None"}</dd></div>
        <div><dt>Held notes</dt><dd>{formatNotes(props.heldNotes)}</dd></div>
        <div><dt>Simulated notes</dt><dd>{formatNotes(props.simulatedHeldNotes)}</dd></div>
        <div><dt>Sustain</dt><dd>{props.sustainOn ? "On" : "Off"}</dd></div>
        <div><dt>Event index</dt><dd>{props.currentIndex}</dd></div>
        <div><dt>Hand mode</dt><dd>{props.handMode}</dd></div>
        <div><dt>Run mode</dt><dd>{props.runMode}</dd></div>
        <div><dt>Range</dt><dd>{props.selectedRange ? `${props.selectedRange.startIndex}-${props.selectedRange.endIndex}` : "Full score"}</dd></div>
        <div><dt>Complete</dt><dd>{props.isComplete ? "Yes" : "No"}</dd></div>
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
      <h3>Parser Warnings</h3>
      {props.parsedScore.warnings.length === 0 ? <p className="muted">None</p> : <ul>{props.parsedScore.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul>}
    </aside>
  );
}

function formatNotes(notes: number[] | undefined): string {
  if (!notes || notes.length === 0) {
    return "None";
  }
  return notes.map((note) => `${note} ${midiNoteToName(note)}`).join(", ");
}

export default App;
