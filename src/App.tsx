import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScoreRenderer, type CompletedNoteFeedback } from "./components/ScoreRenderer";
import { PianoPanel } from "./components/PianoPanel";
import type { LearningTab } from "./components/LearningPanel";
import { LearningWorkspace } from "./components/LearningWorkspace";
import { GuidedPlannerCard } from "./components/GuidedPlannerCard";
import { GuidedSessionCard } from "./components/GuidedSessionCard";
import { SightReadingCard } from "./components/SightReadingCard";
import { PerformanceScoreBadge } from "./components/PerformanceScoreBadge";
import { ScoreTimeDisplay } from "./components/ScoreTimeDisplay";
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
import type { LoadedScore, ParsedScore, ScoreEvent, ScoreNoteInspection } from "./music/scoreTypes";
import type { LearningItem } from "./learning/catalog";
import { generateLearningScore } from "./learning/generatedScore";
import { useMidiInput } from "./hooks/useMidiInput";
import { resolvedScoreMarkerColor, type AppTheme, type ScoreMarkerSettings, type ScoreTheme } from "./theme/appearance";
import { useAppearanceSettings } from "./theme/useAppearanceSettings";
import { usePianoSettings } from "./piano/usePianoSettings";
import { pianoExpectationsForEvents, pianoFingeringsForEvents, type PianoSettings } from "./piano/piano";
import { usePlaySettings } from "./playback/usePlaySettings";
import { usePlaybackSession } from "./playback/usePlaybackSession";
import type { PlayMode, PlaySettings } from "./playback/settings";
import { PlaybackFullscreenController } from "./playback/fullscreen";
import { createPlaybackPlan, shouldShowPerformanceResults } from "./playback/playback";
import { addPerformanceToHistory, exercisePerformanceKey, paceGraceMs, type ExercisePerformanceHistory } from "./playback/performanceScore";
import { buildAttemptSummary, localScoreVersionId } from "./platform/attemptSummary";
import { useAudioSettings } from "./audio/useAudioSettings";
import { useScoreAudio } from "./audio/useScoreAudio";
import { useMetronome } from "./audio/metronome";
import { effectiveTempoAtQuarter } from "./playback/playback";
import { useWorkspaceLayoutSettings } from "./layout/useWorkspaceLayoutSettings";
import { createGuidedPiecePlan, finishGuidedPlanning, increaseGuidedTempo, mergeGuidedSections, moveGuidedBoundary, recordGuidedTempoRun, setActiveGuidedSection, setGuidedSectionProgress, splitGuidedSection, type GuidedPiecePlan } from "./learning/guidedPractice";
import { guidedStepsForSection, type GuidedSessionStep } from "./learning/guidedSession";
import { collectGuidedAttemptEvidence, diagnoseGuidedAttempts, guidedDiagnosisRange, type GuidedAttemptEvidence, type GuidedDiagnosis } from "./learning/guidedDiagnosis";
import { TEMPO_BUILD_UP_PRESETS, type LearningSettings, type TempoBuildUpPreset } from "./learning/settings";
import { useLearningSettings } from "./learning/useLearningSettings";
import { generateSightReadingExercise, type SightReadingOptions } from "./learning/sightReading";
import { calculateSightReadingAssessment, type SightReadingAssessment } from "./learning/sightReadingAssessment";
import { isSidebarVisible, scoreMarginForLayout, SCORE_MARGIN_MAX, SCORE_MARGIN_MIN, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH, type WorkspaceLayoutSettings } from "./layout/workspace";
import { initialPianoShortcutState, resolvePianoShortcut, shortcutConflicts, type PianoShortcutBindingKey, type PianoShortcutCommand, type PianoShortcutSettings, type PianoShortcutSettingsUpdate, type PianoShortcutState } from "./midi/pianoShortcuts";
import { usePianoShortcutSettings } from "./midi/usePianoShortcutSettings";
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

interface GuidedPracticeDetour {
  sectionId: string;
  measureNumber: number;
  handMode: HandMode;
  originalRange: ScoreSelectionRange;
  originalHandMode: HandMode;
  originalPlayMode: PlayMode;
  originalTempoPercent: number;
  originalRunMode: PracticeRunMode;
}

interface SightReadingSession { options: SightReadingOptions; phase: "prepare" | "attempt" | "result" | "review"; assessment?: SightReadingAssessment }

const COMPLETED_FEEDBACK_DURATION_MS = 450;
const SIMULATION_PULSE_DURATION_MS = 180;

function nextPaint(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function waitForScoreLayout(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 250));
}

function App() {
  const midi = useMidiInput();
  const appearance = useAppearanceSettings();
  const piano = usePianoSettings();
  const play = usePlaySettings();
  const audioSettings = useAudioSettings();
  const workspace = useWorkspaceLayoutSettings();
  const pianoShortcuts = usePianoShortcutSettings();
  const learningSettings = useLearningSettings();
  const [loadedScore, setLoadedScore] = useState<LoadedScore | null>(null);
  const [parsedScore, setParsedScore] = useState<ParsedScore>({ events: [], restEvents: [], tempoChanges: [], measureTimings: [], warnings: [] });
  const [tempoPercent, setTempoPercent] = useState(100);
  const [learningState, setLearningState] = useState<LearningState>(initialLearningState());
  const learningStateRef = useRef<LearningState>(learningState);
  const [scoreError, setScoreError] = useState<string | undefined>();
  const [scoreStatus, setScoreStatus] = useState<"empty" | "loading" | "ready" | "error">("empty");
  const [renderError, setRenderError] = useState<string | undefined>();
  const [seeNoteEnabled, setSeeNoteEnabled] = useState(false);
  const [learningOpen, setLearningOpen] = useState(false);
  const [learningTab, setLearningTab] = useState<LearningTab>("chords");
  const [guidedPlan, setGuidedPlan] = useState<GuidedPiecePlan | undefined>();
  const [guidedPlanning, setGuidedPlanning] = useState(false);
  const [guidedSessionActive, setGuidedSessionActive] = useState(false);
  const [guidedStep, setGuidedStep] = useState<GuidedSessionStep>("listen");
  const [guidedStepComplete, setGuidedStepComplete] = useState(false);
  const [guidedAttemptEvidence, setGuidedAttemptEvidence] = useState<GuidedAttemptEvidence[]>([]);
  const [guidedStepScores, setGuidedStepScores] = useState<Record<string, number>>({});
  const [guidedDetour, setGuidedDetour] = useState<GuidedPracticeDetour | undefined>();
  const [guidedDetourComplete, setGuidedDetourComplete] = useState(false);
  const [guidedStageToStart, setGuidedStageToStart] = useState<HandMode | undefined>();
  const [sightReadingSession, setSightReadingSession] = useState<SightReadingSession | undefined>();
  const [addingGuidedBoundary, setAddingGuidedBoundary] = useState(false);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(44);
  const [headerBottom, setHeaderBottom] = useState(67);
  const [inspectedNote, setInspectedNote] = useState<ScoreNoteInspection | undefined>();
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
  const [shortcutCaptureTarget, setShortcutCaptureTarget] = useState<PianoShortcutBindingKey | undefined>();
  const [shortcutNotice, setShortcutNotice] = useState<string | undefined>();
  const [shortcutConsumedNotes, setShortcutConsumedNotes] = useState<number[]>([]);
  const completedFeedbackTimerRef = useRef<number | undefined>(undefined);
  const completedFeedbackIdRef = useRef(0);
  const processedMidiCounterRef = useRef(0);
  const pianoShortcutStateRef = useRef<PianoShortcutState>(initialPianoShortcutState());
  const performGuidedShortcutRef = useRef<(command: PianoShortcutCommand) => void>(() => undefined);
  const performSightReadingShortcutRef = useRef<(command: PianoShortcutCommand) => void>(() => undefined);
  const guidedListenWasPlayingRef = useRef(false);
  const arpeggioProgressRef = useRef<ArpeggioProgress | undefined>(undefined);
  const sidebarResizeRef = useRef<{ startX: number; startWidth: number } | undefined>(undefined);
  const [draftSidebarWidth, setDraftSidebarWidth] = useState<number | undefined>();
  const [sidebarHiddenForPlayback, setSidebarHiddenForPlayback] = useState(false);
  const [playbackPreparing, setPlaybackPreparing] = useState(false);
  const [fullscreenNotice, setFullscreenNotice] = useState<string | undefined>();
  const [guidedAuditionNotice, setGuidedAuditionNotice] = useState<string | undefined>();
  const [performanceHistory, setPerformanceHistory] = useState<Map<string, ExercisePerformanceHistory>>(() => new Map());
  const processedCompletionIdRef = useRef(0);
  const fullscreenControllerRef = useRef(new PlaybackFullscreenController());
  const fullscreenNoticeTimerRef = useRef<number | undefined>(undefined);
  const guidedAuditionNoticeTimerRef = useRef<number | undefined>(undefined);
  const guidedPlanningHandModeRef = useRef<HandMode | undefined>(undefined);
  const guidedSessionPreferencesRef = useRef<{ handMode: HandMode; playMode: PlayMode; tempoPercent: number } | undefined>(undefined);
  const playbackStartEventOverrideRef = useRef<number | undefined>(undefined);
  const playbackImmediateStartOverrideRef = useRef(false);
  const scoreFileInputRef = useRef<HTMLInputElement | null>(null);
  const appHeaderRef = useRef<HTMLElement | null>(null);

  const pauseOnNotes = play.settings.playMode === "pause-each-note";
  const untimedPractice = play.settings.playMode === "practice";
  const playback = usePlaybackSession({ events: parsedScore.events, tempoChanges: parsedScore.tempoChanges, measureTimings: parsedScore.measureTimings, tempoPercent, handMode, range: selectedRange, runMode, pauseOnNotes, untimedPractice, settings: play.settings });
  const scoreAudio = useScoreAudio({ plan: playback.plan, phase: playback.phase, rollElapsedMs: playback.rollElapsedMs, audioStartElapsedMs: playback.audioStartElapsedMs, runId: playback.runId, pauseOnNotes, nextPendingGateOnsetMs: playback.nextPendingGateOnsetMs, settings: audioSettings.settings });
  const metronome = useMetronome({ plan: playback.plan, countInPlan: playback.countInPlan, phase: playback.phase, rollElapsedMs: playback.rollElapsedMs, runId: playback.runId, settings: audioSettings.settings, suppressed: untimedPractice });
  const { phase: playbackPhase, handleHeldNotesChange, handleMidiNoteOn } = playback;

  useEffect(() => {
    if (playbackPhase !== "idle" && playbackPhase !== "paused") setInspectedNote(undefined);
  }, [playbackPhase]);

  useEffect(() => {
    if (playbackPhase !== "idle") setLearningOpen(false);
  }, [playbackPhase]);

  useEffect(() => { setInspectedNote(undefined); }, [loadedScore?.xmlText]);

  useEffect(() => {
    const header = appHeaderRef.current;
    if (!header) return;
    const measure = () => setHeaderBottom(Math.ceil(header.getBoundingClientRect().bottom));
    measure();
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(header);
    return () => { window.removeEventListener("resize", measure); observer?.disconnect(); };
  }, []);

  const toggleSeeNote = useCallback(() => {
    setSeeNoteEnabled((enabled) => {
      if (enabled) setInspectedNote(undefined);
      return !enabled;
    });
  }, []);
  const currentExerciseKey = useMemo(() => loadedScore ? exercisePerformanceKey(loadedScore.xmlText, loadedScore.fileName, selectedRange, handMode, play.settings.playMode, tempoPercent) : undefined, [handMode, loadedScore, play.settings.playMode, selectedRange, tempoPercent]);
  const currentPerformanceHistory = currentExerciseKey ? performanceHistory.get(currentExerciseKey) : undefined;
  const activeGuidedSection = guidedPlan?.sections.find((section) => section.id === guidedPlan.activeSectionId) ?? guidedPlan?.sections[0];
  const guidedSessionSteps = useMemo(() => guidedStepsForSection(parsedScore.events, activeGuidedSection), [activeGuidedSection, parsedScore.events]);
  const guidedTempoHand: HandMode = guidedSessionSteps.includes("both") ? "both" : guidedSessionSteps.includes("right") ? "right" : "left";
  const guidedDiagnosis = useMemo(() => activeGuidedSection ? diagnoseGuidedAttempts(guidedAttemptEvidence.filter((attempt) => attempt.sectionId === activeGuidedSection.id && attempt.resetVersion === activeGuidedSection.resetVersion)) : undefined, [activeGuidedSection, guidedAttemptEvidence]);
  const guidedScoreKey = (sectionId: string, resetVersion: number, step: string) => `${sectionId}:${resetVersion}:${step}`;
  const currentGuidedStepScore = activeGuidedSection ? guidedStepScores[guidedScoreKey(activeGuidedSection.id, activeGuidedSection.resetVersion, guidedStep)] : undefined;
  const currentGuidedDetourScore = activeGuidedSection && guidedDetour ? guidedStepScores[guidedScoreKey(activeGuidedSection.id, activeGuidedSection.resetVersion, `detour:${guidedDetour.measureNumber}:${guidedDetour.handMode}`)] : undefined;

  useEffect(() => {
    const completed = playback.completedRun;
    if (!completed || !loadedScore || completed.id === processedCompletionIdRef.current) return;
    processedCompletionIdRef.current = completed.id;
    const completedAt = new Date();
    const attemptId = crypto.randomUUID();
    const builtAttempt = buildAttemptSummary({
      completedRun: completed,
      scoreVersionId: localScoreVersionId(loadedScore.xmlText),
      attemptId,
      idempotencyKey: attemptId,
      startedAt: new Date(completedAt.getTime() - completed.activeDurationMs).toISOString(),
      completedAt: completedAt.toISOString(),
    });
    const score = builtAttempt.performance;
    const key = exercisePerformanceKey(loadedScore.xmlText, loadedScore.fileName, completed.range, completed.handMode, completed.playMode, completed.tempoPercent);
    if (sightReadingSession) {
      if (sightReadingSession.phase === "attempt") {
        const assessment = calculateSightReadingAssessment(completed.plan, completed.results);
        setSightReadingSession((current) => current ? { ...current, phase: "result", assessment } : current);
      } else if (sightReadingSession.phase === "review") {
        setSightReadingSession((current) => current ? { ...current, phase: "result" } : current);
      }
    } else {
      setPerformanceHistory((current) => {
        const next = new Map(current);
        next.set(key, addPerformanceToHistory(current.get(key), builtAttempt.performance));
        return next;
      });
    }
    if (guidedSessionActive && guidedPlan?.activeSectionId && guidedStep !== "listen") {
      const section = guidedPlan.sections.find((item) => item.id === guidedPlan.activeSectionId);
      if (section) {
        const evidenceStep = guidedDetour ? guidedDetour.handMode === "right" ? "right" : guidedDetour.handMode === "left" ? "left" : "both" : guidedStep;
        setGuidedAttemptEvidence((current) => [...current, collectGuidedAttemptEvidence(section.id, section.resetVersion, evidenceStep, completed)]);
        const resultKey = guidedScoreKey(section.id, section.resetVersion, guidedDetour ? `detour:${guidedDetour.measureNumber}:${guidedDetour.handMode}` : guidedStep);
        setGuidedStepScores((current) => ({ ...current, [resultKey]: score.score }));
      }
      if (guidedDetour) {
        setGuidedDetourComplete(true);
        return;
      }
      setGuidedStepComplete(true);
      setGuidedPlan((current) => {
        if (!current?.activeSectionId) return current;
        if (guidedStep === "tempo") return recordGuidedTempoRun(current, current.activeSectionId, score.score);
        return setGuidedSectionProgress(current, current.activeSectionId, "in-progress", (current.sections.find((section) => section.id === current.activeSectionId)?.attempts ?? 0) + 1);
      });
    }
  }, [guidedDetour, guidedPlan?.activeSectionId, guidedPlan?.sections, guidedSessionActive, guidedStep, loadedScore, playback.completedRun, sightReadingSession]);

  useEffect(() => {
    if (!guidedStageToStart || !selectedRange) return;
    setGuidedStageToStart(undefined);
    void (async () => {
      await nextPaint();
      await nextPaint();
      await Promise.all([scoreAudio.prepare(), metronome.prepare()]);
      playback.startAtEvent(selectedRange.startIndex);
    })();
  }, [guidedStageToStart, metronome, playback, scoreAudio, selectedRange]);
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
    setLearningOpen(false);
    setCarriedCompletedNotes([]);
    clearCompletedFeedback();
    const isFreshStart = playback.phase === "idle";
    if (isFreshStart) {
      setGuidedPlanning(false);
      setAddingGuidedBoundary(false);
      setPlaybackPreparing(true);
      setSidebarHiddenForPlayback(true);
      setFullscreenNotice(undefined);
    }
    const audioReady = Promise.all([scoreAudio.prepare(), metronome.prepare()]);
    const presentationReady = isFreshStart
      ? (async () => {
        if (play.settings.playFullscreen) {
          const result = await fullscreenControllerRef.current.enter(document);
          if (result === "unavailable" || result === "failed") showFullscreenNotice();
        }
        await waitForScoreLayout();
        await nextPaint();
        await nextPaint();
      })()
      : Promise.resolve();
    const startEventIndex = playbackStartEventOverrideRef.current ?? learningState.currentIndex;
    const startImmediately = playbackImmediateStartOverrideRef.current;
    playbackStartEventOverrideRef.current = undefined;
    playbackImmediateStartOverrideRef.current = false;
    const continuePlayback = isFreshStart
      ? () => startImmediately ? playback.startAtEventImmediately(startEventIndex) : playback.startAtEvent(startEventIndex)
      : playback.togglePlayback;
    void Promise.all([audioReady, presentationReady]).finally(() => {
      setPlaybackPreparing(false);
      continuePlayback();
    });
  }, [clearCompletedFeedback, learningState.currentIndex, metronome, play.settings.playFullscreen, playback, scoreAudio, showFullscreenNotice]);

  const auditionGuidedSelection = useCallback(() => {
    if (!selectedRange || playback.phase !== "idle") return;
    if (scoreAudio.auditioning) {
      scoreAudio.stopAudition();
      return;
    }
    if (audioSettings.settings.muted || audioSettings.settings.volume <= 0) {
      setGuidedAuditionNotice("Sound is muted. Unmute score audio to hear this selection.");
      if (guidedAuditionNoticeTimerRef.current !== undefined) window.clearTimeout(guidedAuditionNoticeTimerRef.current);
      guidedAuditionNoticeTimerRef.current = window.setTimeout(() => {
        setGuidedAuditionNotice(undefined);
        guidedAuditionNoticeTimerRef.current = undefined;
      }, 3200);
      return;
    }
    setGuidedAuditionNotice(undefined);
    const auditionPlan = createPlaybackPlan(parsedScore.events, parsedScore.tempoChanges, play.settings.fallbackBpm, "both", selectedRange, parsedScore.measureTimings, tempoPercent);
    if (auditionPlan) void scoreAudio.audition(auditionPlan);
  }, [audioSettings.settings.muted, audioSettings.settings.volume, parsedScore.events, parsedScore.measureTimings, parsedScore.tempoChanges, play.settings.fallbackBpm, playback.phase, scoreAudio, selectedRange, tempoPercent]);

  useEffect(() => {
    if (!guidedSessionActive || guidedStep === "listen") return;
    if (playback.phase === "countdown" || playback.phase === "playing" || playback.phase === "waiting-note") setGuidedStepComplete(false);
  }, [guidedSessionActive, guidedStep, playback.phase]);

  useEffect(() => {
    const wasPlaying = guidedListenWasPlayingRef.current;
    guidedListenWasPlayingRef.current = guidedSessionActive && guidedStep === "listen" && scoreAudio.auditioning;
    if (guidedSessionActive && guidedStep === "listen" && wasPlaying && !scoreAudio.auditioning) setGuidedStepComplete(true);
  }, [guidedSessionActive, guidedStep, scoreAudio.auditioning]);

  useEffect(() => {
    if (playbackPhase === "idle") finishPlaybackPresentation();
  }, [finishPlaybackPresentation, playbackPhase]);

  useEffect(() => {
    const handleFullscreenChange = () => fullscreenControllerRef.current.handleFullscreenChange(document);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => clearCompletedFeedback, [clearCompletedFeedback]);
  useEffect(() => {
    if (simulatedHeldNotes.length === 0) return;
    const timer = window.setTimeout(() => setSimulatedHeldNotes([]), SIMULATION_PULSE_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [simulatedHeldNotes]);
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
    () => Array.from(new Set([...midi.heldNotes.filter((note) => !shortcutConsumedNotes.includes(note)), ...simulatedHeldNotes])).sort((a, b) => a - b),
    [midi.heldNotes, shortcutConsumedNotes, simulatedHeldNotes],
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
  const gateFeedbackMarkers = useMemo(() => feedbackMarkersForHeldNotes(combinedHeldNotes, gateFeedbackEvent, handMode, playback.carriedNotes), [combinedHeldNotes, gateFeedbackEvent, handMode, playback.carriedNotes]);
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
  const pianoFingerings = useMemo(() => pianoFingeringsForEvents(parsedScore.events, handMode), [handMode, parsedScore.events]);

  const practiceOptions = useMemo(() => ({ handMode, runMode, range: selectedRange }), [handMode, runMode, selectedRange]);

  useEffect(() => {
    if (!guidedPlanning || !guidedPlan) return;
    const section = guidedPlan.sections.find((item) => item.id === guidedPlan.activeSectionId) ?? guidedPlan.sections[0];
    if (section && (selectedRange?.startIndex !== section.startIndex || selectedRange?.endIndex !== section.endIndex)) {
      setSelectedRange({ startIndex: section.startIndex, endIndex: section.endIndex });
    }
  }, [guidedPlan, guidedPlanning, selectedRange]);

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

  const beginScoreReplacement = () => {
    setScoreError(undefined);
    setRenderError(undefined);
    setScoreStatus("loading");
    const resetState = initialLearningState();
    learningStateRef.current = resetState;
    setLearningState(resetState);
    setSimulatedHeldNotes([]);
    setSelectedRange(undefined);
    setTempoPercent(100);
    setCarriedCompletedNotes([]);
    setLastPracticeAttempt(undefined);
    setGuidedPlan(undefined);
    setGuidedAttemptEvidence([]);
    setGuidedStepScores({});
    setGuidedPlanning(false);
    setAddingGuidedBoundary(false);
    setSightReadingSession(undefined);
    playback.stop();
    playback.clearResults();
    clearCompletedFeedback();
  };

  const installScore = (score: LoadedScore, targetHandMode: HandMode) => {
    const parsed = parseMusicXmlTimeline(score.xmlText);
    console.debug("[score-import]", importDiagnosticsForDebug(parsed));
    setHandMode(targetHandMode);
    setLoadedScore(score);
    setParsedScore(parsed);
    const nextState = initialLearningState(firstPlayableIndex(parsed.events, targetHandMode) ?? 0);
    learningStateRef.current = nextState;
    setLearningState(nextState);
  };

  const failScoreReplacement = (error: unknown) => {
    setLoadedScore(null);
    setParsedScore({ events: [], restEvents: [], tempoChanges: [], measureTimings: [], warnings: [] });
    setScoreStatus("error");
    setScoreError(error instanceof Error ? error.message : "Score loading failed.");
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    beginScoreReplacement();

    try {
      const score = await loadScoreFile(file);
      installScore(score, handMode);
    } catch (error) {
      failScoreReplacement(error);
    }
  };

  const handleLearningItemActivate = (item: LearningItem) => {
    const generated = generateLearningScore(item);
    if (!generated) return;
    beginScoreReplacement();
    try {
      installScore(generated.loadedScore, generated.handMode);
      setLearningOpen(false);
    } catch (error) {
      failScoreReplacement(error);
      setLearningOpen(false);
    }
  };

  const startSightReading = (options: SightReadingOptions) => {
    const exercise = generateSightReadingExercise(options);
    beginScoreReplacement();
    try {
      installScore(exercise.loadedScore, exercise.handMode);
      setSightReadingSession({ options, phase: "prepare" });
      setRunMode("once");
      play.setSettings({ playMode: "play" });
      setLearningOpen(false);
      setSidebarHiddenForPlayback(false);
      workspace.setSettings({ sidebarOpen: true, sidebarTab: "practice" });
    } catch (error) {
      failScoreReplacement(error);
      setLearningOpen(false);
    }
  };

  const createGuidedPlan = (scope?: ScoreSelectionRange) => {
    if (!loadedScore) return;
    const plan = createGuidedPiecePlan(`${loadedScore.fileName}:${loadedScore.xmlText.length}`, parsedScore.events, parsedScore.measureTimings, scope, 4, TEMPO_BUILD_UP_PRESETS[learningSettings.settings.tempoBuildUp].startingTempo);
    if (!plan) return;
    setGuidedAttemptEvidence([]);
    setGuidedStepScores({});
    setGuidedPlan(plan);
    setGuidedSessionActive(false);
    guidedPlanningHandModeRef.current = handMode;
    setHandMode("both");
    setSelectedRange(plan.sections[0] ? { startIndex: plan.sections[0].startIndex, endIndex: plan.sections[0].endIndex } : scope);
    setGuidedPlanning(true);
    setAddingGuidedBoundary(false);
    setLearningOpen(false);
    setSidebarHiddenForPlayback(false);
    workspace.setSettings({ sidebarTab: "practice" });
  };

  const continueGuidedPlanning = () => {
    if (!guidedPlan) return;
    if (!guidedSessionPreferencesRef.current) guidedPlanningHandModeRef.current = handMode;
    setGuidedSessionActive(false);
    setGuidedDetour(undefined);
    setGuidedDetourComplete(false);
    setHandMode("both");
    setGuidedPlanning(true);
    const activeSection = guidedPlan.sections.find((section) => section.id === guidedPlan.activeSectionId) ?? guidedPlan.sections[0];
    if (activeSection) setSelectedRange({ startIndex: activeSection.startIndex, endIndex: activeSection.endIndex });
    setLearningOpen(false);
    setSidebarHiddenForPlayback(false);
    workspace.setSettings({ sidebarTab: "practice" });
  };

  const finishGuidedPlanningMode = () => {
    if (!guidedPlan) return;
    setGuidedPlan(finishGuidedPlanning(guidedPlan));
    setGuidedPlanning(false);
    setGuidedSessionActive(true);
    setGuidedStep("listen");
    setGuidedStepComplete(false);
    setAddingGuidedBoundary(false);
    guidedSessionPreferencesRef.current ??= { handMode: guidedPlanningHandModeRef.current ?? handMode, playMode: play.settings.playMode, tempoPercent };
    const active = guidedPlan.sections.find((section) => section.id === guidedPlan.activeSectionId) ?? guidedPlan.sections[0];
    if (active) setTempoPercent(active.targetTempoPercent);
    guidedPlanningHandModeRef.current = undefined;
  };

  const selectGuidedSessionSection = (sectionId: string) => {
    if (!guidedPlan) return;
    const section = guidedPlan.sections.find((item) => item.id === sectionId);
    if (!section) return;
    playback.stop();
    playback.clearResults();
    scoreAudio.stopAudition();
    setCarriedCompletedNotes([]);
    clearCompletedFeedback();
    setGuidedDetour(undefined);
    setGuidedDetourComplete(false);
    setGuidedPlan(setActiveGuidedSection(guidedPlan, sectionId));
    setSelectedRange({ startIndex: section.startIndex, endIndex: section.endIndex });
    setTempoPercent(section.targetTempoPercent);
    setGuidedStep("listen");
    setGuidedStepComplete(false);
  };

  const advanceGuidedStep = () => {
    playback.stop();
    setGuidedStep((current) => {
      const next = guidedSessionSteps[guidedSessionSteps.indexOf(current) + 1] ?? current;
      if (next === "tempo" && activeGuidedSection) setTempoPercent(activeGuidedSection.tempoPercent);
      return next;
    });
    setGuidedStepComplete(false);
    scoreAudio.stopAudition();
  };

  const returnToGuidedStep = (step: GuidedSessionStep) => {
    const currentIndex = guidedSessionSteps.indexOf(guidedStep);
    const nextIndex = guidedSessionSteps.indexOf(step);
    if (nextIndex < 0 || nextIndex > currentIndex || playback.phase !== "idle") return;
    scoreAudio.stopAudition();
    if (activeGuidedSection) setTempoPercent(step === "tempo" ? activeGuidedSection.tempoPercent : activeGuidedSection.targetTempoPercent);
    setGuidedStep(step);
    setGuidedStepComplete(false);
  };

  const startGuidedPracticeStage = (nextHandMode: HandMode) => {
    setGuidedStepComplete(false);
    setHandMode(nextHandMode);
    play.setSettings({ playMode: guidedStep === "tempo" ? "play" : "pause-each-note" });
    if (guidedStep === "tempo" && activeGuidedSection) setTempoPercent(activeGuidedSection.tempoPercent);
    setGuidedStageToStart(nextHandMode);
  };

  const repeatGuidedStep = () => {
    setGuidedStepComplete(false);
    if (playback.phase === "waiting-restart") playback.start();
    else if (playback.phase === "idle" && guidedStep !== "listen") startGuidedPracticeStage(guidedStep === "right" ? "right" : guidedStep === "left" ? "left" : guidedTempoHand);
  };

  const beginGuidedDetour = (diagnosis: GuidedDiagnosis) => {
    if (!activeGuidedSection || !selectedRange) return;
    const range = guidedDiagnosisRange(parsedScore.events, activeGuidedSection, diagnosis.measureNumber);
    if (!range) return;
    const detourHand = diagnosis.hand ?? guidedTempoHand;
    playback.stop();
    playback.clearResults();
    setGuidedDetour({ sectionId: activeGuidedSection.id, measureNumber: diagnosis.measureNumber, handMode: detourHand, originalRange: { ...selectedRange }, originalHandMode: handMode, originalPlayMode: play.settings.playMode, originalTempoPercent: tempoPercent, originalRunMode: runMode });
    setGuidedDetourComplete(false);
    setSelectedRange(range);
    setHandMode(detourHand);
    setRunMode("once");
    play.setSettings({ playMode: "pause-each-note" });
    setCarriedCompletedNotes([]);
    clearCompletedFeedback();
  };

  const practiceGuidedDetour = () => {
    if (!guidedDetour || playback.phase !== "idle") return;
    setGuidedDetourComplete(false);
    playback.clearResults();
    setGuidedStageToStart(guidedDetour.handMode);
  };

  const returnFromGuidedDetour = () => {
    if (!guidedDetour) return;
    playback.stop();
    playback.clearResults();
    setSelectedRange(guidedDetour.originalRange);
    setHandMode(guidedDetour.originalHandMode);
    play.setSettings({ playMode: guidedDetour.originalPlayMode });
    setTempoPercent(guidedDetour.originalTempoPercent);
    setRunMode(guidedDetour.originalRunMode);
    setGuidedDetour(undefined);
    setGuidedDetourComplete(false);
    setCarriedCompletedNotes([]);
    clearCompletedFeedback();
  };

  const leaveGuidedSession = () => {
    playback.stop();
    scoreAudio.stopAudition();
    setGuidedSessionActive(false);
    setGuidedDetour(undefined);
    setGuidedDetourComplete(false);
    const previous = guidedSessionPreferencesRef.current;
    if (previous) {
      setHandMode(previous.handMode);
      play.setSettings({ playMode: previous.playMode });
      setTempoPercent(previous.tempoPercent);
    }
    guidedSessionPreferencesRef.current = undefined;
  };

  const increaseGuidedTempoLevel = () => {
    if (!guidedPlan?.activeSectionId) return;
    const nextPlan = increaseGuidedTempo(guidedPlan, guidedPlan.activeSectionId);
    const nextSection = nextPlan.sections.find((section) => section.id === nextPlan.activeSectionId);
    setGuidedPlan(nextPlan);
    if (nextSection) setTempoPercent(nextSection.tempoPercent);
    setGuidedStepComplete(false);
  };

  const nextGuidedLesson = () => {
    if (!guidedPlan) return;
    const index = guidedPlan.sections.findIndex((section) => section.id === guidedPlan.activeSectionId);
    const next = guidedPlan.sections[index + 1];
    if (!next) {
      leaveGuidedSession();
      return;
    }
    selectGuidedSessionSection(next.id);
  };

  const previousGuidedStep = () => {
    const index = guidedSessionSteps.indexOf(guidedStep);
    const previous = guidedSessionSteps[index - 1];
    if (previous) returnToGuidedStep(previous);
  };

  const performGuidedShortcut = (command: PianoShortcutCommand) => {
    if (!guidedSessionActive) return;
    setShortcutNotice(command === "toggle-loop" ? "Lesson loop toggled" : `${command[0].toUpperCase()}${command.slice(1)} shortcut`);
    if (command === "stop") {
      scoreAudio.stopAudition();
      playback.stop();
      return;
    }
    if (guidedDetour) {
      if (command === "previous") returnFromGuidedDetour();
      else if ((command === "primary" || command === "repeat") && playback.phase === "idle") practiceGuidedDetour();
      return;
    }
    if (command === "toggle-loop") {
      setRunMode((current) => current === "loop" ? "once" : "loop");
      return;
    }
    if (command === "previous") {
      previousGuidedStep();
      return;
    }
    if (command === "repeat") {
      if (guidedStep === "listen") auditionGuidedSelection();
      else if (playback.phase === "waiting-restart") repeatGuidedStep();
      else startGuidedPracticeStage(guidedStep === "right" ? "right" : guidedStep === "left" ? "left" : guidedTempoHand);
      return;
    }
    if (guidedStep === "listen") {
      if (scoreAudio.auditioning) {
        scoreAudio.stopAudition();
        setGuidedStepComplete(true);
      } else if (guidedStepComplete) advanceGuidedStep();
      else auditionGuidedSelection();
      return;
    }
    if (guidedStepComplete) {
      if (guidedStep === "tempo") {
        if (activeGuidedSection?.status === "complete") nextGuidedLesson();
        else if ((activeGuidedSection?.lastTempoScore ?? 0) >= 90 && (activeGuidedSection?.tempoPercent ?? 100) < (activeGuidedSection?.targetTempoPercent ?? 100)) increaseGuidedTempoLevel();
        else startGuidedPracticeStage(guidedTempoHand);
      } else if (guidedSessionSteps.at(-1) === guidedStep) nextGuidedLesson();
      else advanceGuidedStep();
    } else if (playback.phase === "waiting-restart") repeatGuidedStep();
    else if (playback.phase === "idle") startGuidedPracticeStage(guidedStep === "right" ? "right" : guidedStep === "left" ? "left" : guidedTempoHand);
  };
  useEffect(() => { performGuidedShortcutRef.current = performGuidedShortcut; });

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
      if (shortcutCaptureTarget && event.message.kind === "note-on" && event.message.noteNumber !== undefined) {
        const note = event.message.noteNumber;
        if (shortcutCaptureTarget === "modifier") pianoShortcuts.setSettings({ modifier: note });
        else pianoShortcuts.setSettings({ bindings: { [shortcutCaptureTarget]: note } });
        setShortcutCaptureTarget(undefined);
        setShortcutNotice(`${midiNoteToName(note)} assigned`);
        setShortcutConsumedNotes(event.heldNotesAfter.includes(note) ? [note] : []);
        continue;
      }
      const focused = document.activeElement;
      const editableFocused = focused instanceof HTMLInputElement && !["checkbox", "radio", "range", "color", "button"].includes(focused.type) || focused instanceof HTMLSelectElement || focused instanceof HTMLTextAreaElement || focused instanceof HTMLElement && focused.isContentEditable;
      const blockingDialogOpen = document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
      const shortcutActive = (guidedSessionActive || Boolean(sightReadingSession)) && !midiSettingsOpen && !editableFocused && !blockingDialogOpen && shortcutConflicts(pianoShortcuts.settings).length === 0;
      const shortcut = resolvePianoShortcut(event, pianoShortcuts.settings, pianoShortcutStateRef.current, shortcutActive);
      pianoShortcutStateRef.current = shortcut.state;
      setShortcutConsumedNotes(event.heldNotesAfter.filter((note) => !shortcut.heldNotesAfter.includes(note)));
      if (shortcut.command) {
        if (guidedSessionActive) performGuidedShortcutRef.current(shortcut.command);
        else performSightReadingShortcutRef.current(shortcut.command);
        continue;
      }
      if (event.message.noteNumber !== undefined && event.message.kind === "note-on" && event.heldNotesAfter.includes(event.message.noteNumber) && !shortcut.heldNotesAfter.includes(event.message.noteNumber)) continue;
      if (playbackPhase !== "idle") handleHeldNotesChange(shortcut.heldNotesAfter);
      if (event.message.kind !== "note-on" || event.message.noteNumber === undefined) continue;
      if (playbackPhase !== "idle") {
        handleMidiNoteOn(event.message.noteNumber, event.receivedAtMs, shortcut.heldNotesAfter, playbackPhase === "waiting-note");
      } else {
        advanceWithNotes(shortcut.heldNotesAfter, {
        source: "midi",
          triggeringMidiNote: event.message.noteNumber,
          receivedAtMs: event.receivedAtMs,
          heldNotesBefore: shortcut.heldNotesBefore,
          heldNotesAfter: shortcut.heldNotesAfter,
        });
      }
    }
  }, [advanceWithNotes, guidedSessionActive, handleHeldNotesChange, handleMidiNoteOn, midi.messageEvents, midiSettingsOpen, pianoShortcuts, playbackPhase, shortcutCaptureTarget, sightReadingSession]);

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
    setSimulatedHeldNotes([...expectedEvent.midiNotes]);
    advanceWithNotes(expectedEvent.midiNotes, {
      source: "simulation",
      heldNotesBefore: combinedHeldNotes,
      heldNotesAfter: expectedEvent.midiNotes,
    });
  };

  const clearSelection = () => {
    scoreAudio.stopAudition();
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

  const startSightReadingAttempt = useCallback(() => {
    playbackStartEventOverrideRef.current = firstPlayableIndex(parsedScore.events, handMode, selectedRange) ?? selectedRange?.startIndex ?? 0;
    playbackImmediateStartOverrideRef.current = true;
    resetAllProgress();
    setSightReadingSession((current) => current ? { ...current, phase: "attempt", score: undefined } : current);
    togglePlaybackWithAudio();
  }, [handMode, parsedScore.events, resetAllProgress, selectedRange, togglePlaybackWithAudio]);

  const startSightReadingReview = useCallback(() => {
    playbackStartEventOverrideRef.current = firstPlayableIndex(parsedScore.events, handMode, selectedRange) ?? selectedRange?.startIndex ?? 0;
    playbackImmediateStartOverrideRef.current = true;
    resetAllProgress();
    setSightReadingSession((current) => current ? { ...current, phase: "review" } : current);
    togglePlaybackWithAudio();
  }, [handMode, parsedScore.events, resetAllProgress, selectedRange, togglePlaybackWithAudio]);

  const stopSightReadingReview = useCallback(() => {
    playback.stop();
    setSightReadingSession((current) => current ? { ...current, phase: "result" } : current);
  }, [playback]);

  const performSightReadingShortcut = (command: PianoShortcutCommand) => {
    const session = sightReadingSession;
    if (!session) return;
    if (command === "stop" && playback.phase !== "idle") {
      setShortcutNotice(session.phase === "review" ? "Review stopped" : "Sight-reading attempt stopped");
      if (session.phase === "review") stopSightReadingReview();
      else playback.stop();
      return;
    }
    if (command === "previous" && session.phase !== "attempt") {
      setShortcutNotice("Returned to Learning");
      setSightReadingSession(undefined);
      setLearningOpen(true);
      return;
    }
    if (command === "primary" && session.phase === "prepare" && playback.phase === "idle") {
      setShortcutNotice("Sight-reading attempt started");
      startSightReadingAttempt();
      return;
    }
    if (command === "primary" && session.phase === "result") {
      setShortcutNotice("New sight-reading excerpt");
      startSightReading(session.options);
      return;
    }
    if (command === "repeat" && session.phase === "result") {
      setShortcutNotice("Reviewing sight-reading excerpt");
      startSightReadingReview();
    }
  };
  useEffect(() => { performSightReadingShortcutRef.current = performSightReadingShortcut; });

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

  const handleTempoPercentChange = useCallback((percent: number) => {
    const next = Math.min(200, Math.max(40, Math.round(percent / 5) * 5));
    if (next === tempoPercent) return;
    resetAllProgress();
    setTempoPercent(next);
  }, [resetAllProgress, tempoPercent]);

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
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || !playback.plan || sightReadingSession?.phase === "result") return;
      togglePlaybackWithAudio();
    };
    window.addEventListener("keydown", handleSpace, { capture: true });
    return () => window.removeEventListener("keydown", handleSpace, { capture: true });
  }, [playback.plan, sightReadingSession?.phase, togglePlaybackWithAudio]);

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
  const ordinarySidebarVisible = isSidebarVisible(workspace.settings, sidebarHiddenForPlayback);
  const sidebarVisible = guidedPlanning || guidedSessionActive || Boolean(sightReadingSession) || ordinarySidebarVisible;
  const scoreMargin = scoreMarginForLayout(workspace.settings, ordinarySidebarVisible);
  const effectiveBottomPanelHeight = bottomPanelHeight;
  const writtenTempoBpm = effectiveTempoAtQuarter(playback.plan?.startQuarter ?? 0, parsedScore.tempoChanges, play.settings.fallbackBpm);
  const tempoVaries = parsedScore.tempoChanges.some((change) => Math.abs(change.bpm - writtenTempoBpm) > 0.001);
  const selectSidebarTabFromKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextTab = event.key === "ArrowLeft" || event.key === "Home" ? "practice" : "debug";
    workspace.setSettings({ sidebarTab: nextTab });
    document.getElementById(`sidebar-tab-${nextTab}`)?.focus();
  };

  return (
    <main className="app-shell" style={{ "--sidebar-width": `${sidebarWidth}px`, "--score-margin": `${scoreMargin}px`, "--sidebar-top": `${headerBottom + 8}px`, "--bottom-panel-clearance": `${effectiveBottomPanelHeight + 20}px` } as React.CSSProperties}>
      <header ref={appHeaderRef} className="app-header">
        <div className="app-brand"><h1>DigiPiano</h1></div>
        {loadedScore ? <div className="score-heading">
          <div className="score-identity" aria-live="polite">
            <strong title={loadedScore.info.title}>{loadedScore.info.title}</strong>
            {loadedScore.info.subtitle ? <span title={loadedScore.info.subtitle}>{loadedScore.info.subtitle}</span> : null}
          </div>
        </div> : <div />}
        <div className="app-header-actions">
          {currentPerformanceHistory ? <PerformanceScoreBadge history={currentPerformanceHistory} /> : null}
          {loadedScore && playback.plan ? <ScoreTimeDisplay remainingMs={playback.remainingDurationMs} idealMs={playback.idealDurationMs} graceMs={play.settings.playMode === "play" ? 0 : paceGraceMs(playback.idealDurationMs)} /> : null}
          <label className="settings-button header-open-score-button" aria-label="Open score" title="Open score">
            <OpenScoreIcon />
            <input ref={scoreFileInputRef} type="file" accept=".mxl,.musicxml,.xml" onChange={handleFileChange} />
          </label>
          <button type="button" className="settings-button" aria-label="Open settings" title="Settings" onClick={() => setMidiSettingsOpen(true)}><SettingsIcon /></button>
        </div>
      </header>
      {fullscreenNotice ? <div className="playback-notice" role="status">{fullscreenNotice}</div> : null}

      <section className={`score-layout${sidebarVisible ? "" : " sidebar-collapsed"}${learningOpen ? " learning-obscured" : ""}`} aria-hidden={learningOpen || undefined} inert={learningOpen || undefined}>
        <div className="score-frame">
          {scoreStatus === "empty" ? <div className="score-placeholder">No score loaded.</div> : null}
          {scoreStatus === "loading" ? <div className="score-placeholder">Loading score...</div> : null}
          <ScoreRenderer
            xmlText={loadedScore?.xmlText}
            currentEventIndex={displayedEventIndex}
            currentEvent={displayedEvent}
            eventCount={parsedScore.events.length}
            events={parsedScore.events}
            restEvents={parsedScore.restEvents}
            measureTimings={parsedScore.measureTimings}
            selectedRange={selectedRange}
            guidedSections={guidedPlanning ? guidedPlan?.sections : undefined}
            guidedPlanning={guidedPlanning}
            addingGuidedBoundary={addingGuidedBoundary}
            activeGuidedSectionId={guidedPlan?.activeSectionId}
            guidedAuditioning={scoreAudio.auditioning}
            guidedAuditionNotice={guidedAuditionNotice}
            selectionAuditionEnabled={Boolean(selectedRange) && playback.phase === "idle" && !guidedPlanning && !guidedSessionActive && !sightReadingSession}
            feedbackMarkers={playback.phase === "idle" ? scoreFeedbackMarkers : playback.phase === "waiting-note" ? gateFeedbackMarkers : []}
            completedFeedback={completedFeedback}
            performanceResults={sightReadingSession?.phase === "attempt" ? [] : shouldShowPerformanceResults(playback.phase, play.settings.showHitsWhilePlaying) ? playback.results : []}
            missedPerformanceNotes={sightReadingSession?.phase === "attempt" ? [] : playback.missedNotes}
            playbackPhase={playback.phase}
            playbackPreparing={playbackPreparing}
            playheadAnchor={playback.playheadAnchor}
            markerColor={resolvedScoreMarkerColor(appearance.scoreMarkerSettings, appearance.scoreTheme)}
            markerOpacity={appearance.scoreMarkerSettings.opacity}
            markerRestOpacity={appearance.scoreMarkerSettings.restOpacity}
            countdownValue={playback.countdownValue}
            countdownBar={playback.countdownBar}
            showStartCue={playback.showStartCue}
            canPlay={Boolean(playback.plan) && sightReadingSession?.phase !== "result"}
            handMode={handMode}
            runMode={runMode}
            pauseOnNotes={pauseOnNotes}
            playMode={play.settings.playMode}
            showProgressWhilePlaying={sightReadingSession?.phase === "attempt" ? false : play.settings.showHitsWhilePlaying}
            waitingForNotes={waitingForGateNotes}
            audioSettings={audioSettings.settings}
            audioError={scoreAudio.error ?? metronome.error}
            tempoPercent={tempoPercent}
            writtenTempoBpm={writtenTempoBpm}
            tempoVaries={tempoVaries}
            countInBars={play.settings.countInBars}
            scoreTheme={appearance.scoreTheme}
            showCorrectNoteNames={showCorrectNoteNames}
            showWrongNoteNames={showWrongNoteNames}
            seeNoteEnabled={seeNoteEnabled}
            inspectedNote={inspectedNote}
            onSeeNoteToggle={toggleSeeNote}
            onInspectedNoteChange={setInspectedNote}
            onSelectedRangeChange={handleSelectionChange}
            onGuidedSectionActivate={(sectionId) => setGuidedPlan((plan) => {
              if (!plan) return plan;
              const section = plan.sections.find((item) => item.id === sectionId);
              if (section) setSelectedRange({ startIndex: section.startIndex, endIndex: section.endIndex });
              return setActiveGuidedSection(plan, sectionId);
            })}
            onGuidedSectionSplit={(sectionId, eventIndex) => {
              setGuidedPlan((plan) => plan ? splitGuidedSection(plan, sectionId, eventIndex, parsedScore.events) : plan);
              setAddingGuidedBoundary(false);
            }}
            onGuidedBoundaryMove={(sectionId, eventIndex) => setGuidedPlan((plan) => plan ? moveGuidedBoundary(plan, sectionId, eventIndex, parsedScore.events) : plan)}
            onGuidedBoundaryDelete={(sectionId) => setGuidedPlan((plan) => plan ? mergeGuidedSections(plan, sectionId, parsedScore.events) : plan)}
            onGuidedAudition={auditionGuidedSelection}
            onGuidedAuditionStop={scoreAudio.stopAudition}
            onEventSeek={seekToEvent}
            onHandModeChange={handleHandModeChange}
            onRunModeChange={setRunMode}
            onPlayModeChange={handlePlayModeChange}
            onShowProgressWhilePlayingChange={(showHitsWhilePlaying) => play.setSettings({ showHitsWhilePlaying })}
            onTogglePlayback={togglePlaybackWithAudio}
            onStop={stopPlayback}
            onReset={resetAllProgress}
            onClearSelection={clearSelection}
            onClearPerformance={playback.clearResults}
            onAudioSettingsChange={audioSettings.setSettings}
            onTempoPercentChange={handleTempoPercentChange}
            onCountInBarsChange={(countInBars) => play.setSettings({ countInBars })}
            onRenderStateChange={(next) => {
              setScoreStatus(next.status);
              setRenderError(next.error);
            }}
          />
        </div>
        {sidebarVisible ? <aside className={`right-sidebar${guidedPlanning || guidedSessionActive ? " guided-planner-sidebar" : ""}`} aria-label="Side panel">
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
            <div className="practice-learning-entry"><button type="button" className="primary" disabled={playback.phase !== "idle"} onClick={() => setLearningOpen(true)}>Open Learning</button></div>
            {loadedScore && !guidedPlanning && !guidedSessionActive && !sightReadingSession ? <section className="practice-planning-actions" aria-label="Guided planning shortcuts"><span>Guided piece practice</span><button type="button" onClick={() => createGuidedPlan()}>Plan whole score</button><button type="button" disabled={!selectedRange} onClick={() => createGuidedPlan(selectedRange)}>Plan selected passage</button></section> : null}
            {guidedPlanning && guidedPlan ? <GuidedPlannerCard
              plan={guidedPlan}
              addingBoundary={addingGuidedBoundary}
              onAddingBoundaryChange={setAddingGuidedBoundary}
              onSectionSelect={(sectionId) => {
                const section = guidedPlan.sections.find((item) => item.id === sectionId);
                setGuidedPlan(setActiveGuidedSection(guidedPlan, sectionId));
                if (section) setSelectedRange({ startIndex: section.startIndex, endIndex: section.endIndex });
              }}
              onBoundaryMove={(sectionId, eventIndex) => setGuidedPlan((plan) => plan ? moveGuidedBoundary(plan, sectionId, eventIndex, parsedScore.events) : plan)}
              onBoundaryDelete={(sectionId) => setGuidedPlan((plan) => plan ? mergeGuidedSections(plan, sectionId, parsedScore.events) : plan)}
              onDone={finishGuidedPlanningMode}
            /> : null}
            {guidedSessionActive && guidedPlan ? <GuidedSessionCard
              plan={guidedPlan}
              steps={guidedSessionSteps}
              step={guidedStep}
              stepComplete={guidedStepComplete}
              stepScore={currentGuidedStepScore}
              diagnosis={!guidedDetour && activeGuidedSection?.status === "complete" && guidedStep === "tempo" && guidedStepComplete ? guidedDiagnosis : undefined}
              detour={guidedDetour}
              detourComplete={guidedDetourComplete}
              detourScore={currentGuidedDetourScore}
              auditioning={scoreAudio.auditioning}
              playbackActive={playback.phase !== "idle"}
              awaitingLoopRestart={playback.phase === "waiting-restart"}
              loopEnabled={runMode === "loop"}
              tempoHand={guidedTempoHand}
              shortcutHint={pianoShortcuts.settings.enabled && pianoShortcuts.settings.showHints && shortcutConflicts(pianoShortcuts.settings).length === 0 ? `hold ${midiNoteToName(pianoShortcuts.settings.modifier)} + ${midiNoteToName(pianoShortcuts.settings.bindings.primary)}` : undefined}
              shortcutNotice={shortcutNotice}
              onSectionSelect={selectGuidedSessionSection}
              onStepSelect={returnToGuidedStep}
              onListen={auditionGuidedSelection}
              onListenDone={() => { scoreAudio.stopAudition(); setGuidedStepComplete(true); }}
              onPractice={startGuidedPracticeStage}
              onLoopChange={(enabled) => setRunMode(enabled ? "loop" : "once")}
              onTempoIncrease={increaseGuidedTempoLevel}
              onSkip={advanceGuidedStep}
              onRepeat={repeatGuidedStep}
              onNextLesson={nextGuidedLesson}
              onEditPlan={continueGuidedPlanning}
              onStartDetour={beginGuidedDetour}
              onPracticeDetour={practiceGuidedDetour}
              onReturnFromDetour={returnFromGuidedDetour}
              onLeave={leaveGuidedSession}
            /> : null}
            {sightReadingSession ? <SightReadingCard options={sightReadingSession.options} phase={sightReadingSession.phase} assessment={sightReadingSession.assessment} playbackActive={playback.phase !== "idle"} shortcutHint={pianoShortcuts.settings.enabled && pianoShortcuts.settings.showHints && shortcutConflicts(pianoShortcuts.settings).length === 0 ? `hold ${midiNoteToName(pianoShortcuts.settings.modifier)} + ${midiNoteToName(pianoShortcuts.settings.bindings.primary)}` : undefined} shortcutNotice={shortcutNotice} onStart={startSightReadingAttempt} onNew={() => startSightReading(sightReadingSession.options)} onReview={startSightReadingReview} onStopReview={stopSightReadingReview} onLeave={() => { setSightReadingSession(undefined); setLearningOpen(true); }} /> : null}
            {!loadedScore && !guidedPlanning && !guidedSessionActive && !sightReadingSession ? <p className="muted">Open a score, or use Learning for foundations and reference material.</p> : null}
          </section> : <div id="sidebar-panel-debug" role="tabpanel" aria-labelledby="sidebar-tab-debug">
            <div className="feedback-controls">
              <label><input type="checkbox" checked={showCorrectNoteNames} onChange={(event) => setShowCorrectNoteNames(event.target.checked)} /> Correct names</label>
              <label><input type="checkbox" checked={showWrongNoteNames} onChange={(event) => setShowWrongNoteNames(event.target.checked)} /> Wrong names</label>
            </div>
            <SelectionSummary range={selectedRange} events={parsedScore.events} />
            {sidebarExpectedEvent ? <ExpectedEvent event={sidebarExpectedEvent} index={displayedEventIndex} total={parsedScore.events.length} isComplete={playback.phase === "idle" && learningState.isComplete} simulationDisabled={playback.phase !== "idle" || !expectedEvent || expectedEvent.midiNotes.length === 0 || learningState.isComplete} onSimulate={simulateCurrentEvent} /> : <p className="muted">Load a score to begin.</p>}
            <ComparisonSummary state={learningState} />
            <DebugPanel
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
      {!sidebarVisible && !learningOpen ? <button type="button" className="sidebar-restore-button" aria-label="Restore side panel" title="Restore side panel" onClick={() => { setSidebarHiddenForPlayback(false); workspace.setSettings({ sidebarOpen: true }); }}><SidebarRestoreIcon /><span>Panel</span></button> : null}
      {learningOpen ? <LearningWorkspace midiEvents={midi.messageEvents} tab={learningTab} bottomOffset={effectiveBottomPanelHeight + 20} rightColor={piano.settings.playRightColor} scoreTitle={loadedScore?.info.title} selectedRange={selectedRange} plan={guidedPlan} audioSettings={audioSettings.settings} midiReadiness={{ supported: midi.supported, secureContext: midi.secureContext, accessStatus: midi.accessStatus, deviceName: midi.inputs.find((input) => input.id === midi.selectedInputId)?.name, lastNote: midi.lastMessage?.kind === "note-on" ? midi.lastMessage.noteNumber : undefined, messageId: midi.messageCounter, heldNotes: midi.heldNotes, sustainOn: midi.heldState.sustainOn, lastSustainMessageId: midi.lastMessage?.kind === "control-change" && midi.lastMessage.controller === 64 ? midi.messageCounter : undefined, lastSustainOn: midi.lastMessage?.kind === "control-change" && midi.lastMessage.controller === 64 ? midi.lastMessage.sustainOn : undefined }} onConnectMidi={midi.requestAccess} onTabChange={setLearningTab} onItemActivate={handleLearningItemActivate} onOpenScore={() => scoreFileInputRef.current?.click()} onCreatePlan={createGuidedPlan} onContinuePlan={continueGuidedPlanning} onStartSightReading={startSightReading} onClose={() => setLearningOpen(false)} /> : null}
      <PianoPanel
        expectations={sightReadingSession?.phase === "attempt" ? [] : pianoExpectations}
        fingerings={pianoFingerings}
        heldNotes={sightReadingSession?.phase === "attempt" ? [] : combinedHeldNotes}
        ignoredCarriedNotes={playback.phase === "idle" ? carriedCompletedNotes : playback.carriedNotes}
        settings={piano.settings}
        playbackPlan={playback.plan}
        playbackPhase={playback.phase}
        rollElapsedMs={playback.rollElapsedMs}
        playbackElapsedMs={playback.elapsedMs}
        displayedEventIndex={displayedEventIndex}
        canPlay={Boolean(playback.plan) && sightReadingSession?.phase !== "result"}
        runMode={runMode}
        pauseOnNotes={pauseOnNotes}
        playMode={play.settings.playMode}
        showProgressWhilePlaying={sightReadingSession?.phase === "attempt" ? false : play.settings.showHitsWhilePlaying}
        canClearPerformance={playback.results.length > 0 || playback.missedNotes.length > 0}
        audioSettings={audioSettings.settings}
        audioError={scoreAudio.error ?? metronome.error}
        tempoPercent={tempoPercent}
        writtenTempoBpm={writtenTempoBpm}
        tempoVaries={tempoVaries}
        countInBars={play.settings.countInBars}
        seeNoteEnabled={seeNoteEnabled}
        learningOpen={learningOpen}
        planningMode={guidedPlanning}
        inspectedMidiNote={inspectedNote?.midiNote}
        onSeeNoteToggle={toggleSeeNote}
        onLearningOpenChange={setLearningOpen}
        onPanelHeightChange={setBottomPanelHeight}
        onSettingsChange={piano.setSettings}
        onTogglePlayback={togglePlaybackWithAudio}
        onStop={stopPlayback}
        onReset={resetAllProgress}
        canClearSelection={Boolean(selectedRange)}
        onClearSelection={clearSelection}
        onSeek={seekToEvent}
        onRunModeChange={setRunMode}
        onPlayModeChange={handlePlayModeChange}
        onShowProgressWhilePlayingChange={(showHitsWhilePlaying) => play.setSettings({ showHitsWhilePlaying })}
        onClearPerformance={playback.clearResults}
        onAudioSettingsChange={audioSettings.setSettings}
        onTempoPercentChange={handleTempoPercentChange}
        onCountInBarsChange={(countInBars) => play.setSettings({ countInBars })}
      />
      {midiSettingsOpen ? (
        <SettingsDialog
          midi={midi}
          appTheme={appearance.appTheme}
          scoreTheme={appearance.scoreTheme}
          scoreMarkerSettings={appearance.scoreMarkerSettings}
          pianoSettings={piano.settings}
          playSettings={play.settings}
          workspaceSettings={workspace.settings}
          shortcutSettings={pianoShortcuts.settings}
          shortcutCaptureTarget={shortcutCaptureTarget}
          shortcutNotice={shortcutNotice}
          learningSettings={learningSettings.settings}
          onAppThemeChange={appearance.setAppTheme}
          onScoreThemeChange={appearance.setScoreTheme}
          onScoreMarkerSettingsChange={appearance.setScoreMarkerSettings}
          onResetScoreMarkerSettings={appearance.resetScoreMarkerSettings}
          onPianoSettingsChange={piano.setSettings}
          onResetPianoColors={piano.resetColors}
          onPlaySettingsChange={play.setSettings}
          onWorkspaceSettingsChange={workspace.setSettings}
          onShortcutSettingsChange={pianoShortcuts.setSettings}
          onShortcutCapture={setShortcutCaptureTarget}
          onResetShortcuts={pianoShortcuts.reset}
          onLearningSettingsChange={learningSettings.setSettings}
          onClose={() => { setShortcutCaptureTarget(undefined); setMidiSettingsOpen(false); }}
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
  scoreMarkerSettings,
  pianoSettings,
  playSettings,
  workspaceSettings,
  shortcutSettings,
  shortcutCaptureTarget,
  shortcutNotice,
  learningSettings,
  onAppThemeChange,
  onScoreThemeChange,
  onScoreMarkerSettingsChange,
  onResetScoreMarkerSettings,
  onPianoSettingsChange,
  onResetPianoColors,
  onPlaySettingsChange,
  onWorkspaceSettingsChange,
  onShortcutSettingsChange,
  onShortcutCapture,
  onResetShortcuts,
  onLearningSettingsChange,
  onClose,
}: {
  midi: ReturnType<typeof useMidiInput>;
  appTheme: AppTheme;
  scoreTheme: ScoreTheme;
  scoreMarkerSettings: ScoreMarkerSettings;
  pianoSettings: PianoSettings;
  playSettings: PlaySettings;
  workspaceSettings: WorkspaceLayoutSettings;
  shortcutSettings: PianoShortcutSettings;
  shortcutCaptureTarget?: PianoShortcutBindingKey;
  shortcutNotice?: string;
  learningSettings: LearningSettings;
  onAppThemeChange: (theme: AppTheme) => void;
  onScoreThemeChange: (theme: ScoreTheme) => void;
  onScoreMarkerSettingsChange: (update: Partial<ScoreMarkerSettings>) => void;
  onResetScoreMarkerSettings: () => void;
  onPianoSettingsChange: (update: Partial<PianoSettings>) => void;
  onResetPianoColors: () => void;
  onPlaySettingsChange: (update: Partial<PlaySettings>) => void;
  onWorkspaceSettingsChange: (update: Partial<WorkspaceLayoutSettings>) => void;
  onShortcutSettingsChange: (update: PianoShortcutSettingsUpdate) => void;
  onShortcutCapture: (target: PianoShortcutBindingKey | undefined) => void;
  onResetShortcuts: () => void;
  onLearningSettingsChange: (update: Partial<LearningSettings>) => void;
  onClose: () => void;
}) {
  type SettingsTab = "general" | "appearance" | "piano" | "play" | "learning" | "controls";
  const tabs: { id: SettingsTab; label: string; description: string }[] = [
    { id: "general", label: "General", description: "Devices and essentials" },
    { id: "appearance", label: "Appearance", description: "Themes and score layout" },
    { id: "piano", label: "Piano", description: "Keyboard feedback" },
    { id: "play", label: "Play", description: "Timing and focus" },
    { id: "learning", label: "Learning", description: "Guided progression" },
    { id: "controls", label: "Controls", description: "Piano shortcuts" },
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
          </div><div className="settings-card score-marker-settings"><span className="settings-label">Current note marker</span><p className="settings-card-copy">The translucent wash sits behind the notation while the solid leading line stays visible.</p>
          <div className="score-marker-preview" aria-label="Current note and rest marker preview">
            <div className="score-marker-preview-lines" aria-hidden="true" />
            <div className="score-marker-preview-example note"><span>Note</span><div className="score-marker-preview-wash" style={{ backgroundColor: resolvedScoreMarkerColor(scoreMarkerSettings, scoreTheme), opacity: scoreMarkerSettings.opacity / 100 }} /><div className="score-marker-preview-line" /><b aria-hidden="true">&#9834;</b></div>
            <div className="score-marker-preview-example rest"><span>Rest</span><div className="score-marker-preview-wash" style={{ backgroundColor: resolvedScoreMarkerColor(scoreMarkerSettings, scoreTheme), opacity: scoreMarkerSettings.restOpacity / 100 }} /><div className="score-marker-preview-line" /><b aria-hidden="true">&#119102;</b></div>
          </div>
          <label className="score-marker-settings-row">Highlight colour <input aria-label="Current note marker colour" type="color" value={resolvedScoreMarkerColor(scoreMarkerSettings, scoreTheme)} onChange={(event) => onScoreMarkerSettingsChange({ color: event.target.value as `#${string}` })} /></label>
          <label className="score-marker-settings-row">Opacity <input aria-label="Current note marker opacity" type="range" min="0" max="100" step="1" value={scoreMarkerSettings.opacity} onChange={(event) => onScoreMarkerSettingsChange({ opacity: Number(event.target.value) })} /><strong>{scoreMarkerSettings.opacity}%</strong></label>
          <label className="score-marker-settings-row">Rest opacity <input aria-label="Current rest marker opacity" type="range" min="0" max="100" step="1" value={scoreMarkerSettings.restOpacity} onChange={(event) => onScoreMarkerSettingsChange({ restOpacity: Number(event.target.value) })} /><strong>{scoreMarkerSettings.restOpacity}%</strong></label>
          <button type="button" onClick={onResetScoreMarkerSettings}>Reset marker</button>
          </div></div>
        </section> : null}
        {activeTab === "piano" ? <section id="settings-panel-piano" className="settings-section" role="tabpanel" aria-labelledby="settings-tab-piano">
          <h3 id="piano-settings-title">Piano</h3>
          <div className="settings-card">
          <div className="piano-color-settings">
            <label>Expected <input type="color" value={pianoSettings.expectedColor} onChange={(event) => onPianoSettingsChange({ expectedColor: event.target.value })} /></label>
            <label>Correct <input type="color" value={pianoSettings.correctColor} onChange={(event) => onPianoSettingsChange({ correctColor: event.target.value })} /></label>
            <label>Wrong <input type="color" value={pianoSettings.wrongColor} onChange={(event) => onPianoSettingsChange({ wrongColor: event.target.value })} /></label>
            <label>See Note <input aria-label="See Note colour" type="color" value={pianoSettings.seeNoteColor} onChange={(event) => onPianoSettingsChange({ seeNoteColor: event.target.value })} /></label>
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
            <label>Fallback tempo (BPM)<input type="number" min="30" max="300" step="1" value={playSettings.fallbackBpm} onChange={(event) => onPlaySettingsChange({ fallbackBpm: clampSetting(event.target.value, 30, 300) })} /></label>
            <label>Hit tolerance (ms)<input type="number" min="0" max="1000" step="25" value={playSettings.hitToleranceMs} onChange={(event) => onPlaySettingsChange({ hitToleranceMs: clampSetting(event.target.value, 0, 1000) })} /></label>
            <label className="play-checkbox-setting">Play fullscreen<input type="checkbox" checked={playSettings.playFullscreen} onChange={(event) => onPlaySettingsChange({ playFullscreen: event.target.checked })} /></label>
            <label className="play-checkbox-setting">Wait for piano before count-in<input type="checkbox" checked={playSettings.waitForMidiBeforeCountIn} onChange={(event) => onPlaySettingsChange({ waitForMidiBeforeCountIn: event.target.checked })} /></label>
          </div>
          <p className="settings-hint">When readiness wait is enabled, starting any playing mode arms the session and the first piano strike begins its normal count-in. That strike is not assessed. Loop restarts use the same readiness gesture without adding a second pause. Embedded score tempo is used when available. Tempo percentage and musical count-in are controlled from the metronome toolbar options.</p>
          </div>
        </section> : null}
        {activeTab === "learning" ? <section id="settings-panel-learning" className="settings-section" role="tabpanel" aria-labelledby="settings-tab-learning">
          <h3>Learning</h3>
          <div className="settings-card learning-settings-card">
            <span className="settings-label">Tempo build-up</span>
            <p className="settings-card-copy">Choose how much preparation new Guided Practice plans include before the two qualifying runs at written tempo.</p>
            <div className="learning-preset-choices" role="radiogroup" aria-label="Tempo build-up">
              {(Object.entries(TEMPO_BUILD_UP_PRESETS) as [TempoBuildUpPreset, (typeof TEMPO_BUILD_UP_PRESETS)[TempoBuildUpPreset]][]).map(([id, preset]) => <label key={id} className={learningSettings.tempoBuildUp === id ? "selected" : ""}>
                <input type="radio" name="tempo-build-up" value={id} checked={learningSettings.tempoBuildUp === id} onChange={() => onLearningSettingsChange({ tempoBuildUp: id })} />
                <span><strong>{preset.label}</strong><small>{preset.description}</small></span>
              </label>)}
            </div>
            <p className="settings-hint">This preference applies when you create a new guided plan. Existing plans keep their current progression.</p>
          </div>
        </section> : null}
        {activeTab === "controls" ? <section id="settings-panel-controls" className="settings-section" role="tabpanel" aria-labelledby="settings-tab-controls">
          <h3>Piano shortcuts</h3>
          <div className="settings-card piano-shortcut-settings">
            <label className="play-checkbox-setting">Enable piano shortcuts<input type="checkbox" checked={shortcutSettings.enabled} onChange={(event) => onShortcutSettingsChange({ enabled: event.target.checked })} /></label>
            <p className="settings-hint">Hold the modifier, then press an action key. Recognised shortcut notes are kept out of lesson assessment. Shortcuts operate only while Guided Practice is open.</p>
            <div className="piano-shortcut-bindings">
              {(["modifier", "primary", "previous", "repeat", "toggle-loop", "stop"] as PianoShortcutBindingKey[]).map((key) => {
                const note = key === "modifier" ? shortcutSettings.modifier : shortcutSettings.bindings[key];
                const label = key === "modifier" ? "Modifier" : key === "toggle-loop" ? "Toggle loop" : `${key[0].toUpperCase()}${key.slice(1)}`;
                return <div key={key}><span><strong>{label}</strong><small>{midiNoteToName(note)} · MIDI {note}</small></span><button type="button" className={shortcutCaptureTarget === key ? "selected" : ""} onClick={() => onShortcutCapture(shortcutCaptureTarget === key ? undefined : key)}>{shortcutCaptureTarget === key ? "Press a piano key…" : "Set key"}</button></div>;
              })}
            </div>
            {shortcutConflicts(shortcutSettings).length > 0 ? <p className="error">Each shortcut needs a different key. Change: {shortcutConflicts(shortcutSettings).join(", ")}.</p> : null}
            {shortcutNotice ? <p className="shortcut-capture-notice" role="status">{shortcutNotice}</p> : null}
            <label className="play-checkbox-setting">Show shortcut hints in lessons<input type="checkbox" checked={shortcutSettings.showHints} onChange={(event) => onShortcutSettingsChange({ showHints: event.target.checked })} /></label>
            <button type="button" className="secondary-button" onClick={() => { onShortcutCapture(undefined); onResetShortcuts(); }}>Restore defaults</button>
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

function ExpectedEvent({ event, index, total, isComplete, simulationDisabled, onSimulate }: { event: ScoreEvent; index: number; total: number; isComplete: boolean; simulationDisabled: boolean; onSimulate: () => void }) {
  const arpeggio = arpeggioSequenceForEvent(event);
  const chordNotes = arpeggio ? event.midiNotes.filter((note) => !arpeggio.includes(note)) : [];
  const simulationLabel = arpeggio ? "Simulate current event" : event.midiNotes.length === 1 ? "Simulate current note" : "Simulate current chord";
  const arpeggioLabel = arpeggio ? `Arpeggio ${event.noteDetails.find((note) => note.arpeggio)?.arpeggio?.direction === "down" ? "↓" : "↑"}: ${formatNotes(arpeggio)}` : undefined;
  return (
    <div className="expected-event">
      <p className="event-count">Event {index + 1} of {total}{isComplete ? " complete" : ""}</p>
      <p className="note-set">{arpeggioLabel ? `${chordNotes.length ? `Chord ${formatNotes(chordNotes)} + ` : ""}${arpeggioLabel}` : formatNotes(event.midiNotes)}</p>
      <p className="muted">Measure {event.measureNumber}; start {event.startQuarter.toFixed(2)} quarters; duration {event.durationQuarters.toFixed(2)} quarters.</p>
      <button type="button" className="simulate-event-button" onClick={onSimulate} disabled={simulationDisabled}>{simulationLabel}</button>
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
