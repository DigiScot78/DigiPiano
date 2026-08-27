import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HandMode, PracticeRunMode, ScoreSelectionRange } from "../learning/matcher";
import type { ScoreEvent, TempoChange } from "../music/scoreTypes";
import { activeExpectedNotes, activePlaybackEvent, createPlaybackPlan, missedPerformanceNotes, scorePerformanceAttempt, type PerformanceResult, type PlaybackPhase } from "./playback";
import type { PlaySettings } from "./settings";

export function usePlaybackSession(options: { events: ScoreEvent[]; tempoChanges: TempoChange[]; handMode: HandMode; range?: ScoreSelectionRange; runMode: PracticeRunMode; settings: PlaySettings }) {
  const { events, tempoChanges, handMode, range, runMode, settings } = options;
  const plan = useMemo(() => createPlaybackPlan(events, tempoChanges, settings.fallbackBpm, handMode, range), [events, handMode, range, settings.fallbackBpm, tempoChanges]);
  const [phase, setPhase] = useState<PlaybackPhase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [countdownValue, setCountdownValue] = useState<number | undefined>();
  const [results, setResults] = useState<PerformanceResult[]>([]);
  const [showMissedNotes, setShowMissedNotes] = useState(false);
  const countdownStartedAtRef = useRef(0);
  const playbackStartedAtRef = useRef(0);
  const attemptIdRef = useRef(0);
  const phaseRef = useRef<PlaybackPhase>(phase);
  const planRef = useRef(plan);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { planRef.current = plan; }, [plan]);

  const stop = useCallback(() => {
    phaseRef.current = "idle";
    setPhase("idle");
    setCountdownValue(undefined);
  }, []);

  const start = useCallback(() => {
    if (!plan) return;
    setResults([]);
    setShowMissedNotes(false);
    setElapsedMs(0);
    const now = performance.now();
    if (settings.countdownSeconds === 0) {
      playbackStartedAtRef.current = now;
      phaseRef.current = "playing";
      setPhase("playing");
      setCountdownValue(undefined);
    } else {
      countdownStartedAtRef.current = now;
      phaseRef.current = "countdown";
      setPhase("countdown");
      setCountdownValue(settings.countdownSeconds);
    }
  }, [plan, settings.countdownSeconds]);

  useEffect(() => {
    if (phase !== "countdown" && phase !== "playing") return;
    let frame = 0;
    const tick = (now: number) => {
      if (phaseRef.current === "countdown") {
        const countdownElapsed = now - countdownStartedAtRef.current;
        const countdownDuration = settings.countdownSeconds * 1000;
        if (countdownElapsed >= countdownDuration) {
          playbackStartedAtRef.current = countdownStartedAtRef.current + countdownDuration;
          phaseRef.current = "playing";
          setPhase("playing");
          setCountdownValue(undefined);
        } else {
          const remaining = countdownDuration - countdownElapsed;
          setCountdownValue(Math.ceil(remaining / 1000));
        }
      } else if (phaseRef.current === "playing" && planRef.current) {
        const elapsed = Math.max(0, now - playbackStartedAtRef.current);
        setElapsedMs(Math.min(elapsed, planRef.current.durationMs));
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
  }, [phase, runMode, settings.countdownSeconds]);

  useEffect(() => {
    if (phaseRef.current !== "idle") stop();
  }, [events, handMode, range, settings.countdownSeconds, settings.fallbackBpm, settings.hitToleranceMs, stop]);

  const handleMidiNoteOn = useCallback((note: number, receivedAtMs: number) => {
    if (phaseRef.current === "waiting-restart") {
      start();
      return;
    }
    const activePlan = planRef.current;
    if (phaseRef.current !== "playing" || !activePlan) return;
    const noteElapsed = Math.min(Math.max(receivedAtMs - playbackStartedAtRef.current, 0), activePlan.durationMs);
    attemptIdRef.current += 1;
    setResults((current) => {
      const result = scorePerformanceAttempt(note, noteElapsed, receivedAtMs, attemptIdRef.current, activePlan, tempoChanges, settings.fallbackBpm, settings.hitToleranceMs, current);
      return result ? [...current, result] : current;
    });
  }, [settings.fallbackBpm, settings.hitToleranceMs, start, tempoChanges]);

  const current = phase === "playing" || phase === "waiting-restart" ? activePlaybackEvent(plan ?? { startQuarter: 0, endQuarter: 0, durationMs: 0, events: [] }, elapsedMs) : undefined;
  const expectedNotes = phase === "playing" && plan ? activeExpectedNotes(plan, elapsedMs) : [];
  const showStartCue = phase === "playing" && elapsedMs < 300;
  const missedNotes = showMissedNotes ? missedPerformanceNotes(plan, results) : [];
  const clearResults = useCallback(() => { setResults([]); setShowMissedNotes(false); }, []);
  return { phase, plan, elapsedMs, countdownValue, showStartCue, results, missedNotes, currentEventIndex: current?.eventIndex, currentEvent: current?.event, expectedNotes, start, stop, clearResults, handleMidiNoteOn };
}
