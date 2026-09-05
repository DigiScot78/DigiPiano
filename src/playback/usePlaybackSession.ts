import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HandMode, PracticeRunMode, ScoreSelectionRange } from "../learning/matcher";
import type { MeasureTiming, ScoreEvent, TempoChange } from "../music/scoreTypes";
import { activeExpectedNotes, activePlaybackEvent, countInDisplayValue, createCountInPlan, createPlaybackPlan, gatePreviewStartMs, missedPerformanceNotes, playbackGates, playbackPlanFromElapsed, scorePerformanceAttempt, scoreQuarterAtElapsed, visualPlayheadAnchor, type CompletedPlaybackRun, type CountInPlan, type PerformanceResult, type PlaybackGate, type PlaybackPhase } from "./playback";
import type { PlaySettings } from "./settings";
import { ARPEGGIO_MAX_GAP_MS } from "../learning/matcher";

type ResumePhase = "playing" | "waiting-note";

function advanceGateWithNote(gate: PlaybackGate, note: number, receivedAtMs: number, heldNotes: readonly number[]) {
  if (!gate.expectedNotes.includes(note)) return { gate, complete: false };
  const held = new Set(heldNotes);
  const arpeggioNotes = gate.arpeggioNotes ?? [];
  const arpeggioSet = new Set(arpeggioNotes);
  const freshHeld = new Set(gate.satisfiedNotes.filter((satisfied) => arpeggioSet.has(satisfied) || held.has(satisfied)));
  let lastArpeggioAtMs = gate.lastArpeggioAtMs;
  if (arpeggioSet.has(note)) {
    const playedArpeggio = arpeggioNotes.filter((expected) => freshHeld.has(expected));
    const activeSequence = lastArpeggioAtMs !== undefined && receivedAtMs - lastArpeggioAtMs <= ARPEGGIO_MAX_GAP_MS ? playedArpeggio : [];
    const expected = arpeggioNotes[activeSequence.length];
    for (const arpeggioNote of arpeggioNotes) freshHeld.delete(arpeggioNote);
    if (note === expected) for (const played of [...activeSequence, note]) freshHeld.add(played);
    else if (note === arpeggioNotes[0]) freshHeld.add(note);
    lastArpeggioAtMs = receivedAtMs;
  } else if (held.has(note)) freshHeld.add(note);
  const satisfiedNotes = gate.expectedNotes.filter((expected) => freshHeld.has(expected));
  const nextGate = { ...gate, satisfiedNotes, lastArpeggioAtMs };
  return { gate: nextGate, complete: satisfiedNotes.length === gate.expectedNotes.length };
}

export function usePlaybackSession(options: { events: ScoreEvent[]; tempoChanges: TempoChange[]; measureTimings?: MeasureTiming[]; tempoPercent?: number; handMode: HandMode; range?: ScoreSelectionRange; runMode: PracticeRunMode; pauseOnNotes: boolean; untimedPractice?: boolean; settings: PlaySettings }) {
  const { events, tempoChanges, measureTimings = [], tempoPercent = 100, handMode, range, runMode, pauseOnNotes, untimedPractice = false, settings } = options;
  const plan = useMemo(() => createPlaybackPlan(events, tempoChanges, settings.fallbackBpm, handMode, range, measureTimings, tempoPercent), [events, handMode, measureTimings, range, settings.fallbackBpm, tempoChanges, tempoPercent]);
  const gates = useMemo(() => plan ? playbackGates(plan) : [], [plan]);
  const [phase, setPhase] = useState<PlaybackPhase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [rollElapsedMs, setRollElapsedMs] = useState(0);
  const [audioStartElapsedMs, setAudioStartElapsedMs] = useState(0);
  const [countdownValue, setCountdownValue] = useState<number | undefined>();
  const [countdownBar, setCountdownBar] = useState<number | undefined>();
  const [countInPlan, setCountInPlan] = useState<CountInPlan>({ durationMs: 0, beats: [] });
  const [results, setResults] = useState<PerformanceResult[]>([]);
  const [completedRun, setCompletedRun] = useState<CompletedPlaybackRun | undefined>();
  const [showMissedNotes, setShowMissedNotes] = useState(false);
  const [gate, setGate] = useState<PlaybackGate | undefined>();
  const [carriedNotes, setCarriedNotes] = useState<number[]>([]);
  const [nextPendingGate, setNextPendingGate] = useState<PlaybackGate | undefined>();
  const [showStartCue, setShowStartCue] = useState(false);
  const [runId, setRunId] = useState(0);
  const [activeDurationMs, setActiveDurationMs] = useState(0);
  const [idealDurationMs, setIdealDurationMs] = useState(plan?.durationMs ?? 0);
  const [attemptStartElapsedMs, setAttemptStartElapsedMs] = useState(0);
  const countdownStartedAtRef = useRef(0);
  const countdownTargetElapsedRef = useRef(0);
  const resumePhaseRef = useRef<ResumePhase>("playing");
  const suspendedGateRef = useRef<PlaybackGate | undefined>(undefined);
  const playbackStartedAtRef = useRef(0);
  const attemptIdRef = useRef(0);
  const completionIdRef = useRef(0);
  const resultsRef = useRef<PerformanceResult[]>([]);
  const elapsedMsRef = useRef(0);
  const gateRef = useRef<PlaybackGate | undefined>(undefined);
  const armedGateRef = useRef<PlaybackGate | undefined>(undefined);
  const pauseOnNotesRef = useRef(pauseOnNotes);
  const untimedPracticeRef = useRef(untimedPractice);
  const passedGateOnsetsRef = useRef(new Set<number>());
  const startCueTimerRef = useRef<number | undefined>(undefined);
  const startCueEndsAtRef = useRef(0);
  const phaseRef = useRef<PlaybackPhase>(phase);
  const planRef = useRef(plan);
  const gatesRef = useRef(gates);
  const runModeRef = useRef(runMode);
  const attemptStartElapsedRef = useRef(0);
  const readyEventIndexRef = useRef<number | undefined>(undefined);
  const activeDurationMsRef = useRef(0);
  const activeClockStartedAtRef = useRef<number | undefined>(undefined);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { planRef.current = plan; }, [plan]);
  useEffect(() => { gatesRef.current = gates; }, [gates]);
  useEffect(() => { runModeRef.current = runMode; }, [runMode]);

  const updateActiveClock = useCallback((now: number) => {
    const active = activeDurationMsRef.current + (activeClockStartedAtRef.current === undefined ? 0 : Math.max(0, now - activeClockStartedAtRef.current));
    setActiveDurationMs(active);
    return active;
  }, []);

  const startActiveClock = useCallback((startedAt: number) => {
    if (activeClockStartedAtRef.current === undefined) activeClockStartedAtRef.current = startedAt;
    updateActiveClock(startedAt);
  }, [updateActiveClock]);

  const freezeActiveClock = useCallback((stoppedAt: number) => {
    if (activeClockStartedAtRef.current !== undefined) {
      activeDurationMsRef.current += Math.max(0, stoppedAt - activeClockStartedAtRef.current);
      activeClockStartedAtRef.current = undefined;
    }
    setActiveDurationMs(activeDurationMsRef.current);
    return activeDurationMsRef.current;
  }, []);

  const resetAttemptClock = useCallback((startElapsedMs = 0) => {
    attemptStartElapsedRef.current = startElapsedMs;
    setAttemptStartElapsedMs(startElapsedMs);
    activeDurationMsRef.current = 0;
    activeClockStartedAtRef.current = undefined;
    setActiveDurationMs(0);
    setIdealDurationMs(Math.max(0, (planRef.current?.durationMs ?? 0) - startElapsedMs));
  }, []);

  const clearRecordedResults = useCallback(() => {
    resultsRef.current = [];
    setResults([]);
  }, []);

  const completeRun = useCallback((nextPhase: PlaybackPhase, completedAt = performance.now()) => {
    const activePlan = planRef.current;
    const finalActiveDurationMs = freezeActiveClock(completedAt);
    if (activePlan) {
      const assessmentPlan = playbackPlanFromElapsed(activePlan, attemptStartElapsedRef.current);
      setCompletedRun({ id: ++completionIdRef.current, plan: assessmentPlan, results: [...resultsRef.current], activeDurationMs: finalActiveDurationMs, idealDurationMs: assessmentPlan.durationMs, playMode: settings.playMode, handMode, tempoPercent, ...(range ? { range: { ...range } } : {}) });
    }
    setShowMissedNotes(true);
    armedGateRef.current = undefined;
    readyEventIndexRef.current = undefined;
    phaseRef.current = nextPhase;
    setPhase(nextPhase);
  }, [freezeActiveClock, handMode, range, settings.playMode, tempoPercent]);

  const displayStartCue = useCallback((startedAt = performance.now()) => {
    if (startCueTimerRef.current !== undefined) window.clearTimeout(startCueTimerRef.current);
    startCueEndsAtRef.current = startedAt + 300;
    setShowStartCue(true);
    startCueTimerRef.current = window.setTimeout(() => { setShowStartCue(false); startCueTimerRef.current = undefined; }, 300);
  }, []);

  const clearCue = useCallback(() => {
    setShowStartCue(false);
    if (startCueTimerRef.current !== undefined) { window.clearTimeout(startCueTimerRef.current); startCueTimerRef.current = undefined; }
  }, []);

  const enterGate = useCallback((nextGate: PlaybackGate, preserveSatisfied = false) => {
    const armedGate = armedGateRef.current?.onsetMs === nextGate.onsetMs ? armedGateRef.current : undefined;
    const activeGate = armedGate ?? (preserveSatisfied ? nextGate : { ...nextGate, satisfiedNotes: [] });
    armedGateRef.current = undefined;
    elapsedMsRef.current = activeGate.onsetMs;
    setElapsedMs(activeGate.onsetMs);
    setRollElapsedMs(activeGate.onsetMs);
    gateRef.current = activeGate;
    setGate(activeGate);
    setNextPendingGate(activeGate);
    suspendedGateRef.current = undefined;
    phaseRef.current = "waiting-note";
    setPhase("waiting-note");
  }, []);

  const stop = useCallback(() => {
    freezeActiveClock(performance.now());
    phaseRef.current = "idle";
    setPhase("idle");
    setCountdownValue(undefined);
    gateRef.current = undefined;
    suspendedGateRef.current = undefined;
    armedGateRef.current = undefined;
    readyEventIndexRef.current = undefined;
    setGate(undefined);
    setCarriedNotes([]);
    clearCue();
    setRunId((current) => current + 1);
  }, [clearCue, freezeActiveClock]);

  const reset = useCallback(() => {
    stop();
    elapsedMsRef.current = 0;
    countdownTargetElapsedRef.current = 0;
    setElapsedMs(0);
    setRollElapsedMs(0);
    setAudioStartElapsedMs(0);
    passedGateOnsetsRef.current.clear();
    setNextPendingGate(gatesRef.current[0]);
    clearRecordedResults();
    setShowMissedNotes(false);
    resetAttemptClock(0);
  }, [clearRecordedResults, resetAttemptClock, stop]);

  const beginCountdown = useCallback((targetElapsedMs: number, returnPhase: ResumePhase, resumeGate?: PlaybackGate, targetQuarter?: number) => {
    const activePlan = planRef.current;
    if (!activePlan) return;
    const target = Math.min(Math.max(targetElapsedMs, 0), activePlan.durationMs);
    countdownTargetElapsedRef.current = target;
    resumePhaseRef.current = returnPhase;
    suspendedGateRef.current = resumeGate;
    elapsedMsRef.current = target;
    setElapsedMs(target);
    setAudioStartElapsedMs(target);
    gateRef.current = undefined;
    setGate(undefined);
    clearCue();
    setRunId((current) => current + 1);
    const now = performance.now();
    if (untimedPracticeRef.current) {
      setCountInPlan({ durationMs: 0, beats: [] });
      setCountdownValue(undefined);
      setCountdownBar(undefined);
      setRollElapsedMs(target);
      startActiveClock(now);
      if (returnPhase === "waiting-note" && resumeGate) enterGate(resumeGate, true);
      else { phaseRef.current = "playing"; setPhase("playing"); }
      return;
    }
    const countIn = createCountInPlan(target, targetQuarter ?? scoreQuarterAtElapsed(activePlan, target, tempoChanges, settings.fallbackBpm, tempoPercent), settings.countInBars, measureTimings, tempoChanges, settings.fallbackBpm, tempoPercent);
    setCountInPlan(countIn);
    if (countIn.durationMs === 0) {
      playbackStartedAtRef.current = now - target;
      startActiveClock(now);
      displayStartCue(now);
      setCountdownValue(undefined);
      if (returnPhase === "waiting-note" && resumeGate) enterGate(resumeGate, true);
      else { phaseRef.current = "playing"; setPhase("playing"); setRollElapsedMs(target); }
      return;
    }
    countdownStartedAtRef.current = now;
    setRollElapsedMs(target - countIn.durationMs);
    setCountdownValue(countIn.beats[0] ? countInDisplayValue(countIn.beats[0]) : undefined);
    setCountdownBar(countIn.beats[0]?.bar);
    phaseRef.current = "countdown";
    setPhase("countdown");
  }, [clearCue, displayStartCue, enterGate, measureTimings, settings.countInBars, settings.fallbackBpm, startActiveClock, tempoChanges, tempoPercent]);

  const startAtEventNow = useCallback((eventIndex: number) => {
    const activePlan = planRef.current;
    const destination = activePlan?.events.find((item) => item.eventIndex === eventIndex) ?? activePlan?.events[0];
    if (!destination) return;
    clearRecordedResults();
    armedGateRef.current = undefined;
    resetAttemptClock(destination.onsetMs);
    setCarriedNotes([]);
    setShowMissedNotes(false);
    passedGateOnsetsRef.current = new Set(gatesRef.current.filter((item) => item.onsetMs < destination.onsetMs).map((item) => item.onsetMs));
    const usesGates = pauseOnNotesRef.current || untimedPracticeRef.current;
    const destinationGate = usesGates ? gatesRef.current.find((item) => Math.abs(item.onsetMs - destination.onsetMs) < 0.001) : undefined;
    setNextPendingGate(usesGates ? gatesRef.current.find((item) => item.onsetMs >= destination.onsetMs - 0.001) : undefined);
    const freshGate = destinationGate ? { ...destinationGate, satisfiedNotes: [] } : undefined;
    beginCountdown(destination.onsetMs, freshGate ? "waiting-note" : "playing", freshGate, destination.event.startQuarter);
  }, [beginCountdown, clearRecordedResults, resetAttemptClock]);

  const startAtEvent = useCallback((eventIndex: number) => {
    if (!settings.waitForMidiBeforeCountIn) {
      startAtEventNow(eventIndex);
      return;
    }
    const destination = planRef.current?.events.find((item) => item.eventIndex === eventIndex) ?? planRef.current?.events[0];
    if (!destination) return;
    clearRecordedResults();
    setShowMissedNotes(false);
    setCarriedNotes([]);
    readyEventIndexRef.current = destination.eventIndex;
    elapsedMsRef.current = destination.onsetMs;
    setElapsedMs(destination.onsetMs);
    setRollElapsedMs(destination.onsetMs);
    setAudioStartElapsedMs(destination.onsetMs);
    setCountdownValue(undefined);
    setCountdownBar(undefined);
    clearCue();
    setRunId((current) => current + 1);
    phaseRef.current = "waiting-ready";
    setPhase("waiting-ready");
  }, [clearCue, clearRecordedResults, settings.waitForMidiBeforeCountIn, startAtEventNow]);

  const start = useCallback(() => {
    const firstEventIndex = plan?.events[0]?.eventIndex;
    if (firstEventIndex === undefined) return;
    if (phaseRef.current === "waiting-ready" || phaseRef.current === "waiting-restart") startAtEventNow(readyEventIndexRef.current ?? firstEventIndex);
    else startAtEvent(firstEventIndex);
  }, [plan, startAtEvent, startAtEventNow]);

  const pause = useCallback(() => {
    const currentPhase = phaseRef.current;
    if (currentPhase !== "playing" && currentPhase !== "countdown" && currentPhase !== "waiting-note") return;
    const pausedGate = currentPhase === "waiting-note" ? gateRef.current : suspendedGateRef.current;
    freezeActiveClock(performance.now());
    const target = currentPhase === "countdown" ? countdownTargetElapsedRef.current : pausedGate?.onsetMs ?? elapsedMsRef.current;
    elapsedMsRef.current = target;
    setElapsedMs(target);
    setRollElapsedMs(target);
    countdownTargetElapsedRef.current = target;
    resumePhaseRef.current = pausedGate ? "waiting-note" : "playing";
    suspendedGateRef.current = pausedGate;
    gateRef.current = undefined;
    setGate(undefined);
    setCountdownValue(undefined);
    setCountdownBar(undefined);
    clearCue();
    setRunId((current) => current + 1);
    phaseRef.current = "paused";
    setPhase("paused");
  }, [clearCue, freezeActiveClock]);

  const stopAtPlanStart = useCallback(() => {
    const currentPhase = phaseRef.current;
    if (currentPhase !== "playing" && currentPhase !== "countdown" && currentPhase !== "waiting-note" && currentPhase !== "paused" && currentPhase !== "waiting-ready" && currentPhase !== "waiting-restart") return;
    elapsedMsRef.current = 0;
    setElapsedMs(0);
    setRollElapsedMs(0);
    setAudioStartElapsedMs(0);
    countdownTargetElapsedRef.current = 0;
    resumePhaseRef.current = "playing";
    suspendedGateRef.current = undefined;
    gateRef.current = undefined;
    setGate(undefined);
    passedGateOnsetsRef.current.clear();
    setNextPendingGate((pauseOnNotesRef.current || untimedPracticeRef.current) ? gatesRef.current[0] : undefined);
    setCountdownValue(undefined);
    setShowMissedNotes(false);
    clearCue();
    setRunId((current) => current + 1);
    phaseRef.current = "idle";
    setPhase("idle");
    freezeActiveClock(performance.now());
  }, [clearCue, freezeActiveClock]);

  const resume = useCallback(() => { if (phaseRef.current === "paused") beginCountdown(countdownTargetElapsedRef.current, resumePhaseRef.current, suspendedGateRef.current); }, [beginCountdown]);
  const togglePlayback = useCallback(() => {
    if (phaseRef.current === "idle" || phaseRef.current === "waiting-ready" || phaseRef.current === "waiting-restart") start();
    else if (phaseRef.current === "paused") resume();
    else pause();
  }, [pause, resume, start]);

  const seekToEvent = useCallback((eventIndex: number) => {
    const destination = planRef.current?.events.find((item) => item.eventIndex === eventIndex);
    if (!destination) return;
    const target = destination.onsetMs;
    armedGateRef.current = undefined;
    resetAttemptClock(target);
    const destinationGate = pauseOnNotesRef.current ? gatesRef.current.find((item) => Math.abs(item.onsetMs - target) < 0.001) : undefined;
    passedGateOnsetsRef.current = new Set(gatesRef.current.filter((item) => item.onsetMs < target).map((item) => item.onsetMs));
    setNextPendingGate(pauseOnNotesRef.current ? gatesRef.current.find((item) => item.onsetMs >= target - 0.001) : undefined);
    countdownTargetElapsedRef.current = target;
    resumePhaseRef.current = destinationGate ? "waiting-note" : "playing";
    suspendedGateRef.current = destinationGate ? { ...destinationGate, satisfiedNotes: [] } : undefined;
    gateRef.current = undefined;
    setGate(undefined);
    elapsedMsRef.current = target;
    setElapsedMs(target);
    setRollElapsedMs(target);
    setAudioStartElapsedMs(target);
    setCountdownValue(undefined);
    clearCue();
    clearRecordedResults();
    setShowMissedNotes(false);
    setRunId((current) => current + 1);
    phaseRef.current = "paused";
    setPhase("paused");
  }, [clearCue, clearRecordedResults, resetAttemptClock]);

  useEffect(() => {
    if (phase !== "countdown" && phase !== "playing") return;
    let frame = 0;
    const tick = (now: number) => {
      if (showStartCue && now >= startCueEndsAtRef.current) setShowStartCue(false);
      if (phaseRef.current === "countdown") {
        const countdownElapsed = now - countdownStartedAtRef.current;
        const countdownDuration = countInPlan.durationMs;
        const target = countdownTargetElapsedRef.current;
        if (countdownElapsed >= countdownDuration) {
          setRollElapsedMs(target);
          playbackStartedAtRef.current = countdownStartedAtRef.current + countdownDuration - target;
          startActiveClock(countdownStartedAtRef.current + countdownDuration);
          displayStartCue(countdownStartedAtRef.current + countdownDuration);
          setCountdownValue(undefined);
          setCountdownBar(undefined);
          if (resumePhaseRef.current === "waiting-note" && suspendedGateRef.current) enterGate(suspendedGateRef.current, true);
          else { suspendedGateRef.current = undefined; phaseRef.current = "playing"; setPhase("playing"); }
        } else {
          const remaining = countdownDuration - countdownElapsed;
          setRollElapsedMs(target - remaining);
          const playhead = target - remaining;
          const activeBeat = [...countInPlan.beats].reverse().find((beat) => beat.onsetMs <= playhead + 0.001) ?? countInPlan.beats[0];
          setCountdownValue(activeBeat ? countInDisplayValue(activeBeat) : undefined);
          setCountdownBar(activeBeat?.bar);
        }
      } else if (phaseRef.current === "playing" && planRef.current) {
        updateActiveClock(now);
        const elapsed = Math.max(0, now - playbackStartedAtRef.current);
        const nextGate = pauseOnNotesRef.current ? gatesRef.current.find((item) => !passedGateOnsetsRef.current.has(item.onsetMs) && item.onsetMs > elapsedMsRef.current && item.onsetMs <= elapsed) : undefined;
        if (nextGate) { enterGate(nextGate); return; }
        elapsedMsRef.current = Math.min(elapsed, planRef.current.durationMs);
        setElapsedMs(elapsedMsRef.current);
        setRollElapsedMs(elapsedMsRef.current);
        if (elapsed >= planRef.current.durationMs) {
          const nextPhase = runModeRef.current === "loop" ? "waiting-restart" : "idle";
          completeRun(nextPhase, playbackStartedAtRef.current + planRef.current.durationMs);
        }
      }
      if (phaseRef.current === "countdown" || phaseRef.current === "playing") frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [completeRun, countInPlan, displayStartCue, enterGate, phase, showStartCue, startActiveClock, updateActiveClock]);

  useEffect(() => {
    if (phase !== "waiting-note") return;
    let frame = 0;
    const tick = (now: number) => {
      updateActiveClock(now);
      if (phaseRef.current === "waiting-note") frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, updateActiveClock]);

  useEffect(() => {
    if (runMode !== "once" || phaseRef.current !== "waiting-restart") return;
    phaseRef.current = "idle";
    setPhase("idle");
  }, [runMode]);

  useEffect(() => {
    pauseOnNotesRef.current = pauseOnNotes;
    untimedPracticeRef.current = untimedPractice;
    if (pauseOnNotes || untimedPractice) {
      setNextPendingGate(gatesRef.current.find((item) => !passedGateOnsetsRef.current.has(item.onsetMs) && item.onsetMs >= elapsedMsRef.current - 0.001));
    } else {
      setNextPendingGate(undefined);
    }
    if (!pauseOnNotes && phaseRef.current === "paused" && suspendedGateRef.current) {
      suspendedGateRef.current = undefined;
      resumePhaseRef.current = "playing";
      return;
    }
    if (!pauseOnNotes) armedGateRef.current = undefined;
    if (pauseOnNotes || untimedPractice || phaseRef.current !== "waiting-note" || !gateRef.current) return;
    const gateOnsetMs = gateRef.current.onsetMs;
    passedGateOnsetsRef.current.add(gateOnsetMs);
    setNextPendingGate(gatesRef.current.find((item) => !passedGateOnsetsRef.current.has(item.onsetMs)));
    playbackStartedAtRef.current = performance.now() - gateOnsetMs;
    gateRef.current = undefined;
    setGate(undefined);
    phaseRef.current = "playing";
    setPhase("playing");
    setRollElapsedMs(gateOnsetMs);
  }, [pauseOnNotes, untimedPractice]);

  useEffect(() => () => { if (startCueTimerRef.current !== undefined) window.clearTimeout(startCueTimerRef.current); }, []);
  useEffect(() => {
    if (phaseRef.current !== "idle") stop();
    resetAttemptClock(0);
  }, [events, handMode, range, resetAttemptClock, settings.countInBars, settings.fallbackBpm, settings.hitToleranceMs, settings.waitForMidiBeforeCountIn, stop, tempoPercent]);

  const handleMidiNoteOn = useCallback((note: number, receivedAtMs: number, heldNotes: readonly number[] = [note], gateOnly = false) => {
    if (phaseRef.current === "waiting-ready") {
      const eventIndex = readyEventIndexRef.current ?? planRef.current?.events[0]?.eventIndex;
      if (eventIndex !== undefined) startAtEventNow(eventIndex);
      return;
    }
    if (phaseRef.current === "waiting-restart") { start(); return; }
    const activePlan = planRef.current;
    if ((phaseRef.current !== "playing" && phaseRef.current !== "waiting-note") || !activePlan) return;
    const activeGate = gateRef.current;
    if (gateOnly && !activeGate) return;
    const noteElapsed = activeGate?.onsetMs ?? Math.min(Math.max(receivedAtMs - playbackStartedAtRef.current, 0), activePlan.durationMs);
    const attemptId = ++attemptIdRef.current;
    const result = scorePerformanceAttempt(note, noteElapsed, receivedAtMs, attemptId, activePlan, tempoChanges, settings.fallbackBpm, settings.hitToleranceMs, resultsRef.current, tempoPercent);
    if (result) {
      resultsRef.current = [...resultsRef.current, result];
      setResults(resultsRef.current);
    }
    if (!activeGate) {
      if (!pauseOnNotesRef.current || phaseRef.current !== "playing" || result?.result !== "correct") return;
      const upcomingGate = armedGateRef.current ?? gatesRef.current.find((item) => !passedGateOnsetsRef.current.has(item.onsetMs) && item.onsetMs > elapsedMsRef.current + 0.001);
      if (!upcomingGate || !upcomingGate.eventIndices.includes(result.eventIndex) || noteElapsed < upcomingGate.onsetMs - settings.hitToleranceMs) return;
      const advanced = advanceGateWithNote(upcomingGate, note, receivedAtMs, heldNotes);
      if (!advanced.complete) {
        armedGateRef.current = advanced.gate;
        setNextPendingGate(advanced.gate);
        return;
      }
      armedGateRef.current = undefined;
      passedGateOnsetsRef.current.add(upcomingGate.onsetMs);
      setNextPendingGate(gatesRef.current.find((item) => !passedGateOnsetsRef.current.has(item.onsetMs)));
      return;
    }
    const advanced = advanceGateWithNote(activeGate, note, receivedAtMs, heldNotes);
    if (!advanced.complete) {
      gateRef.current = advanced.gate;
      setGate(advanced.gate);
      return;
    }
    const held = new Set(heldNotes);
    setCarriedNotes((current) => [...new Set([...current.filter((carried) => held.has(carried)), ...activeGate.expectedNotes.filter((expected) => held.has(expected))])].sort((a, b) => a - b));
    passedGateOnsetsRef.current.add(activeGate.onsetMs);
    const followingGate = gatesRef.current.find((item) => !passedGateOnsetsRef.current.has(item.onsetMs));
    setNextPendingGate(followingGate);
    if (untimedPracticeRef.current) {
      if (followingGate) enterGate(followingGate);
      else {
        gateRef.current = undefined;
        setGate(undefined);
        const nextPhase = runModeRef.current === "loop" ? "waiting-restart" : "idle";
        completeRun(nextPhase, receivedAtMs);
      }
      return;
    }
    playbackStartedAtRef.current = receivedAtMs - activeGate.onsetMs;
    gateRef.current = undefined;
    setGate(undefined);
    phaseRef.current = "playing";
    setPhase("playing");
  }, [completeRun, enterGate, settings.fallbackBpm, settings.hitToleranceMs, start, startAtEventNow, tempoChanges, tempoPercent]);

  const handleHeldNotesChange = useCallback((heldNotes: readonly number[]) => {
    const held = new Set(heldNotes);
    setCarriedNotes((current) => {
      const next = current.filter((note) => held.has(note));
      return next.length === current.length ? current : next;
    });
    const prune = (activeGate: PlaybackGate | undefined) => activeGate ? { ...activeGate, satisfiedNotes: activeGate.satisfiedNotes.filter((note) => activeGate.arpeggioNotes?.includes(note) || held.has(note)) } : undefined;
    suspendedGateRef.current = prune(suspendedGateRef.current);
    const armedGate = prune(armedGateRef.current);
    if (armedGate && armedGate.satisfiedNotes.length !== armedGateRef.current?.satisfiedNotes.length) {
      armedGateRef.current = armedGate;
      setNextPendingGate(armedGate);
    }
    if (phaseRef.current !== "waiting-note" || !gateRef.current) return;
    const nextGate = prune(gateRef.current);
    if (!nextGate || nextGate.satisfiedNotes.length === gateRef.current.satisfiedNotes.length) return;
    gateRef.current = nextGate;
    setGate(nextGate);
  }, []);

  const current = phase !== "idle" && plan ? activePlaybackEvent(plan, elapsedMs) ?? plan.events[0] : undefined;
  const playheadAnchor = phase !== "idle" && plan ? visualPlayheadAnchor(plan, elapsedMs) : undefined;
  const previewGate = phase === "playing" && pauseOnNotes && nextPendingGate && elapsedMs + 0.001 >= gatePreviewStartMs(plan!, nextPendingGate, tempoChanges, settings.fallbackBpm, tempoPercent)
    ? nextPendingGate
    : undefined;
  const expectedNotes = phase === "waiting-note"
    ? gate?.expectedNotes ?? []
    : phase === "playing" && pauseOnNotes
      ? previewGate?.expectedNotes ?? []
      : phase === "playing" && plan
        ? activeExpectedNotes(plan, elapsedMs)
        : [];
  const expectedEventIndices = phase === "waiting-note"
    ? gate?.eventIndices ?? []
    : phase === "playing" && pauseOnNotes
      ? previewGate?.eventIndices ?? []
      : phase === "playing" && plan
        ? plan.events.filter((item) => item.onsetMs <= elapsedMs && elapsedMs < item.endMs).map((item) => item.eventIndex)
        : [];
  const expectationStrength = phase === "waiting-note" ? "active" as const : previewGate ? "preview" as const : expectedNotes.length ? "active" as const : undefined;
  const assessmentPlan = plan ? playbackPlanFromElapsed(plan, attemptStartElapsedMs) : undefined;
  const missedNotes = showMissedNotes && !pauseOnNotes ? missedPerformanceNotes(assessmentPlan, results) : [];
  const clearResults = useCallback(() => { clearRecordedResults(); setShowMissedNotes(false); }, [clearRecordedResults]);
  return { phase, plan, elapsedMs, rollElapsedMs, audioStartElapsedMs, activeDurationMs, idealDurationMs, remainingDurationMs: idealDurationMs - activeDurationMs, runId, countdownValue, countdownBar, countInPlan, playheadAnchor, showStartCue, gate, carriedNotes, nextPendingGateOnsetMs: nextPendingGate?.onsetMs, results, missedNotes, completedRun, currentEventIndex: current?.eventIndex, currentEvent: current?.event, expectedNotes, expectedEventIndices, expectationStrength, start, startAtEvent, startAtEventImmediately: startAtEventNow, pause, resume, stopAtPlanStart, togglePlayback, seekToEvent, stop, reset, clearResults, handleMidiNoteOn, handleHeldNotesChange };
}
