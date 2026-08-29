import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScoreRenderer, type CompletedNoteFeedback } from "./components/ScoreRenderer";
import { PianoPanel } from "./components/PianoPanel";
import { PerformanceScoreBadge } from "./components/PerformanceScoreBadge";
import {
  advanceWhenSatisfied,
  advanceArpeggioProgress,
  arpeggioSequenceForEvent,
  compareHeldNotesToEvent,
  filterEventForHand,
  feedbackMarkersForHeldNotes,
  firstPlayableIndex,
  initialLearningState,
  isEventPlayableForHand,
  nextPlayableIndex,
  resolvePracticeIndex,
  type HandMode,
  type ArpeggioProgress,
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
import { pianoExpectationsForEvents, type PianoSettings } from "./piano/piano";
import { usePlaySettings } from "./playback/usePlaySettings";
import { usePlaybackSession } from "./playback/usePlaybackSession";
import type { PlayMode, PlaySettings } from "./playback/settings";
import { PlaybackFullscreenController } from "./playback/fullscreen";
import { shouldShowPerformanceResults } from "./playback/playback";
import { addPerformanceToHistory, calculatePerformanceScore, exercisePerformanceKey, type ExercisePerformanceHistory } from "./playback/performanceScore";
import { useAudioSettings } from "./audio/useAudioSettings";
import { useScoreAudio } from "./audio/useScoreAudio";
import { useWorkspaceLayoutSettings } from "./layout/useWorkspaceLayoutSettings";
import { isSidebarVisible, scoreMarginForLayout, SCORE_MARGIN_MAX, SCORE_MARGIN_MIN, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH, type WorkspaceLayoutSettings } from "./layout/workspace";
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
  const audioSettings = useAudioSettings();
  const workspace = useWorkspaceLayoutSettings();
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
  const processedMidiCounterRef = useRef(0);
  const arpeggioProgressRef = useRef<ArpeggioProgress | undefined>(undefined);
  const sidebarResizeRef = useRef<{ startX: number; startWidth: number } | undefined>(undefined);
  const [draftSidebarWidth, setDraftSidebarWidth] = useState<number | undefined>();
  const [sidebarHiddenForPlayback, setSidebarHiddenForPlayback] = useState(false);
  const [fullscreenNotice, setFullscreenNotice] = useState<string | undefined>();
  const [performanceHistory, setPerformanceHistory] = useState<Map<string, ExercisePerformanceHistory>>(() => new Map());
  const processedCompletionIdRef = useRef(0);
  const fullscreenControllerRef = useRef(new PlaybackFullscreenController());
  const fullscreenNoticeTimerRef = useRef<number | undefined>(undefined);

  const pauseOnNotes = play.settings.playMode === "pause-each-note";
  const untimedPractice = play.settings.playMode === "practice";
  const playback = usePlaybackSession({ events: parsedScore.events, tempoChanges: parsedScore.tempoChanges, handMode, range: selectedRange, runMode, pauseOnNotes, untimedPractice, settings: play.settings });
  const scoreAudio = useScoreAudio({ plan: playback.plan, phase: playback.phase, rollElapsedMs: playback.rollElapsedMs, audioStartElapsedMs: playback.audioStartElapsedMs, runId: playback.runId, pauseOnNotes, nextPendingGateOnsetMs: playback.nextPendingGateOnsetMs, settings: audioSettings.settings });
  const { phase: playbackPhase, handleHeldNotesChange, handleMidiNoteOn } = playback;
  const currentExerciseKey = useMemo(() => loadedScore ? exercisePerformanceKey(loadedScore.xmlText, loadedScore.fileName, selectedRange, handMode, play.settings.playMode) : undefined, [handMode, loadedScore, play.settings.playMode, selectedRange]);
  const currentPerformanceHistory = currentExerciseKey ? performanceHistory.get(currentExerciseKey) : undefined;

  useEffect(() => {
    const completed = playback.completedRun;
    if (!completed || !loadedScore || completed.id === processedCompletionIdRef.current) return;
    processedCompletionIdRef.current = completed.id;
    const score = calculatePerformanceScore(completed.plan, completed.results);
    const summary = { ...score, playMode: completed.playMode, handMode: completed.handMode, ...(completed.range ? { range: completed.range } : {}) };
    const key = exercisePerformanceKey(loadedScore.xmlText, loadedScore.fileName, completed.range, completed.handMode, completed.playMode);
    setPerformanceHistory((current) => {
      const next = new Map(current);
      next.set(key, addPerformanceToHistory(current.get(key), summary));
      return next;
    });
  }, [loadedScore, playback.completedRun]);
  const clearCompletedFeedback = useCallback(() => {
    if (completedFeedbackTimerRef.current !== undefined) {
      window.clearTimeout(completedFeedbackTimerRef.current);
      completedFeedbackTimerRef.current = undefined;
    }
    setCompletedFeedback(undefined);
  }, []);

  const showFullscreenNotice = useCallback(() => {
    if (fullscreenNoticeTimerRef.current !== undefined) window.clearTimeout(fullscreenNoticeTimerRef.current);
    setFullscreenNotice("Fullscreen was unavailable. Playback is continuing in the current window.");
    fullscreenNoticeTimerRef.current = window.setTimeout(() => {
      setFullscreenNotice(undefined);
      fullscreenNoticeTimerRef.current = undefined;
    }, 4500);
  }, []);

  const finishPlaybackPresentation = useCallback(() => {
    setSidebarHiddenForPlayback(false);
    void fullscreenControllerRef.current.exit(document);
  }, []);

  const togglePlaybackWithAudio = useCallback(() => {
    if (playback.phase === "countdown" || playback.phase === "playing" || playback.phase === "waiting-note") {
      playback.pause();
      return;
    }
    setSimulatedHeldNotes([]);
    setCarriedCompletedNotes([]);
    clearCompletedFeedback();
    if (playback.phase === "idle") {
      setSidebarHiddenForPlayback(true);
      setFullscreenNotice(undefined);
      if (play.settings.playFullscreen) {
        void fullscreenControllerRef.current.enter(document).then((result) => {
          if (result === "unavailable" || result === "failed") showFullscreenNotice();
        });
      }
    }
    const continuePlayback = playback.phase === "idle"
      ? () => playback.startAtEvent(learningState.currentIndex)
      : playback.togglePlayback;
    void scoreAudio.prepare().finally(continuePlayback);
  }, [clearCompletedFeedback, learningState.currentIndex, play.settings.playFullscreen, playback, scoreAudio, showFullscreenNotice]);

  useEffect(() => {
    if (playbackPhase === "idle") finishPlaybackPresentation();
  }, [finishPlaybackPresentation, playbackPhase]);

  useEffect(() => {
    const handleFullscreenChange = () => fullscreenControllerRef.current.handleFullscreenChange(document);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => clearCompletedFeedback, [clearCompletedFeedback]);
  useEffect(() => () => {
    if (fullscreenNoticeTimerRef.current !== undefined) window.clearTimeout(fullscreenNoticeTimerRef.current);
    void fullscreenControllerRef.current.exit(document);
  }, []);

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
  const combinedHeldNotes = useMemo(
    () => Array.from(new Set([...midi.heldNotes, ...simulatedHeldNotes])).sort((a, b) => a - b),
    [midi.heldNotes, simulatedHeldNotes],
  );
  const scoreFeedbackMarkers = useMemo(
    () => feedbackMarkersForHeldNotes(combinedHeldNotes, currentEvent, handMode, carriedCompletedNotes),
    [carriedCompletedNotes, combinedHeldNotes, currentEvent, handMode],
  );
  const gateFeedbackEvent = useMemo(() => {
    const gate = playback.gate;
    const gatedEvents = gate ? playback.plan?.events.filter((item) => gate.eventIndices.includes(item.eventIndex)).map((item) => item.event) ?? [] : [];
    const first = gatedEvents[0];
    if (!gate || !first) return undefined;
    const noteDetails = gatedEvents.flatMap((event) => event.noteDetails).filter((detail) => gate.expectedNotes.includes(detail.midiNote));
    return { ...first, id: `gate:${gate.onsetMs}`, midiNotes: gate.expectedNotes, noteDetails, staffNumbers: [...new Set(noteDetails.map((detail) => detail.staffNumber))], voiceNumbers: [...new Set(noteDetails.map((detail) => detail.voiceNumber))], sourceNoteIds: noteDetails.map((detail) => detail.sourceNoteId) };
  }, [playback.gate, playback.plan]);
  const gateFeedbackMarkers = useMemo(() => feedbackMarkersForHeldNotes(combinedHeldNotes, gateFeedbackEvent, handMode), [combinedHeldNotes, gateFeedbackEvent, handMode]);
  const waitingForGateNotes = useMemo(() => {
    const gate = playback.gate;
    if (!gate) return [];
    const unsatisfied = (notes: number[]) => notes.filter((note) => !gate.satisfiedNotes.includes(note));
    if (!gate.arpeggioNotes) return unsatisfied(gate.expectedNotes);
    const chordNotes = unsatisfied(gate.expectedNotes.filter((note) => !gate.arpeggioNotes?.includes(note)));
    return [...chordNotes, ...unsatisfied(gate.arpeggioNotes).slice(0, 1)];
  }, [playback.gate]);
  const playbackCursorIndex = playback.currentEventIndex;
  const displayedEventIndex = playback.phase === "idle" ? learningState.currentIndex : (playbackCursorIndex ?? learningState.currentIndex);
  const displayedEvent = playback.phase === "idle" ? expectedEvent : filterEventForHand(parsedScore.events[displayedEventIndex], handMode);
  const sidebarCurrentEvent = parsedScore.events[displayedEventIndex];
  const sidebarExpectedEvent = filterEventForHand(sidebarCurrentEvent, handMode);
  const sidebarEventPlayable = isEventPlayableForHand(sidebarCurrentEvent, handMode);
  const sidebarNextPlayableEventIndex = nextPlayableIndex(parsedScore.events, displayedEventIndex + 1, selectedRange?.endIndex ?? parsedScore.events.length - 1, handMode);
  const pianoExpectations = useMemo(() => {
    if (playback.phase === "idle") {
      return pianoExpectationsForEvents(expectedEvent ? [expectedEvent] : [], expectedEvent?.midiNotes ?? [], "active");
    }
    if (!playback.expectationStrength) return [];
    const expectedEvents = playback.plan?.events.filter((item) => playback.expectedEventIndices.includes(item.eventIndex)).map((item) => item.event) ?? [];
    return pianoExpectationsForEvents(expectedEvents, playback.expectedNotes, playback.expectationStrength);
  }, [expectedEvent, playback.expectationStrength, playback.expectedEventIndices, playback.expectedNotes, playback.phase, playback.plan]);

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
      receivedAtMs?: number;
      heldNotesBefore: number[];
      heldNotesAfter: number[];
    },
  ) => {
    const current = learningStateRef.current;
    const resolvedIndexBeforeAdvance = resolvePracticeIndex(current.currentIndex, parsedScore.events, handMode, selectedRange);
    const activeEventBeforeAdvance = parsedScore.events[resolvedIndexBeforeAdvance];
    const filteredEventBeforeAdvance = filterEventForHand(activeEventBeforeAdvance, handMode);
    const expectedNotesBeforeAdvance = filteredEventBeforeAdvance?.midiNotes ?? [];
    let notesForAdvancement = notes;
    if (filteredEventBeforeAdvance && arpeggioSequenceForEvent(filteredEventBeforeAdvance) && diagnosticContext?.triggeringMidiNote !== undefined) {
      const arpeggio = advanceArpeggioProgress(filteredEventBeforeAdvance, diagnosticContext.triggeringMidiNote, diagnosticContext.receivedAtMs ?? performance.now(), arpeggioProgressRef.current);
      arpeggioProgressRef.current = arpeggio.progress;
      notesForAdvancement = arpeggio.complete ? expectedNotesBeforeAdvance : [];
    }
    const next = advanceWhenSatisfied(current, parsedScore.events, notesForAdvancement, practiceOptions);
      learningStateRef.current = next;
      arpeggioProgressRef.current = undefined;
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

  useEffect(() => handleHeldNotesChange(combinedHeldNotes), [combinedHeldNotes, handleHeldNotesChange]);

  useEffect(() => {
    const pending = midi.messageEvents.filter((event) => event.id > processedMidiCounterRef.current);
    for (const event of pending) {
      processedMidiCounterRef.current = event.id;
      if (playbackPhase !== "idle") handleHeldNotesChange(event.heldNotesAfter);
      if (event.message.kind !== "note-on" || event.message.noteNumber === undefined) continue;
      if (playbackPhase !== "idle") {
        handleMidiNoteOn(event.message.noteNumber, event.receivedAtMs, event.heldNotesAfter, playbackPhase === "waiting-note");
      } else {
        advanceWithNotes(event.heldNotesAfter, {
        source: "midi",
          triggeringMidiNote: event.message.noteNumber,
          receivedAtMs: event.receivedAtMs,
          heldNotesBefore: event.heldNotesBefore,
          heldNotesAfter: event.heldNotesAfter,
        });
      }
    }
  }, [advanceWithNotes, handleHeldNotesChange, handleMidiNoteOn, midi.messageEvents, playbackPhase]);

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

  const resetAllProgress = useCallback(() => {
    finishPlaybackPresentation();
    playback.reset();
    const nextState = initialLearningState(firstPlayableIndex(parsedScore.events, handMode, selectedRange) ?? selectedRange?.startIndex ?? 0);
    learningStateRef.current = nextState;
    setLearningState(nextState);
    setSimulatedHeldNotes([]);
    setCarriedCompletedNotes([]);
    clearCompletedFeedback();
  }, [clearCompletedFeedback, finishPlaybackPresentation, handMode, parsedScore.events, playback, selectedRange]);

  const stopPlayback = useCallback(() => {
    const startIndex = playback.plan?.events[0]?.eventIndex ?? firstPlayableIndex(parsedScore.events, handMode, selectedRange) ?? selectedRange?.startIndex ?? 0;
    finishPlaybackPresentation();
    playback.stopAtPlanStart();
    const nextState = initialLearningState(startIndex);
    learningStateRef.current = nextState;
    setLearningState(nextState);
    setSimulatedHeldNotes([]);
    setCarriedCompletedNotes([]);
    clearCompletedFeedback();
  }, [clearCompletedFeedback, finishPlaybackPresentation, handMode, parsedScore.events, playback, selectedRange]);

  const handlePlayModeChange = useCallback((playMode: PlayMode) => {
    if (playMode === play.settings.playMode) return;
    resetAllProgress();
    play.setSettings({ playMode });
  }, [play, resetAllProgress]);

  const seekToEvent = useCallback((eventIndex: number) => {
    const playable = playback.plan?.events;
    const destination = playable?.find((item) => item.eventIndex === eventIndex)
      ?? (playable?.length ? playable.reduce((nearest, item) => Math.abs(item.eventIndex - eventIndex) < Math.abs(nearest.eventIndex - eventIndex) ? item : nearest) : undefined);
    if (!destination) return;
    if (playback.phase !== "idle") {
      playback.seekToEvent(destination.eventIndex);
    } else {
      const nextState = initialLearningState(destination.eventIndex);
      learningStateRef.current = nextState;
      setLearningState(nextState);
      playback.clearResults();
    }
    setSimulatedHeldNotes([]);
    setCarriedCompletedNotes([]);
    clearCompletedFeedback();
  }, [clearCompletedFeedback, playback]);

  useEffect(() => {
    const handleSpace = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || !playback.plan) return;
      togglePlaybackWithAudio();
    };
    window.addEventListener("keydown", handleSpace, { capture: true });
    return () => window.removeEventListener("keydown", handleSpace, { capture: true });
  }, [playback.plan, togglePlaybackWithAudio]);

  useEffect(() => {
    if (playback.phase !== "waiting-restart") return;
    const restartLoop = (event: KeyboardEvent) => {
      if (event.code === "Space" || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      playback.start();
    };
    window.addEventListener("keydown", restartLoop);
    return () => window.removeEventListener("keydown", restartLoop);
  }, [playback]);

  const handleHandModeChange = (nextHandMode: HandMode) => {
    setHandMode(nextHandMode);
    setSimulatedHeldNotes([]);
    setCarriedCompletedNotes([]);
    clearCompletedFeedback();
  };

  const beginSidebarResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    sidebarResizeRef.current = { startX: event.clientX, startWidth: draftSidebarWidth ?? workspace.settings.sidebarWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraftSidebarWidth(draftSidebarWidth ?? workspace.settings.sidebarWidth);
  };
  const resizeSidebar = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!sidebarResizeRef.current) return;
    const next = Math.round(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, sidebarResizeRef.current.startWidth + sidebarResizeRef.current.startX - event.clientX)));
    setDraftSidebarWidth(next);
  };
  const finishSidebarResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!sidebarResizeRef.current) return;
    const next = Math.round(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, sidebarResizeRef.current.startWidth + sidebarResizeRef.current.startX - event.clientX)));
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    sidebarResizeRef.current = undefined;
    setDraftSidebarWidth(undefined);
    workspace.setSettings({ sidebarWidth: next });
  };

  const sidebarWidth = draftSidebarWidth ?? workspace.settings.sidebarWidth;
  const sidebarVisible = isSidebarVisible(workspace.settings, sidebarHiddenForPlayback);
  const scoreMargin = scoreMarginForLayout(workspace.settings, sidebarVisible);
  const selectSidebarTabFromKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextTab = event.key === "ArrowLeft" || event.key === "Home" ? "practice" : "debug";
    workspace.setSettings({ sidebarTab: nextTab });
    document.getElementById(`sidebar-tab-${nextTab}`)?.focus();
  };

  return (
    <main className="app-shell" style={{ "--sidebar-width": `${sidebarWidth}px`, "--score-margin": `${scoreMargin}px` } as React.CSSProperties}>
      <header className="app-header">
        <div className="app-brand"><h1>Piano Learning</h1>{currentPerformanceHistory ? <PerformanceScoreBadge history={currentPerformanceHistory} /> : null}</div>
        {loadedScore ? <div className="score-heading" aria-live="polite">
          <strong title={loadedScore.info.title}>{loadedScore.info.title}</strong>
          {loadedScore.info.subtitle ? <span title={loadedScore.info.subtitle}>{loadedScore.info.subtitle}</span> : null}
        </div> : <div />}
        <div className="app-header-actions">
          <label className="settings-button header-open-score-button" aria-label="Open score" title="Open score">
            <OpenScoreIcon />
            <input type="file" accept=".mxl,.musicxml,.xml" onChange={handleFileChange} />
          </label>
          <button type="button" className="settings-button" aria-label="Open settings" title="Settings" onClick={() => setMidiSettingsOpen(true)}><SettingsIcon /></button>
        </div>
      </header>
      {fullscreenNotice ? <div className="playback-notice" role="status">{fullscreenNotice}</div> : null}

      <section className={`score-layout${sidebarVisible ? "" : " sidebar-collapsed"}`}>
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
            feedbackMarkers={playback.phase === "idle" ? scoreFeedbackMarkers : playback.phase === "waiting-note" ? gateFeedbackMarkers : []}
            completedFeedback={completedFeedback}
            performanceResults={shouldShowPerformanceResults(playback.phase, play.settings.showHitsWhilePlaying) ? playback.results : []}
            missedPerformanceNotes={playback.missedNotes}
            playbackPhase={playback.phase}
            countdownValue={playback.countdownValue}
            showStartCue={playback.showStartCue}
            canPlay={Boolean(playback.plan)}
            handMode={handMode}
            runMode={runMode}
            pauseOnNotes={pauseOnNotes}
            playMode={play.settings.playMode}
            showProgressWhilePlaying={play.settings.showHitsWhilePlaying}
            waitingForNotes={waitingForGateNotes}
            audioSettings={audioSettings.settings}
            audioError={scoreAudio.error}
            scoreTheme={appearance.scoreTheme}
            showCorrectNoteNames={showCorrectNoteNames}
            showWrongNoteNames={showWrongNoteNames}
            onSelectedRangeChange={handleSelectionChange}
            onEventSeek={seekToEvent}
            onHandModeChange={handleHandModeChange}
            onRunModeChange={setRunMode}
            onPlayModeChange={handlePlayModeChange}
            onShowProgressWhilePlayingChange={(showHitsWhilePlaying) => play.setSettings({ showHitsWhilePlaying })}
            onTogglePlayback={togglePlaybackWithAudio}
            onStop={stopPlayback}
            onReset={resetAllProgress}
            onClearPerformance={playback.clearResults}
            onAudioSettingsChange={audioSettings.setSettings}
            onRenderStateChange={(next) => {
              setScoreStatus(next.status);
              setRenderError(next.error);
            }}
          />
        </div>
        {sidebarVisible ? <aside className="right-sidebar" aria-label="Side panel">
          <button type="button" className="sidebar-resize-handle" aria-label="Resize side panel" title="Drag to resize side panel" onPointerDown={beginSidebarResize} onPointerMove={resizeSidebar} onPointerUp={finishSidebarResize} onPointerCancel={finishSidebarResize}><span /></button>
          <header className="sidebar-header">
            <section className="file-panel">
            <div className="file-panel-actions">
              <button type="button" className="sidebar-collapse-button" aria-label="Collapse side panel" title="Collapse side panel" onClick={() => workspace.setSettings({ sidebarOpen: false })}><SidebarCollapseIcon /></button>
            </div>
            {scoreError ? <p className="error compact-message">{scoreError}</p> : null}
            {renderError ? <p className="error compact-message">Renderer: {renderError}</p> : null}
            </section>
            <div className="sidebar-tabs" role="tablist" aria-label="Workspace">
              <button type="button" id="sidebar-tab-practice" role="tab" aria-selected={workspace.settings.sidebarTab === "practice"} aria-controls="sidebar-panel-practice" tabIndex={workspace.settings.sidebarTab === "practice" ? 0 : -1} onClick={() => workspace.setSettings({ sidebarTab: "practice" })} onKeyDown={selectSidebarTabFromKey}>Practice</button>
              <button type="button" id="sidebar-tab-debug" role="tab" aria-selected={workspace.settings.sidebarTab === "debug"} aria-controls="sidebar-panel-debug" tabIndex={workspace.settings.sidebarTab === "debug" ? 0 : -1} onClick={() => workspace.setSettings({ sidebarTab: "debug" })} onKeyDown={selectSidebarTabFromKey}>Debug</button>
            </div>
          </header>
          <div className="sidebar-tab-content">
          {workspace.settings.sidebarTab === "practice" ? <section id="sidebar-panel-practice" className="practice-panel" role="tabpanel" aria-labelledby="sidebar-tab-practice">
            <div className="feedback-controls">
              <label><input type="checkbox" checked={showCorrectNoteNames} onChange={(event) => setShowCorrectNoteNames(event.target.checked)} /> Correct names</label>
              <label><input type="checkbox" checked={showWrongNoteNames} onChange={(event) => setShowWrongNoteNames(event.target.checked)} /> Wrong names</label>
            </div>
            <SelectionSummary range={selectedRange} events={parsedScore.events} />
            {sidebarExpectedEvent ? <ExpectedEvent event={sidebarExpectedEvent} index={displayedEventIndex} total={parsedScore.events.length} isComplete={playback.phase === "idle" && learningState.isComplete} /> : <p className="muted">Load a score to begin.</p>}
            <div className="button-row compact-actions">
              <button type="button" onClick={simulateCurrentEvent} disabled={playback.phase !== "idle" || !expectedEvent || expectedEvent.midiNotes.length === 0 || learningState.isComplete}>Simulate</button>
              <button type="button" onClick={() => { setSimulatedHeldNotes([]); setCarriedCompletedNotes([]); }} disabled={playback.phase !== "idle"}>Release</button>
              <button type="button" onClick={clearSelection} disabled={playback.phase !== "idle" || !selectedRange}>Clear range</button>
            </div>
            <ComparisonSummary state={learningState} />
          </section> : <div id="sidebar-panel-debug" role="tabpanel" aria-labelledby="sidebar-tab-debug"><DebugPanel
          loadedScore={loadedScore}
          parsedScore={parsedScore}
          currentEvent={sidebarCurrentEvent}
          expectedEvent={sidebarExpectedEvent}
          currentIndex={displayedEventIndex}
          selectedRange={selectedRange}
          handMode={handMode}
          runMode={runMode}
          isComplete={learningState.isComplete}
          currentEventPlayable={sidebarEventPlayable}
          nextPlayableEventIndex={sidebarNextPlayableEventIndex}
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
          /></div>}
          </div>
        </aside> : null}
      </section>
      {!sidebarVisible ? <button type="button" className="sidebar-restore-button" aria-label="Restore side panel" title="Restore side panel" onClick={() => { setSidebarHiddenForPlayback(false); workspace.setSettings({ sidebarOpen: true }); }}><SidebarRestoreIcon /><span>Panel</span></button> : null}
      <PianoPanel
        expectations={pianoExpectations}
        heldNotes={combinedHeldNotes}
        ignoredCarriedNotes={playback.phase === "idle" ? carriedCompletedNotes : []}
        settings={piano.settings}
        playbackPlan={playback.plan}
        playbackPhase={playback.phase}
        rollElapsedMs={playback.rollElapsedMs}
        playbackElapsedMs={playback.elapsedMs}
        displayedEventIndex={displayedEventIndex}
        canPlay={Boolean(playback.plan)}
        runMode={runMode}
        pauseOnNotes={pauseOnNotes}
        playMode={play.settings.playMode}
        showProgressWhilePlaying={play.settings.showHitsWhilePlaying}
        canClearPerformance={playback.results.length > 0 || playback.missedNotes.length > 0}
        audioSettings={audioSettings.settings}
        audioError={scoreAudio.error}
        onSettingsChange={piano.setSettings}
        onTogglePlayback={togglePlaybackWithAudio}
        onStop={stopPlayback}
        onReset={resetAllProgress}
        onSeek={seekToEvent}
        onRunModeChange={setRunMode}
        onPlayModeChange={handlePlayModeChange}
        onShowProgressWhilePlayingChange={(showHitsWhilePlaying) => play.setSettings({ showHitsWhilePlaying })}
        onClearPerformance={playback.clearResults}
        onAudioSettingsChange={audioSettings.setSettings}
      />
      {midiSettingsOpen ? (
        <SettingsDialog
          midi={midi}
          appTheme={appearance.appTheme}
          scoreTheme={appearance.scoreTheme}
          pianoSettings={piano.settings}
          playSettings={play.settings}
          workspaceSettings={workspace.settings}
          onAppThemeChange={appearance.setAppTheme}
          onScoreThemeChange={appearance.setScoreTheme}
          onPianoSettingsChange={piano.setSettings}
          onResetPianoColors={piano.resetColors}
          onPlaySettingsChange={play.setSettings}
          onWorkspaceSettingsChange={workspace.setSettings}
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

function OpenScoreIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 5.5A2.5 2.5 0 0 1 5.5 3H10l2 2h6.5A2.5 2.5 0 0 1 21 7.5V9h-2V7.5a.5.5 0 0 0-.5-.5h-7.33l-2-2H5.5a.5.5 0 0 0-.5.5v13a.5.5 0 0 0 .5.5H11v2H5.5A2.5 2.5 0 0 1 3 18.5v-13Zm13 5h2v3h3v2h-3v3h-2v-3h-3v-2h3v-3Z" /></svg>;
}

function SidebarCollapseIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15.5 5-7 7 7 7 1.5-1.5-5.5-5.5L17 6.5 15.5 5Z" /></svg>; }
function SidebarRestoreIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8.5 5 7 7-7 7L7 17.5l5.5-5.5L7 6.5 8.5 5Z" /></svg>; }

function SettingsDialog({
  midi,
  appTheme,
  scoreTheme,
  pianoSettings,
  playSettings,
  workspaceSettings,
  onAppThemeChange,
  onScoreThemeChange,
  onPianoSettingsChange,
  onResetPianoColors,
  onPlaySettingsChange,
  onWorkspaceSettingsChange,
  onClose,
}: {
  midi: ReturnType<typeof useMidiInput>;
  appTheme: AppTheme;
  scoreTheme: ScoreTheme;
  pianoSettings: PianoSettings;
  playSettings: PlaySettings;
  workspaceSettings: WorkspaceLayoutSettings;
  onAppThemeChange: (theme: AppTheme) => void;
  onScoreThemeChange: (theme: ScoreTheme) => void;
  onPianoSettingsChange: (update: Partial<PianoSettings>) => void;
  onResetPianoColors: () => void;
  onPlaySettingsChange: (update: Partial<PlaySettings>) => void;
  onWorkspaceSettingsChange: (update: Partial<WorkspaceLayoutSettings>) => void;
  onClose: () => void;
}) {
  type SettingsTab = "general" | "appearance" | "piano" | "play";
  const tabs: { id: SettingsTab; label: string; description: string }[] = [
    { id: "general", label: "General", description: "Devices and essentials" },
    { id: "appearance", label: "Appearance", description: "Themes and score layout" },
    { id: "piano", label: "Piano", description: "Keyboard feedback" },
    { id: "play", label: "Play", description: "Timing and focus" },
  ];
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    setActiveTab(tabs[nextIndex].id);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
  };
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
        <div className="settings-workspace">
        <nav className="settings-tabs" role="tablist" aria-label="Settings categories">
          {tabs.map((tab, index) => <button key={tab.id} id={`settings-tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`settings-panel-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1} className={activeTab === tab.id ? "selected" : ""} onClick={() => setActiveTab(tab.id)} onKeyDown={(event) => handleTabKeyDown(event, index)}><strong>{tab.label}</strong><small>{tab.description}</small></button>)}
        </nav>
        <div className="settings-tab-content">
        {activeTab === "appearance" ? <section id="settings-panel-appearance" className="settings-section" role="tabpanel" aria-labelledby="settings-tab-appearance">
          <h3 id="appearance-settings-title">Appearance</h3>
          <div className="settings-card-grid"><div className="settings-card">
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
          </div><div className="settings-card"><span className="settings-label">Score width</span><p className="settings-card-copy">Use independent paper spacing for an open panel and focused play.</p>
          <label className="score-margin-setting">Panel open margins <strong>{workspaceSettings.panelOpenScoreMargin}px</strong><input aria-label="Score paper margins with panel open" type="range" min={SCORE_MARGIN_MIN} max={SCORE_MARGIN_MAX} step="1" value={workspaceSettings.panelOpenScoreMargin} onChange={(event) => onWorkspaceSettingsChange({ panelOpenScoreMargin: Number(event.target.value) })} /></label>
          <label className="score-margin-setting">Panel docked margins <strong>{workspaceSettings.panelDockedScoreMargin}px</strong><input aria-label="Score paper margins with panel docked" type="range" min={SCORE_MARGIN_MIN} max={SCORE_MARGIN_MAX} step="1" value={workspaceSettings.panelDockedScoreMargin} onChange={(event) => onWorkspaceSettingsChange({ panelDockedScoreMargin: Number(event.target.value) })} /></label>
          </div></div>
        </section> : null}
        {activeTab === "piano" ? <section id="settings-panel-piano" className="settings-section" role="tabpanel" aria-labelledby="settings-tab-piano">
          <h3 id="piano-settings-title">Piano</h3>
          <div className="settings-card">
          <div className="piano-color-settings">
            <label>Expected <input type="color" value={pianoSettings.expectedColor} onChange={(event) => onPianoSettingsChange({ expectedColor: event.target.value })} /></label>
            <label>Correct <input type="color" value={pianoSettings.correctColor} onChange={(event) => onPianoSettingsChange({ correctColor: event.target.value })} /></label>
            <label>Wrong <input type="color" value={pianoSettings.wrongColor} onChange={(event) => onPianoSettingsChange({ wrongColor: event.target.value })} /></label>
          </div>
          <h4>Play expectations</h4>
          <div className="piano-color-settings">
            <label>Right hand <input type="color" value={pianoSettings.playRightColor} onChange={(event) => onPianoSettingsChange({ playRightColor: event.target.value })} /></label>
            <label>Left hand <input type="color" value={pianoSettings.playLeftColor} onChange={(event) => onPianoSettingsChange({ playLeftColor: event.target.value })} /></label>
          </div>
          <h4>Synthesia</h4>
          <div className="piano-color-settings">
            <label>Right hand <input type="color" value={pianoSettings.synthesiaRightColor} onChange={(event) => onPianoSettingsChange({ synthesiaRightColor: event.target.value })} /></label>
            <label>Left hand <input type="color" value={pianoSettings.synthesiaLeftColor} onChange={(event) => onPianoSettingsChange({ synthesiaLeftColor: event.target.value })} /></label>
          </div>
          <button type="button" className="secondary-button" onClick={onResetPianoColors}>Reset colours</button>
          </div>
        </section> : null}
        {activeTab === "play" ? <section id="settings-panel-play" className="settings-section" role="tabpanel" aria-labelledby="settings-tab-play">
          <h3 id="play-settings-title">Play</h3>
          <div className="settings-card">
          <div className="play-settings-grid">
            <label>Countdown (seconds)<input type="number" min="0" max="10" step="1" value={playSettings.countdownSeconds} onChange={(event) => onPlaySettingsChange({ countdownSeconds: clampSetting(event.target.value, 0, 10) })} /></label>
            <label>Fallback tempo (BPM)<input type="number" min="30" max="300" step="1" value={playSettings.fallbackBpm} onChange={(event) => onPlaySettingsChange({ fallbackBpm: clampSetting(event.target.value, 30, 300) })} /></label>
            <label>Hit tolerance (ms)<input type="number" min="0" max="1000" step="25" value={playSettings.hitToleranceMs} onChange={(event) => onPlaySettingsChange({ hitToleranceMs: clampSetting(event.target.value, 0, 1000) })} /></label>
            <label className="play-checkbox-setting">Play fullscreen<input type="checkbox" checked={playSettings.playFullscreen} onChange={(event) => onPlaySettingsChange({ playFullscreen: event.target.checked })} /></label>
          </div>
          <p className="settings-hint">Embedded score tempo is used when available. The fallback applies before the first tempo marking or when none is supplied. Play always hides the side panel; fullscreen uses the browser display and Escape leaves it without stopping playback.</p>
          </div>
        </section> : null}
        {activeTab === "general" ? <section id="settings-panel-general" className="settings-section midi-settings-section" role="tabpanel" aria-labelledby="settings-tab-general">
          <h3 id="midi-settings-title">MIDI input</h3>
        <div className="settings-card">
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
        </div>
        </section> : null}
        </div>
        </div>
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
  const arpeggio = arpeggioSequenceForEvent(event);
  const chordNotes = arpeggio ? event.midiNotes.filter((note) => !arpeggio.includes(note)) : [];
  const arpeggioLabel = arpeggio ? `Arpeggio ${event.noteDetails.find((note) => note.arpeggio)?.arpeggio?.direction === "down" ? "↓" : "↑"}: ${formatNotes(arpeggio)}` : undefined;
  return (
    <div className="expected-event">
      <p className="event-count">Event {index + 1} of {total}{isComplete ? " complete" : ""}</p>
      <p className="note-set">{arpeggioLabel ? `${chordNotes.length ? `Chord ${formatNotes(chordNotes)} + ` : ""}${arpeggioLabel}` : formatNotes(event.midiNotes)}</p>
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
    <div className="debug-panel">
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
    </div>
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
