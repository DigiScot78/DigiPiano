import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AudioSettings } from "./settings";
import type { CountInPlan, MetronomeBeat, PlaybackPhase, PlaybackPlan } from "../playback/playback";

const LOOKAHEAD_MS = 120;

export interface MetronomeAudioEngine {
  prepare(): Promise<void>;
  setVolume(volume: number): void;
  scheduleClick(id: string, delayMs: number, accent: boolean): void;
  stopAll(): void;
  close(): void;
}

export class WebAudioMetronomeEngine implements MetronomeAudioEngine {
  private context?: AudioContext;
  private master?: GainNode;
  private volume = 55;
  private sources = new Map<string, OscillatorNode>();

  async prepare(): Promise<void> {
    if (!this.context) {
      const AudioContextConstructor = window.AudioContext;
      if (!AudioContextConstructor) throw new Error("Web Audio is not available in this browser.");
      this.context = new AudioContextConstructor();
      this.master = this.context.createGain();
      this.master.connect(this.context.destination);
      this.applyVolume();
    }
    if (this.context.state === "suspended") await this.context.resume();
  }

  setVolume(volume: number): void {
    this.volume = Math.min(100, Math.max(0, volume));
    this.applyVolume();
  }

  scheduleClick(id: string, delayMs: number, accent: boolean): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master || this.sources.has(id)) return;
    const startsAt = context.currentTime + Math.max(0, delayMs) / 1000;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(accent ? 1760 : 1175, startsAt);
    gain.gain.setValueAtTime(0.0001, startsAt);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.42 : 0.25, startsAt + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + (accent ? 0.055 : 0.04));
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(startsAt);
    oscillator.stop(startsAt + 0.065);
    this.sources.set(id, oscillator);
    oscillator.addEventListener("ended", () => this.sources.delete(id), { once: true });
  }

  stopAll(): void {
    const now = this.context?.currentTime ?? 0;
    for (const source of this.sources.values()) {
      try { source.stop(now); } catch { /* Already stopped. */ }
    }
    this.sources.clear();
  }

  close(): void {
    this.stopAll();
    void this.context?.close();
    this.context = undefined;
    this.master = undefined;
  }

  private applyVolume(): void {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime((this.volume / 100) ** 2, now, 0.01);
  }
}

export function metronomeBeatsInWindow(beats: readonly Pick<MetronomeBeat, "id" | "onsetMs" | "accent">[], elapsedMs: number, scheduled: ReadonlySet<string>, lookaheadMs = LOOKAHEAD_MS) {
  return beats.filter((beat) => beat.onsetMs >= elapsedMs - 1 && beat.onsetMs <= elapsedMs + lookaheadMs && !scheduled.has(beat.id));
}

export function metronomeBeatsToSchedule(beats: readonly Pick<MetronomeBeat, "id" | "onsetMs" | "accent">[], elapsedMs: number, scheduled: ReadonlySet<string>, phase: PlaybackPhase) {
  return phase === "countdown"
    ? beats.filter((beat) => beat.onsetMs >= elapsedMs - 1 && !scheduled.has(beat.id))
    : metronomeBeatsInWindow(beats, elapsedMs, scheduled);
}

export function useMetronome(options: { plan?: PlaybackPlan; countInPlan: CountInPlan; phase: PlaybackPhase; rollElapsedMs: number; runId: number; settings: AudioSettings; engine?: MetronomeAudioEngine }) {
  const { plan, countInPlan, phase, rollElapsedMs, runId, settings } = options;
  const [engine] = useState<MetronomeAudioEngine>(() => options.engine ?? new WebAudioMetronomeEngine());
  const scheduledRef = useRef(new Set<string>());
  const previousPhaseRef = useRef<PlaybackPhase>(phase);
  const [error, setError] = useState<string | undefined>();
  const beats = useMemo(() => phase === "countdown" ? countInPlan.beats : plan?.metronomeBeats ?? [], [countInPlan.beats, phase, plan?.metronomeBeats]);

  const prepare = useCallback(async () => {
    try {
      await engine.prepare();
      engine.setVolume(settings.metronomeVolume);
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Metronome audio could not be started.");
    }
  }, [engine, settings.metronomeVolume]);

  useEffect(() => engine.setVolume(settings.metronomeVolume), [engine, settings.metronomeVolume]);
  useEffect(() => {
    scheduledRef.current.clear();
    engine.stopAll();
  }, [engine, runId]);
  useEffect(() => {
    const previousPhase = previousPhaseRef.current;
    previousPhaseRef.current = phase;
    if (!settings.metronomeEnabled || (phase !== "countdown" && phase !== "playing")) {
      engine.stopAll();
      scheduledRef.current.clear();
      return;
    }
    if (previousPhase === "waiting-note" && phase === "playing") {
      for (const beat of beats) if (beat.onsetMs <= rollElapsedMs + 0.001) scheduledRef.current.add(beat.id);
    }
    const pending = metronomeBeatsToSchedule(beats, rollElapsedMs, scheduledRef.current, phase);
    for (const beat of pending) {
      engine.scheduleClick(`${runId}:${beat.id}`, beat.onsetMs - rollElapsedMs, beat.accent);
      scheduledRef.current.add(beat.id);
    }
  }, [beats, engine, phase, rollElapsedMs, runId, settings.metronomeEnabled]);
  useEffect(() => () => engine.close(), [engine]);
  return { prepare, error };
}
