export interface ScoreAudioEngine {
  prepare(): Promise<void>;
  setOutput(volume: number, muted: boolean): void;
  scheduleNote(id: string, midiNote: number, delayMs: number, durationMs: number): void;
  stopNote?(id: string): void;
  cancelFuture(): void;
  stopAll(): void;
  close(): void;
}

interface SynthVoice {
  startsAt: number;
  gain: GainNode;
  oscillators: OscillatorNode[];
}

export function midiNoteFrequency(midiNote: number): number {
  return 440 * 2 ** ((midiNote - 69) / 12);
}

export class PianoSynthEngine implements ScoreAudioEngine {
  private context?: AudioContext;
  private master?: GainNode;
  private voices = new Map<string, SynthVoice>();
  private volume = 65;
  private muted = false;

  async prepare(): Promise<void> {
    if (!this.context) {
      const AudioContextConstructor = window.AudioContext;
      if (!AudioContextConstructor) throw new Error("Web Audio is not available in this browser.");
      this.context = new AudioContextConstructor();
      const compressor = this.context.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 18;
      compressor.ratio.value = 5;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
      this.master = this.context.createGain();
      this.master.connect(compressor);
      compressor.connect(this.context.destination);
      this.applyOutput(true);
    }
    if (this.context.state === "suspended") await this.context.resume();
  }

  setOutput(volume: number, muted: boolean): void {
    this.volume = Math.min(Math.max(volume, 0), 100);
    this.muted = muted;
    this.applyOutput(false);
  }

  scheduleNote(id: string, midiNote: number, delayMs: number, durationMs: number): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master || this.voices.has(id)) return;
    const startsAt = context.currentTime + Math.max(0, delayMs) / 1000;
    const audibleDuration = Math.max(0.09, durationMs / 1000);
    const releaseAt = startsAt + audibleDuration;
    const noteGain = context.createGain();
    noteGain.gain.setValueAtTime(0.0001, startsAt);
    noteGain.gain.exponentialRampToValueAtTime(0.085, startsAt + 0.008);
    noteGain.gain.exponentialRampToValueAtTime(0.026, Math.min(releaseAt, startsAt + 0.34));
    noteGain.gain.setValueAtTime(0.026, releaseAt);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, releaseAt + 0.28);
    noteGain.connect(master);

    const fundamental = context.createOscillator();
    fundamental.type = "triangle";
    fundamental.frequency.setValueAtTime(midiNoteFrequency(midiNote), startsAt);
    const harmonic = context.createOscillator();
    harmonic.type = "sine";
    harmonic.frequency.setValueAtTime(midiNoteFrequency(midiNote) * 2.01, startsAt);
    const harmonicGain = context.createGain();
    harmonicGain.gain.value = 0.18;
    fundamental.connect(noteGain);
    harmonic.connect(harmonicGain);
    harmonicGain.connect(noteGain);
    const oscillators = [fundamental, harmonic];
    for (const oscillator of oscillators) {
      oscillator.start(startsAt);
      oscillator.stop(releaseAt + 0.3);
      oscillator.addEventListener("ended", () => this.voices.delete(id), { once: true });
    }
    this.voices.set(id, { startsAt, gain: noteGain, oscillators });
  }

  cancelFuture(): void {
    const now = this.context?.currentTime ?? 0;
    for (const [id, voice] of this.voices) {
      if (voice.startsAt <= now + 0.002) continue;
      for (const oscillator of voice.oscillators) safelyStop(oscillator, now);
      voice.gain.disconnect();
      this.voices.delete(id);
    }
  }

  stopAll(): void {
    const now = this.context?.currentTime ?? 0;
    for (const voice of this.voices.values()) {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0.0001, now, 0.012);
      for (const oscillator of voice.oscillators) safelyStop(oscillator, now + 0.05);
    }
    this.voices.clear();
  }

  stopNote(id: string): void {
    const voice = this.voices.get(id);
    if (!voice) return;
    const now = this.context?.currentTime ?? 0;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0.0001, now, 0.012);
    for (const oscillator of voice.oscillators) safelyStop(oscillator, now + 0.05);
    this.voices.delete(id);
  }

  close(): void {
    this.stopAll();
    void this.context?.close();
    this.context = undefined;
    this.master = undefined;
  }

  private applyOutput(immediate: boolean): void {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    const target = this.muted ? 0 : (this.volume / 100) ** 2;
    this.master.gain.cancelScheduledValues(now);
    if (immediate) this.master.gain.setValueAtTime(target, now);
    else this.master.gain.setTargetAtTime(target, now, 0.015);
  }
}

function safelyStop(oscillator: OscillatorNode, when: number): void {
  try { oscillator.stop(when); } catch { /* A stopped oscillator needs no further cleanup. */ }
}
