import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HandMode, PracticeRunMode, ScoreSelectionRange } from "../learning/matcher";
import type { ScoreEvent, TempoChange } from "../music/scoreTypes";
import { activeExpectedNotes, activePlaybackEvent, createPlaybackPlan, missedPerformanceNotes, playbackGates, scoreGatedPerformanceAttempt, scorePerformanceAttempt, type PerformanceResult, type PlaybackGate, type PlaybackPhase } from "./playback";
import type { PlaySettings } from "./settings";

export function usePlaybackSession(options: { events: ScoreEvent[]; tempoChanges: TempoChange[]; handMode: HandMode; range?: ScoreSelectionRange; runMode: PracticeRunMode; pauseOnNotes: boolean; settings: PlaySettings }) {
  const { events, tempoChanges, handMode, range, runMode, pauseOnNotes, settings } = options;
  const plan = useMemo(() => createPlaybackPlan(events, tempoChanges, settings.fallbackBpm, handMode, range), [events, handMode, range, settings.fallbackBpm, tempoChanges]);
  const gates = useMemo(() => plan ? playbackGates(plan) : [], [plan]);
  const [phase, setPhase] = useState<PlaybackPhase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [rollElapsedMs, setRollElapsedMs] = useState(0);
  const [countdownValue, setCountdownValue] = useState<number | undefined>();
  const [results, setResults] = useState<PerformanceResult[]>([]);
  const [showMissedNotes, setShowMissedNotes] = useState(false);
  const [gate, setGate] = useState<PlaybackGate | undefined>();
  const [showStartCue, setShowStartCue] = useState(false);
  const [runId, setRunId] = useState(0);
  const countdownStartedAtRef = useRef(0);
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
    startCueTimerRef.current = window.setTimeout(() => {
      setShowStartCue(false);
      startCueTimerRef.current = undefined;
    }, 300);
  }, []);

  const enterGate = useCallback((nextGate: PlaybackGate) => {
    const freshGate = { ...nextGate, satisfiedNotes: [] };
    elapsedMsRef.current = freshGate.onsetMs;
    setElapsedMs(freshGate.onsetMs);
    setRollElapsedMs(freshGate.onsetMs);
    gateRef.current = freshGate;
    setGate(freshGate);
    phaseRef.current = "waiting-note";
    setPhase("waiting-note");
  }, []);

  const stop = useCallback(() => {
    phaseRef.current = "idle";
    setPhase("idle");
    setCountdownValue(undefined);
    gateRef.current = undefined;
    setGate(undefined);
    setShowStartCue(false);
    if (startCueTimerRef.current !== undefined) window.clearTimeout(startCueTimerRef.current);
  }, []);

  const start = useCallback(() => {
    if (!plan) return;
    setRunId((current) => current + 1);
    setResults([]);
    setShowMissedNotes(false);
    setShowStartCue(false);
    if (startCueTimerRef.current !== undefined) window.clearTimeout(startCueTimerRef.current);
    setElapsedMs(0);
    setRollElapsedMs(settings.countdownSeconds > 0 ? -settings.countdownSeconds * 1000 : 0);
    elapsedMsRef.current = 0;
    gateRef.current = undefined;
    setGate(undefined);
    passedGateOnsetsRef.current.clear();
    const now = performance.now();
    if (settings.countdownSeconds === 0) {
      playbackStartedAtRef.current = now;
      displayStartCue(now);
      const firstGate = gatesRef.current[0];
      if (pauseOnNotesRef.current && firstGate?.onsetMs === 0) enterGate(firstGate);
      else {
        phaseRef.current = "playing";
        setPhase("playing");
      }
      setCountdownValue(undefined);
    } else {
      countdownStartedAtRef.current = now;
      phaseRef.current = "countdown";
      setPhase("countdown");
      setCountdownValue(settings.countdownSeconds);
    }
  }, [displayStartCue, enterGate, plan, settings.countdownSeconds]);

  useEffect(() => {
    if (phase !== "countdown" && phase !== "playing") return;
    let frame = 0;
    const tick = (now: number) => {
      if (showStartCue && now >= startCueEndsAtRef.current) setShowStartCue(false);
      if (phaseRef.current === "countdown") {
        const countdownElapsed = now - countdownStartedAtRef.current;
        const countdownDuration = settings.countdownSeconds * 1000;
        if (countdownElapsed >= countdownDuration) {
          setRollElapsedMs(0);
          playbackStartedAtRef.current = countdownStartedAtRef.current + countdownDuration;
          displayStartCue(countdownStartedAtRef.current + countdownDuration);
          const firstGate = gatesRef.current[0];
          if (pauseOnNotesRef.current && firstGate?.onsetMs === 0) enterGate(firstGate);
          else {
            phaseRef.current = "playing";
            setPhase("playing");
          }
          setCountdownValue(undefined);
        } else {
          setRollElapsedMs(countdownElapsed - countdownDuration);
          const remaining = countdownDuration - countdownElapsed;
          setCountdownValue(Math.ceil(remaining / 1000));
        }
      } else if (phaseRef.current === "playing" && planRef.current) {
        const elapsed = Math.max(0, now - playbackStartedAtRef.current);
        const nextGate = pauseOnNotesRef.current
          ? gatesRef.current.find((item) => !passedGateOnsetsRef.current.has(item.onsetMs) && item.onsetMs > elapsedMsRef.current && item.onsetMs <= elapsed)
          : undefined;
        if (nextGate) {
          enterGate(nextGate);
          return;
        }
        elapsedMsRef.current = Math.min(elapsed, planRef.current.durationMs);
        setElapsedMs(Math.min(elapsed, planRef.current.durationMs));
        setRollElapsedMs(Math.min(elapsed, planRef.current.durationMs));
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

  useEffect(() => () => {
    if (startCueTimerRef.current !== undefined) window.clearTimeout(startCueTimerRef.current);
  }, []);

  useEffect(() => {
    if (phaseRef.current !== "idle") stop();
  }, [events, handMode, range, settings.countdownSeconds, settings.fallbackBpm, settings.hitToleranceMs, stop]);

  const handleMidiNoteOn = useCallback((note: number, receivedAtMs: number) => {
    if (phaseRef.current === "waiting-restart") {
      start();
      return;
    }
    const activePlan = planRef.current;
    if ((phaseRef.current !== "playing" && phaseRef.current !== "waiting-note") || !activePlan) return;
    const activeGate = gateRef.current;
    const noteElapsed = activeGate?.onsetMs ?? Math.min(Math.max(receivedAtMs - playbackStartedAtRef.current, 0), activePlan.durationMs);
    const matchingGateSlotCount = activeGate ? activePlan.events.filter((item) => Math.abs(item.onsetMs - activeGate.onsetMs) < 0.001 && item.event.midiNotes.includes(note)).length : 0;
    const reservedIds = Math.max(1, matchingGateSlotCount);
    const firstAttemptId = attemptIdRef.current + 1;
    attemptIdRef.current += reservedIds;
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

  const current = phase === "playing" || phase === "waiting-note" || phase === "waiting-restart" ? activePlaybackEvent(plan ?? { startQuarter: 0, endQuarter: 0, durationMs: 0, events: [] }, elapsedMs) : undefined;
  const expectedNotes = phase === "waiting-note" ? gate?.expectedNotes ?? [] : phase === "playing" && plan ? activeExpectedNotes(plan, elapsedMs) : [];
  const missedNotes = showMissedNotes ? missedPerformanceNotes(plan, results) : [];
  const clearResults = useCallback(() => { setResults([]); setShowMissedNotes(false); }, []);
  return { phase, plan, elapsedMs, rollElapsedMs, runId, countdownValue, showStartCue, gate, results, missedNotes, currentEventIndex: current?.eventIndex, currentEvent: current?.event, expectedNotes, start, stop, clearResults, handleMidiNoteOn };
}
