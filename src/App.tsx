import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScoreRenderer, type CompletedNoteFeedback } from "./components/ScoreRenderer";
import { PianoPanel } from "./components/PianoPanel";
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
import type { AppTheme, ScoreTheme } from "./theme/appearance";
import { useAppearanceSettings } from "./theme/useAppearanceSettings";
import { usePianoSettings } from "./piano/usePianoSettings";
import type { PianoSettings } from "./piano/piano";
import { usePlaySettings } from "./playback/usePlaySettings";
import { usePlaybackSession } from "./playback/usePlaybackSession";
import type { PlaySettings } from "./playback/settings";
import { shouldShowPerformanceResults } from "./playback/playback";
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

const COMPLETED_FEEDBACK_DURATION_MS = 450;

function App() {
  const midi = useMidiInput();
  const appearance = useAppearanceSettings();
  const piano = usePianoSettings();
  const play = usePlaySettings();
  const [loadedScore, setLoadedScore] = useState<LoadedScore | null>(null);
  const [parsedScore, setParsedScore] = useState<ParsedScore>({ events: [], tempoChanges: [], warnings: [] });
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
  const [completedFeedback, setCompletedFeedback] = useState<CompletedNoteFeedback | undefined>();
  const [midiSettingsOpen, setMidiSettingsOpen] = useState(false);
  const completedFeedbackTimerRef = useRef<number | undefined>(undefined);
  const completedFeedbackIdRef = useRef(0);
  const previousHeldNotesRef = useRef<number[]>([]);
  const processedMidiCounterRef = useRef(0);

  const playback = usePlaybackSession({ events: parsedScore.events, tempoChanges: parsedScore.tempoChanges, handMode, range: selectedRange, runMode, settings: play.settings });
  const { phase: playbackPhase, handleMidiNoteOn, start: startPlayback } = playback;

  const clearCompletedFeedback = useCallback(() => {
    if (completedFeedbackTimerRef.current !== undefined) {
      window.clearTimeout(completedFeedbackTimerRef.current);
      completedFeedbackTimerRef.current = undefined;
    }
    setCompletedFeedback(undefined);
  }, []);

  useEffect(() => clearCompletedFeedback, [clearCompletedFeedback]);

  useEffect(() => {
    if (!midiSettingsOpen) {
      return;
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMidiSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [midiSettingsOpen]);

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
  const playbackCursorIndex = playback.phase === "countdown" ? playback.plan?.events[0]?.eventIndex
    : playback.phase === "waiting-restart" ? playback.plan?.events.at(-1)?.eventIndex
      : playback.currentEventIndex;
  const displayedEventIndex = playback.phase === "idle" ? learningState.currentIndex : (playbackCursorIndex ?? learningState.currentIndex);
  const displayedEvent = playback.phase === "idle" ? expectedEvent : filterEventForHand(parsedScore.events[displayedEventIndex], handMode);

  const practiceOptions = useMemo(() => ({ handMode, runMode, range: selectedRange }), [handMode, runMode, selectedRange]);

  useEffect(() => {
    setLearningState((current) => {
      const nextIndex = resolvePracticeIndex(current.currentIndex, parsedScore.events, handMode, selectedRange);
      const next = nextIndex === current.currentIndex ? current : initialLearningState(nextIndex);
      learningStateRef.current = next;
      return next;
    });
    setSimulatedHeldNotes([]);
    clearCompletedFeedback();
  }, [clearCompletedFeedback, handMode, parsedScore.events, selectedRange]);

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
    playback.stop();
    playback.clearResults();
    clearCompletedFeedback();

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
      setParsedScore({ events: [], tempoChanges: [], warnings: [] });
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
      const completedEvent = filterEventForHand(activeEventBeforeAdvance, handMode);
      if (completedEvent) {
        const id = completedFeedbackIdRef.current + 1;
        completedFeedbackIdRef.current = id;
        if (completedFeedbackTimerRef.current !== undefined) {
          window.clearTimeout(completedFeedbackTimerRef.current);
        }
        setCompletedFeedback({
          id,
          eventIndex: resolvedIndexBeforeAdvance,
          event: completedEvent,
          markers: feedbackMarkersForHeldNotes(notes, activeEventBeforeAdvance, handMode).filter((marker) => marker.kind === "correct"),
        });
        completedFeedbackTimerRef.current = window.setTimeout(() => {
          setCompletedFeedback((currentFeedback) => currentFeedback?.id === id ? undefined : currentFeedback);
          completedFeedbackTimerRef.current = undefined;
        }, COMPLETED_FEEDBACK_DURATION_MS);
      }
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
    if (midi.messageCounter === 0 || processedMidiCounterRef.current === midi.messageCounter) {
      return;
    }
    processedMidiCounterRef.current = midi.messageCounter;

    const heldNotesBefore = previousHeldNotesRef.current;
    previousHeldNotesRef.current = combinedHeldNotes;
    if (midi.lastMessage?.kind !== "note-on" || midi.lastMessage.noteNumber === undefined) {
      return;
    }

    if (playbackPhase !== "idle") {
      handleMidiNoteOn(midi.lastMessage.noteNumber, midi.lastMessageAtMs ?? performance.now());
    } else {
      advanceWithNotes(combinedHeldNotes, {
        source: "midi",
        triggeringMidiNote: midi.lastMessage.noteNumber,
        heldNotesBefore,
        heldNotesAfter: combinedHeldNotes,
      });
    }
  }, [advanceWithNotes, combinedHeldNotes, handleMidiNoteOn, midi.lastMessage, midi.lastMessageAtMs, midi.messageCounter, playbackPhase]);

  useEffect(() => {
    if (playbackPhase !== "waiting-restart") return;
    const restart = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      startPlayback();
    };
    window.addEventListener("keydown", restart);
    return () => window.removeEventListener("keydown", restart);
  }, [playbackPhase, startPlayback]);

  const handleSelectionChange = useCallback((range: ScoreSelectionRange | undefined) => {
    setSelectedRange(range);
    const nextState = initialLearningState(firstPlayableIndex(parsedScore.events, handMode, range) ?? range?.startIndex ?? 0);
    learningStateRef.current = nextState;
    setLearningState(nextState);
    setSimulatedHeldNotes([]);
    setCarriedCompletedNotes([]);
    clearCompletedFeedback();
  }, [clearCompletedFeedback, handMode, parsedScore.events]);

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
    clearCompletedFeedback();
  };

  const handleHandModeChange = (nextHandMode: HandMode) => {
    setHandMode(nextHandMode);
    setSimulatedHeldNotes([]);
    setCarriedCompletedNotes([]);
    clearCompletedFeedback();
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>Piano Learning</h1>
        <button type="button" className="settings-button" aria-label="Open settings" title="Settings" onClick={() => setMidiSettingsOpen(true)}><SettingsIcon /></button>
      </header>

      <section className="score-layout">
        <div className="score-frame">
          {scoreStatus === "empty" ? <div className="score-placeholder">No score loaded.</div> : null}
          {scoreStatus === "loading" ? <div className="score-placeholder">Loading score...</div> : null}
          <ScoreRenderer
            xmlText={loadedScore?.xmlText}
            currentEventIndex={displayedEventIndex}
            currentEvent={displayedEvent}
            eventCount={parsedScore.events.length}
            events={parsedScore.events}
            selectedRange={selectedRange}
            feedbackMarkers={playback.phase === "idle" ? scoreFeedbackMarkers : []}
            completedFeedback={completedFeedback}
            performanceResults={shouldShowPerformanceResults(playback.phase, play.settings.showHitsWhilePlaying) ? playback.results : []}
            missedPerformanceNotes={playback.missedNotes}
            playbackPhase={playback.phase}
            countdownValue={playback.countdownValue}
            showStartCue={playback.showStartCue}
            canPlay={Boolean(playback.plan)}
            handMode={handMode}
            runMode={runMode}
            scoreTheme={appearance.scoreTheme}
            showCorrectNoteNames={showCorrectNoteNames}
            showWrongNoteNames={showWrongNoteNames}
            onSelectedRangeChange={handleSelectionChange}
            onHandModeChange={handleHandModeChange}
            onRunModeChange={setRunMode}
            onPlay={() => { setSimulatedHeldNotes([]); setCarriedCompletedNotes([]); clearCompletedFeedback(); playback.start(); }}
            onStop={playback.stop}
            onClearPerformance={playback.clearResults}
            onRenderStateChange={(next) => {
              setScoreStatus(next.status);
              setRenderError(next.error);
            }}
          />
        </div>
        <div className="right-sidebar">
          <section className="panel file-panel">
            <label className="file-picker-button">
              Open score
              <input type="file" accept=".mxl,.musicxml,.xml" onChange={handleFileChange} />
            </label>
            {scoreError ? <p className="error compact-message">{scoreError}</p> : null}
            {renderError ? <p className="error compact-message">Renderer: {renderError}</p> : null}
          </section>
          <section className="panel practice-panel">
            <h2>Practice</h2>
            <div className="feedback-controls">
              <label><input type="checkbox" checked={showCorrectNoteNames} onChange={(event) => setShowCorrectNoteNames(event.target.checked)} /> Correct names</label>
              <label><input type="checkbox" checked={showWrongNoteNames} onChange={(event) => setShowWrongNoteNames(event.target.checked)} /> Wrong names</label>
            </div>
            <SelectionSummary range={selectedRange} events={parsedScore.events} />
            {expectedEvent ? <ExpectedEvent event={expectedEvent} index={learningState.currentIndex} total={parsedScore.events.length} isComplete={learningState.isComplete} /> : <p className="muted">Load a score to begin.</p>}
            <div className="button-row compact-actions">
              <button type="button" onClick={simulateCurrentEvent} disabled={playback.phase !== "idle" || !expectedEvent || expectedEvent.midiNotes.length === 0 || learningState.isComplete}>Simulate</button>
              <button type="button" onClick={() => { setSimulatedHeldNotes([]); setCarriedCompletedNotes([]); }} disabled={playback.phase !== "idle"}>Release</button>
              <button type="button" onClick={resetProgress} disabled={playback.phase !== "idle"}>Reset</button>
              <button type="button" onClick={clearSelection} disabled={playback.phase !== "idle" || !selectedRange}>Clear range</button>
            </div>
            <ComparisonSummary state={learningState} />
          </section>
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
          playbackPhase={playback.phase}
          performanceResults={playback.results}
          />
        </div>
      </section>
      <PianoPanel
        expectedNotes={playback.phase === "playing" ? playback.expectedNotes : playback.phase === "idle" ? expectedEvent?.midiNotes ?? [] : []}
        heldNotes={combinedHeldNotes}
        ignoredCarriedNotes={playback.phase === "idle" ? carriedCompletedNotes : []}
        settings={piano.settings}
        onSettingsChange={piano.setSettings}
      />
      {midiSettingsOpen ? (
        <SettingsDialog
          midi={midi}
          appTheme={appearance.appTheme}
          scoreTheme={appearance.scoreTheme}
          pianoSettings={piano.settings}
          playSettings={play.settings}
          onAppThemeChange={appearance.setAppTheme}
          onScoreThemeChange={appearance.setScoreTheme}
          onPianoSettingsChange={piano.setSettings}
          onResetPianoColors={piano.resetColors}
          onPlaySettingsChange={play.setSettings}
          onClose={() => setMidiSettingsOpen(false)}
        />
      ) : null}
    </main>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M19.4 13a7.7 7.7 0 0 0 0-2l2.1-1.6-2-3.4-2.5 1a8 8 0 0 0-1.7-1L15 3.3h-4L10.6 6a8 8 0 0 0-1.7 1l-2.5-1-2 3.4L6.5 11a7.7 7.7 0 0 0 0 2l-2.1 1.6 2 3.4 2.5-1a8 8 0 0 0 1.7 1l.4 2.7h4l.4-2.7a8 8 0 0 0 1.7-1l2.5 1 2-3.4L19.4 13ZM13 15.5A3.5 3.5 0 1 1 13 8a3.5 3.5 0 0 1 0 7.5Z" />
    </svg>
  );
}

function SettingsDialog({
  midi,
  appTheme,
  scoreTheme,
  pianoSettings,
  playSettings,
  onAppThemeChange,
  onScoreThemeChange,
  onPianoSettingsChange,
  onResetPianoColors,
  onPlaySettingsChange,
  onClose,
}: {
  midi: ReturnType<typeof useMidiInput>;
  appTheme: AppTheme;
  scoreTheme: ScoreTheme;
  pianoSettings: PianoSettings;
  playSettings: PlaySettings;
  onAppThemeChange: (theme: AppTheme) => void;
  onScoreThemeChange: (theme: ScoreTheme) => void;
  onPianoSettingsChange: (update: Partial<PianoSettings>) => void;
  onResetPianoColors: () => void;
  onPlaySettingsChange: (update: Partial<PlaySettings>) => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header>
          <div>
            <h2 id="settings-title">Settings</h2>
            <p>Customise the workspace, score, and connected keyboard.</p>
          </div>
          <button type="button" className="dialog-close" aria-label="Close settings" onClick={onClose}>×</button>
        </header>
        <section className="settings-section" aria-labelledby="appearance-settings-title">
          <h3 id="appearance-settings-title">Appearance</h3>
          <span className="settings-label">Application</span>
          <div className="theme-choice-row" aria-label="Application theme">
            {(["system", "light", "dark"] as const).map((theme) => (
              <button key={theme} type="button" className={appTheme === theme ? "selected" : ""} aria-pressed={appTheme === theme} onClick={() => onAppThemeChange(theme)}>
                {theme[0].toUpperCase() + theme.slice(1)}
              </button>
            ))}
          </div>
          <span className="settings-label score-style-label">Score page</span>
          <div className="score-theme-choices" aria-label="Score page style">
            <button type="button" className={`score-theme-choice paper${scoreTheme === "paper" ? " selected" : ""}`} aria-pressed={scoreTheme === "paper"} onClick={() => onScoreThemeChange("paper")}>
              <span className="score-theme-swatch" aria-hidden="true">♪</span>
              <span><strong>Paper</strong><small>Warm traditional page</small></span>
            </button>
            <button type="button" className={`score-theme-choice night${scoreTheme === "night" ? " selected" : ""}`} aria-pressed={scoreTheme === "night"} onClick={() => onScoreThemeChange("night")}>
              <span className="score-theme-swatch" aria-hidden="true">♪</span>
              <span><strong>Night</strong><small>Dark page, pale notation</small></span>
            </button>
          </div>
        </section>
        <section className="settings-section" aria-labelledby="piano-settings-title">
          <h3 id="piano-settings-title">Piano</h3>
          <div className="piano-color-settings">
            <label>Expected <input type="color" value={pianoSettings.expectedColor} onChange={(event) => onPianoSettingsChange({ expectedColor: event.target.value })} /></label>
            <label>Correct <input type="color" value={pianoSettings.correctColor} onChange={(event) => onPianoSettingsChange({ correctColor: event.target.value })} /></label>
            <label>Wrong <input type="color" value={pianoSettings.wrongColor} onChange={(event) => onPianoSettingsChange({ wrongColor: event.target.value })} /></label>
          </div>
          <button type="button" className="secondary-button" onClick={onResetPianoColors}>Reset colours</button>
        </section>
        <section className="settings-section" aria-labelledby="play-settings-title">
          <h3 id="play-settings-title">Play</h3>
          <div className="play-settings-grid">
            <label>Countdown (seconds)<input type="number" min="0" max="10" step="1" value={playSettings.countdownSeconds} onChange={(event) => onPlaySettingsChange({ countdownSeconds: clampSetting(event.target.value, 0, 10) })} /></label>
            <label>Fallback tempo (BPM)<input type="number" min="30" max="300" step="1" value={playSettings.fallbackBpm} onChange={(event) => onPlaySettingsChange({ fallbackBpm: clampSetting(event.target.value, 30, 300) })} /></label>
            <label>Hit tolerance (ms)<input type="number" min="0" max="1000" step="25" value={playSettings.hitToleranceMs} onChange={(event) => onPlaySettingsChange({ hitToleranceMs: clampSetting(event.target.value, 0, 1000) })} /></label>
            <label className="play-checkbox-setting">Show hits while playing<input type="checkbox" checked={playSettings.showHitsWhilePlaying} onChange={(event) => onPlaySettingsChange({ showHitsWhilePlaying: event.target.checked })} /></label>
          </div>
          <p className="settings-hint">Embedded score tempo is used when available. The fallback applies before the first tempo marking or when none is supplied.</p>
        </section>
        <section className="settings-section midi-settings-section" aria-labelledby="midi-settings-title">
          <h3 id="midi-settings-title">MIDI input</h3>
        <div className="midi-status-row">
          <span className={`status-dot ${midi.accessStatus === "ready" ? "ready" : ""}`} aria-hidden="true" />
          <span>{midi.accessStatus === "ready" ? "MIDI connected" : midi.accessStatus === "requesting" ? "Connecting…" : "MIDI not connected"}</span>
        </div>
        {!midi.supported ? <p className="error">Web MIDI is not supported in this browser.</p> : null}
        {!midi.secureContext ? <p className="error">Web MIDI requires localhost or HTTPS.</p> : null}
        {midi.error ? <p className="error">{midi.error}</p> : null}
        {midi.accessStatus !== "ready" ? (
          <button type="button" onClick={midi.requestAccess} disabled={!midi.supported || !midi.secureContext || midi.accessStatus === "requesting"}>
            {midi.accessStatus === "requesting" ? "Connecting…" : "Connect MIDI"}
          </button>
        ) : null}
        <label className="settings-field">
          MIDI input
          <select value={midi.selectedInputId ?? ""} onChange={(event) => midi.selectInput(event.target.value)} disabled={midi.inputs.length === 0}>
            <option value="">No input selected</option>
            {midi.inputs.map((input) => <option key={input.id} value={input.id}>{input.name}</option>)}
          </select>
        </label>
        <p className="settings-hint">A previously authorised keyboard reconnects automatically when the browser retains MIDI permission.</p>
        </section>
      </section>
    </div>
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
  playbackPhase: string;
  performanceResults: unknown[];
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
        <div><dt>Tempo changes</dt><dd>{props.parsedScore.tempoChanges.length}</dd></div>
        <div><dt>Playback</dt><dd>{props.playbackPhase}</dd></div>
        <div><dt>Recorded notes</dt><dd>{props.performanceResults.length}</dd></div>
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

function clampSetting(value: string, min: number, max: number): number {
  return Math.min(Math.max(Math.round(Number(value) || min), min), max);
}

export default App;
