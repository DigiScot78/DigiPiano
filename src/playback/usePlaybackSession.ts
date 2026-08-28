import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HandMode, PracticeRunMode, ScoreSelectionRange } from "../learning/matcher";
import type { ScoreEvent, TempoChange } from "../music/scoreTypes";
import { activeExpectedNotes, activePlaybackEvent, createPlaybackPlan, missedPerformanceNotes, playbackGates, scoreGatedPerformanceAttempt, scorePerformanceAttempt, type PerformanceResult, type PlaybackGate, type PlaybackPhase } from "./playback";
import type { PlaySettings } from "./settings";

type ResumePhase = "playing" | "waiting-note";

export function usePlaybackSession(options: { events: ScoreEvent[]; tempoChanges: TempoChange[]; handMode: HandMode; range?: ScoreSelectionRange; runMode: PracticeRunMode; pauseOnNotes: boolean; settings: PlaySettings }) {
  const { events, tempoChanges, handMode, range, runMode, pauseOnNotes, settings } = options;
  const plan = useMemo(() => createPlaybackPlan(events, tempoChanges, settings.fallbackBpm, handMode, range), [events, handMode, range, settings.fallbackBpm, tempoChanges]);
  const gates = useMemo(() => plan ? playbackGates(plan) : [], [plan]);
  const [phase, setPhase] = useState<PlaybackPhase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [rollElapsedMs, setRollElapsedMs] = useState(0);
  const [audioStartElapsedMs, setAudioStartElapsedMs] = useState(0);
  const [countdownValue, setCountdownValue] = useState<number | undefined>();
  const [results, setResults] = useState<PerformanceResult[]>([]);
  const [showMissedNotes, setShowMissedNotes] = useState(false);
  const [gate, setGate] = useState<PlaybackGate | undefined>();
  const [showStartCue, setShowStartCue] = useState(false);
  const [runId, setRunId] = useState(0);
  const countdownStartedAtRef = useRef(0);
  const countdownTargetElapsedRef = useRef(0);
  const resumePhaseRef = useRef<ResumePhase>("playing");
  const suspendedGateRef = useRef<PlaybackGate | undefined>(undefined);
  const playbackStartedAtRef = useRef(0);
  const attemptIdRef = useRef(0);
  const elapsedMsRef = useRef(0);
  const gateRef = useRef<PlaybackGate | undefined>(undefined);
  const pauseOnNotesRef = useRef(pauseOnNotes);
  const passedGateOnsetsRef = useRef(new Set<number>());
  const startCueTimerRef = useRef<number | undefined>(undefined);
  const startCueEndsAtRef = useRef(0);
  const phaseRef = useRef<PlaybackPhase>(phase);
  const planRef = useRef(plan);
  const gatesRef = useRef(gates);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { planRef.current = plan; }, [plan]);
  useEffect(() => { gatesRef.current = gates; }, [gates]);

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
    const activeGate = preserveSatisfied ? nextGate : { ...nextGate, satisfiedNotes: [] };
    elapsedMsRef.current = activeGate.onsetMs;
    setElapsedMs(activeGate.onsetMs);
    setRollElapsedMs(activeGate.onsetMs);
    gateRef.current = activeGate;
    setGate(activeGate);
    suspendedGateRef.current = undefined;
    phaseRef.current = "waiting-note";
    setPhase("waiting-note");
  }, []);

  const stop = useCallback(() => {
    phaseRef.current = "idle";
    setPhase("idle");
    setCountdownValue(undefined);
    gateRef.current = undefined;
    suspendedGateRef.current = undefined;
    setGate(undefined);
    clearCue();
    setRunId((current) => current + 1);
  }, [clearCue]);

  const reset = useCallback(() => {
    stop();
    elapsedMsRef.current = 0;
    countdownTargetElapsedRef.current = 0;
    setElapsedMs(0);
    setRollElapsedMs(0);
    setAudioStartElapsedMs(0);
    passedGateOnsetsRef.current.clear();
    setResults([]);
    setShowMissedNotes(false);
  }, [stop]);

  const beginCountdown = useCallback((targetElapsedMs: number, returnPhase: ResumePhase, resumeGate?: PlaybackGate) => {
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
    if (settings.countdownSeconds === 0) {
      playbackStartedAtRef.current = now - target;
      displayStartCue(now);
      setCountdownValue(undefined);
      if (returnPhase === "waiting-note" && resumeGate) enterGate(resumeGate, true);
      else { phaseRef.current = "playing"; setPhase("playing"); setRollElapsedMs(target); }
      return;
    }
    countdownStartedAtRef.current = now;
    setRollElapsedMs(target - settings.countdownSeconds * 1000);
    setCountdownValue(settings.countdownSeconds);
    phaseRef.current = "countdown";
    setPhase("countdown");
  }, [clearCue, displayStartCue, enterGate, settings.countdownSeconds]);

  const startAtEvent = useCallback((eventIndex: number) => {
    const activePlan = planRef.current;
    const destination = activePlan?.events.find((item) => item.eventIndex === eventIndex) ?? activePlan?.events[0];
    if (!destination) return;
    setResults([]);
    setShowMissedNotes(false);
    passedGateOnsetsRef.current = new Set(gatesRef.current.filter((item) => item.onsetMs < destination.onsetMs).map((item) => item.onsetMs));
    const destinationGate = pauseOnNotesRef.current ? gatesRef.current.find((item) => Math.abs(item.onsetMs - destination.onsetMs) < 0.001) : undefined;
    const freshGate = destinationGate ? { ...destinationGate, satisfiedNotes: [] } : undefined;
    beginCountdown(destination.onsetMs, freshGate ? "waiting-note" : "playing", freshGate);
  }, [beginCountdown]);

  const start = useCallback(() => {
    const firstEventIndex = plan?.events[0]?.eventIndex;
    if (firstEventIndex !== undefined) startAtEvent(firstEventIndex);
  }, [plan, startAtEvent]);

  const pause = useCallback(() => {
    const currentPhase = phaseRef.current;
    if (currentPhase !== "playing" && currentPhase !== "countdown" && currentPhase !== "waiting-note") return;
    const pausedGate = currentPhase === "waiting-note" ? gateRef.current : suspendedGateRef.current;
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
    clearCue();
    setRunId((current) => current + 1);
    phaseRef.current = "paused";
    setPhase("paused");
  }, [clearCue]);

  const resume = useCallback(() => { if (phaseRef.current === "paused") beginCountdown(countdownTargetElapsedRef.current, resumePhaseRef.current, suspendedGateRef.current); }, [beginCountdown]);
  const togglePlayback = useCallback(() => {
    if (phaseRef.current === "idle" || phaseRef.current === "waiting-restart") start();
    else if (phaseRef.current === "paused") resume();
    else pause();
  }, [pause, resume, start]);

  const seekToEvent = useCallback((eventIndex: number) => {
    const destination = planRef.current?.events.find((item) => item.eventIndex === eventIndex);
    if (!destination) return;
    const target = destination.onsetMs;
    const destinationGate = pauseOnNotesRef.current ? gatesRef.current.find((item) => Math.abs(item.onsetMs - target) < 0.001) : undefined;
    passedGateOnsetsRef.current = new Set(gatesRef.current.filter((item) => item.onsetMs < target).map((item) => item.onsetMs));
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
    setResults([]);
    setShowMissedNotes(false);
    setRunId((current) => current + 1);
    phaseRef.current = "paused";
    setPhase("paused");
  }, [clearCue]);

  useEffect(() => {
    if (phase !== "countdown" && phase !== "playing") return;
    let frame = 0;
    const tick = (now: number) => {
      if (showStartCue && now >= startCueEndsAtRef.current) setShowStartCue(false);
      if (phaseRef.current === "countdown") {
        const countdownElapsed = now - countdownStartedAtRef.current;
        const countdownDuration = settings.countdownSeconds * 1000;
        const target = countdownTargetElapsedRef.current;
        if (countdownElapsed >= countdownDuration) {
          setRollElapsedMs(target);
          playbackStartedAtRef.current = countdownStartedAtRef.current + countdownDuration - target;
          displayStartCue(countdownStartedAtRef.current + countdownDuration);
          setCountdownValue(undefined);
          if (resumePhaseRef.current === "waiting-note" && suspendedGateRef.current) enterGate(suspendedGateRef.current, true);
          else { suspendedGateRef.current = undefined; phaseRef.current = "playing"; setPhase("playing"); }
        } else {
          const remaining = countdownDuration - countdownElapsed;
          setRollElapsedMs(target - remaining);
          setCountdownValue(Math.ceil(remaining / 1000));
        }
      } else if (phaseRef.current === "playing" && planRef.current) {
        const elapsed = Math.max(0, now - playbackStartedAtRef.current);
        const nextGate = pauseOnNotesRef.current ? gatesRef.current.find((item) => !passedGateOnsetsRef.current.has(item.onsetMs) && item.onsetMs > elapsedMsRef.current && item.onsetMs <= elapsed) : undefined;
        if (nextGate) { enterGate(nextGate); return; }
        elapsedMsRef.current = Math.min(elapsed, planRef.current.durationMs);
        setElapsedMs(elapsedMsRef.current);
        setRollElapsedMs(elapsedMsRef.current);
        if (elapsed >= planRef.current.durationMs) {
          setShowMissedNotes(true);
          const nextPhase = runMode === "loop" ? "waiting-restart" : "idle";
          phaseRef.current = nextPhase;
          setPhase(nextPhase);
        }
      }
      if (phaseRef.current === "countdown" || phaseRef.current === "playing") frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [displayStartCue, enterGate, phase, runMode, settings.countdownSeconds, showStartCue]);

  useEffect(() => {
    pauseOnNotesRef.current = pauseOnNotes;
    if (!pauseOnNotes && phaseRef.current === "paused" && suspendedGateRef.current) {
      suspendedGateRef.current = undefined;
      resumePhaseRef.current = "playing";
      return;
    }
    if (pauseOnNotes || phaseRef.current !== "waiting-note" || !gateRef.current) return;
    const gateOnsetMs = gateRef.current.onsetMs;
    passedGateOnsetsRef.current.add(gateOnsetMs);
    playbackStartedAtRef.current = performance.now() - gateOnsetMs;
    gateRef.current = undefined;
    setGate(undefined);
    phaseRef.current = "playing";
    setPhase("playing");
    setRollElapsedMs(gateOnsetMs);
  }, [pauseOnNotes]);

  useEffect(() => () => { if (startCueTimerRef.current !== undefined) window.clearTimeout(startCueTimerRef.current); }, []);
  useEffect(() => { if (phaseRef.current !== "idle") stop(); }, [events, handMode, range, settings.countdownSeconds, settings.fallbackBpm, settings.hitToleranceMs, stop]);

  const handleMidiNoteOn = useCallback((note: number, receivedAtMs: number) => {
    if (phaseRef.current === "waiting-restart") { start(); return; }
    const activePlan = planRef.current;
    if ((phaseRef.current !== "playing" && phaseRef.current !== "waiting-note") || !activePlan) return;
    const activeGate = gateRef.current;
    const noteElapsed = activeGate?.onsetMs ?? Math.min(Math.max(receivedAtMs - playbackStartedAtRef.current, 0), activePlan.durationMs);
    const matchingGateSlotCount = activeGate ? activePlan.events.filter((item) => Math.abs(item.onsetMs - activeGate.onsetMs) < 0.001 && item.event.midiNotes.includes(note)).length : 0;
    const firstAttemptId = attemptIdRef.current + 1;
    attemptIdRef.current += Math.max(1, matchingGateSlotCount);
    setResults((current) => {
      if (activeGate) {
        const gateResults = scoreGatedPerformanceAttempt(note, activeGate, receivedAtMs, firstAttemptId, activePlan, tempoChanges, settings.fallbackBpm, current);
        return gateResults.length ? [...current, ...gateResults] : current;
      }
      const result = scorePerformanceAttempt(note, noteElapsed, receivedAtMs, firstAttemptId, activePlan, tempoChanges, settings.fallbackBpm, settings.hitToleranceMs, current);
      return result ? [...current, result] : current;
    });
    if (!activeGate || !activeGate.expectedNotes.includes(note) || activeGate.satisfiedNotes.includes(note)) return;
    const nextSatisfied = [...activeGate.satisfiedNotes, note].sort((a, b) => a - b);
    if (nextSatisfied.length < activeGate.expectedNotes.length) {
      const nextGate = { ...activeGate, satisfiedNotes: nextSatisfied };
      gateRef.current = nextGate;
      setGate(nextGate);
      return;
    }
    passedGateOnsetsRef.current.add(activeGate.onsetMs);
    playbackStartedAtRef.current = receivedAtMs - activeGate.onsetMs;
    gateRef.current = undefined;
    setGate(undefined);
    phaseRef.current = "playing";
    setPhase("playing");
  }, [settings.fallbackBpm, settings.hitToleranceMs, start, tempoChanges]);

  const current = phase !== "idle" && plan ? activePlaybackEvent(plan, elapsedMs) ?? plan.events[0] : undefined;
  const expectedNotes = phase === "waiting-note" ? gate?.expectedNotes ?? [] : phase === "playing" && plan ? activeExpectedNotes(plan, elapsedMs) : [];
  const missedNotes = showMissedNotes ? missedPerformanceNotes(plan, results) : [];
  const clearResults = useCallback(() => { setResults([]); setShowMissedNotes(false); }, []);
  return { phase, plan, elapsedMs, rollElapsedMs, audioStartElapsedMs, runId, countdownValue, showStartCue, gate, results, missedNotes, currentEventIndex: current?.eventIndex, currentEvent: current?.event, expectedNotes, start, startAtEvent, pause, resume, togglePlayback, seekToEvent, stop, reset, clearResults, handleMidiNoteOn };
}
