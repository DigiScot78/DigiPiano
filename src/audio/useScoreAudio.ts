import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlaybackPhase, PlaybackPlan } from "../playback/playback";
import type { AudioSettings } from "./settings";
import { PianoSynthEngine, type ScoreAudioEngine } from "./pianoSynth";
import { arpeggioSequenceForEvent } from "../learning/matcher";

export interface AudioPlanNote { id: string; midiNote: number; onsetMs: number; durationMs: number }

const LOOKAHEAD_MS = 120;
export const ARPEGGIO_NOTE_SPREAD_MS = 70;

export function audioNotesForPlan(plan: PlaybackPlan | undefined): AudioPlanNote[] {
  if (!plan) return [];
  const grouped = new Map<string, AudioPlanNote>();
  for (const item of plan.events) {
    const arpeggio = arpeggioSequenceForEvent(item.event);
    for (const midiNote of item.event.midiNotes) {
      const arpeggioIndex = arpeggio?.indexOf(midiNote) ?? -1;
      const onsetMs = item.onsetMs + Math.max(0, arpeggioIndex) * ARPEGGIO_NOTE_SPREAD_MS;
      const key = `${onsetMs}:${midiNote}`;
      const durationMs = Math.max(0, item.endMs - onsetMs);
      const current = grouped.get(key);
      if (!current || durationMs > current.durationMs) grouped.set(key, { id: key, midiNote, onsetMs, durationMs });
    }
  }
  return [...grouped.values()].sort((a, b) => a.onsetMs - b.onsetMs || a.midiNote - b.midiNote);
}

export function audioNotesInWindow(notes: AudioPlanNote[], elapsedMs: number, nextGateOnsetMs: number | undefined, scheduled: ReadonlySet<string>, lookaheadMs = LOOKAHEAD_MS, minimumOnsetMs = 0): AudioPlanNote[] {
  const horizon = Math.min(elapsedMs + lookaheadMs, nextGateOnsetMs ?? Number.POSITIVE_INFINITY);
  return notes.filter((note) => note.onsetMs >= minimumOnsetMs - 0.001
    && note.onsetMs >= elapsedMs - 1
    && note.onsetMs <= horizon
    && (nextGateOnsetMs === undefined || note.onsetMs < nextGateOnsetMs - 0.001)
    && !scheduled.has(note.id));
}

export function useScoreAudio(options: { plan?: PlaybackPlan; phase: PlaybackPhase; rollElapsedMs: number; audioStartElapsedMs?: number; runId: number; pauseOnNotes: boolean; nextPendingGateOnsetMs?: number; settings: AudioSettings; engine?: ScoreAudioEngine }) {
  const { plan, phase, rollElapsedMs, audioStartElapsedMs = 0, runId, pauseOnNotes, nextPendingGateOnsetMs, settings } = options;
  const [engine] = useState<ScoreAudioEngine>(() => options.engine ?? new PianoSynthEngine());
  const scheduledRef = useRef(new Set<string>());
  const [error, setError] = useState<string | undefined>();
  const notes = useMemo(() => audioNotesForPlan(plan), [plan]);

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
    const nextGate = pauseOnNotes ? nextPendingGateOnsetMs : undefined;
    for (const note of audioNotesInWindow(notes, rollElapsedMs, nextGate, scheduledRef.current, LOOKAHEAD_MS, audioStartElapsedMs)) {
      engine.scheduleNote(`${runId}:${note.id}`, note.midiNote, note.onsetMs - rollElapsedMs, note.durationMs);
      scheduledRef.current.add(note.id);
    }
  }, [audioStartElapsedMs, engine, nextPendingGateOnsetMs, notes, pauseOnNotes, phase, rollElapsedMs, runId]);

  useEffect(() => {
    engine.cancelFuture();
    scheduledRef.current.clear();
  }, [engine, pauseOnNotes]);

  useEffect(() => () => engine.close(), [engine]);
  return { prepare, error };
}
