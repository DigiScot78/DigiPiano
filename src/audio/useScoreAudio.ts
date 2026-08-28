import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { playbackGates, type PlaybackPhase, type PlaybackPlan } from "../playback/playback";
import type { AudioSettings } from "./settings";
import { PianoSynthEngine, type ScoreAudioEngine } from "./pianoSynth";

export interface AudioPlanNote { id: string; midiNote: number; onsetMs: number; durationMs: number }

const LOOKAHEAD_MS = 120;

export function audioNotesForPlan(plan: PlaybackPlan | undefined): AudioPlanNote[] {
  if (!plan) return [];
  const grouped = new Map<string, AudioPlanNote>();
  for (const item of plan.events) {
    for (const midiNote of item.event.midiNotes) {
      const key = `${item.onsetMs}:${midiNote}`;
      const durationMs = Math.max(0, item.endMs - item.onsetMs);
      const current = grouped.get(key);
      if (!current || durationMs > current.durationMs) grouped.set(key, { id: key, midiNote, onsetMs: item.onsetMs, durationMs });
    }
  }
  return [...grouped.values()].sort((a, b) => a.onsetMs - b.onsetMs || a.midiNote - b.midiNote);
}

export function audioNotesInWindow(notes: AudioPlanNote[], elapsedMs: number, nextGateOnsetMs: number | undefined, scheduled: ReadonlySet<string>, lookaheadMs = LOOKAHEAD_MS): AudioPlanNote[] {
  const horizon = Math.min(elapsedMs + lookaheadMs, nextGateOnsetMs ?? Number.POSITIVE_INFINITY);
  return notes.filter((note) => note.onsetMs >= elapsedMs - 1
    && note.onsetMs <= horizon
    && (nextGateOnsetMs === undefined || note.onsetMs < nextGateOnsetMs - 0.001)
    && !scheduled.has(note.id));
}

export function useScoreAudio(options: { plan?: PlaybackPlan; phase: PlaybackPhase; rollElapsedMs: number; runId: number; pauseOnNotes: boolean; settings: AudioSettings; engine?: ScoreAudioEngine }) {
  const { plan, phase, rollElapsedMs, runId, pauseOnNotes, settings } = options;
  const [engine] = useState<ScoreAudioEngine>(() => options.engine ?? new PianoSynthEngine());
  const scheduledRef = useRef(new Set<string>());
  const [error, setError] = useState<string | undefined>();
  const notes = useMemo(() => audioNotesForPlan(plan), [plan]);
  const gates = useMemo(() => plan ? playbackGates(plan) : [], [plan]);

  const prepare = useCallback(async () => {
    try {
      await engine.prepare();
      engine.setOutput(settings.volume, settings.muted);
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Audio could not be started.");
    }
  }, [engine, settings.muted, settings.volume]);

  useEffect(() => { engine.setOutput(settings.volume, settings.muted); }, [engine, settings.muted, settings.volume]);

  useEffect(() => {
    scheduledRef.current.clear();
    engine.stopAll();
  }, [engine, plan, runId]);

  useEffect(() => {
    if (phase === "waiting-note") {
      engine.cancelFuture();
      return;
    }
    if (phase !== "countdown" && phase !== "playing") {
      engine.stopAll();
      return;
    }
    const nextGate = pauseOnNotes ? gates.find((gate) => gate.onsetMs > rollElapsedMs + 0.5)?.onsetMs : undefined;
    for (const note of audioNotesInWindow(notes, rollElapsedMs, nextGate, scheduledRef.current)) {
      engine.scheduleNote(`${runId}:${note.id}`, note.midiNote, note.onsetMs - rollElapsedMs, note.durationMs);
      scheduledRef.current.add(note.id);
    }
  }, [engine, gates, notes, pauseOnNotes, phase, rollElapsedMs, runId]);

  useEffect(() => {
    engine.cancelFuture();
    scheduledRef.current.clear();
  }, [engine, pauseOnNotes]);

  useEffect(() => () => engine.close(), [engine]);
  return { prepare, error };
}
