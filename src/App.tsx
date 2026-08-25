import { useCallback, useEffect, useMemo, useState } from "react";
import { ScoreRenderer } from "./components/ScoreRenderer";
import { advanceWhenSatisfied, initialLearningState, type LearningState } from "./learning/matcher";
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

  const currentEvent = parsedScore.events[learningState.currentIndex];
  const combinedHeldNotes = useMemo(
    () => Array.from(new Set([...midi.heldNotes, ...simulatedHeldNotes])).sort((a, b) => a - b),
    [midi.heldNotes, simulatedHeldNotes],
  );

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
    setLearningState((current) => advanceWhenSatisfied(current, parsedScore.events, notes));
  }, [parsedScore.events]);

  useEffect(() => {
    if (midi.messageCounter === 0 || midi.lastMessage?.kind !== "note-on") {
      return;
    }
    advanceWithNotes(combinedHeldNotes);
  }, [advanceWithNotes, combinedHeldNotes, midi.lastMessage, midi.messageCounter]);

  const simulateCurrentEvent = () => {
    if (!currentEvent) {
      return;
    }
    setSimulatedHeldNotes(currentEvent.midiNotes);
    advanceWithNotes(currentEvent.midiNotes);
  };

  const resetProgress = () => {
    setLearningState(initialLearningState());
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
          <h2>Wait For Correct Note</h2>
          {currentEvent ? <ExpectedEvent event={currentEvent} index={learningState.currentIndex} total={parsedScore.events.length} /> : <p className="muted">Load a score to begin.</p>}
          <div className="button-row">
            <button type="button" onClick={simulateCurrentEvent} disabled={!currentEvent}>Simulate Current Event</button>
            <button type="button" onClick={() => setSimulatedHeldNotes([])}>Release Simulated Notes</button>
            <button type="button" onClick={resetProgress}>Reset</button>
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
          currentIndex={learningState.currentIndex}
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

function ExpectedEvent({ event, index, total }: { event: ScoreEvent; index: number; total: number }) {
  return (
    <div className="expected-event">
      <p className="event-count">Event {index + 1} of {total}</p>
      <p className="note-set">{formatNotes(event.midiNotes)}</p>
      <p className="muted">Measure {event.measureNumber}; start {event.startQuarter.toFixed(2)} quarters; duration {event.durationQuarters.toFixed(2)} quarters.</p>
    </div>
  );
}

function ComparisonSummary({ state }: { state: LearningState }) {
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
  currentIndex: number;
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
        <div><dt>Parsed events</dt><dd>{props.parsedScore.events.length}</dd></div>
      </dl>
      <h3>Current Event</h3>
      <pre>{JSON.stringify(props.currentEvent ?? null, null, 2)}</pre>
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
