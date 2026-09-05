import type { PlaybackPhase, PlaybackPlan } from "../playback/playback";
import type { PianoKeyLayout } from "./piano";

export type SynthesiaHand = "right" | "left";

export interface SynthesiaNoteBlock {
  id: string;
  midiNote: number;
  hand: SynthesiaHand;
  eventIndex: number;
  onsetMs: number;
  durationMs: number;
  x: number;
  width: number;
}

export interface SynthesiaVerticalGeometry { bottom: number; height: number }

export const SYNTHESIA_PIXELS_PER_SECOND = 100;
export const SYNTHESIA_MIN_BLOCK_HEIGHT = 6;
export const SYNTHESIA_MIN_STRIKE_HIGHLIGHT_MS = 140;

export function availableSynthesiaHeight(strikeTop: number, headerBottom: number, gap = 6): number {
  return Math.max(0, Math.floor(strikeTop - headerBottom - gap));
}

export function createSynthesiaBlocks(plan: PlaybackPlan | undefined, keys: PianoKeyLayout[]): SynthesiaNoteBlock[] {
  if (!plan) return [];
  const keyByNote = new Map(keys.map((key) => [key.midiNote, key]));
  return plan.events.flatMap((item) => item.event.midiNotes.flatMap((midiNote, noteIndex) => {
    const key = keyByNote.get(midiNote);
    if (!key) return [];
    const detailIndex = item.event.noteDetails.findIndex((note) => note.midiNote === midiNote);
    const detail = item.event.noteDetails[detailIndex];
    const noteEndMs = item.noteEndMs?.[detailIndex] ?? item.endMs;
    return [{
      id: `${item.eventIndex}:${midiNote}:${noteIndex}`,
      midiNote,
      hand: detail?.staffNumber === 2 ? "left" as const : "right" as const,
      eventIndex: item.eventIndex,
      onsetMs: item.onsetMs,
      durationMs: Math.max(0, noteEndMs - item.onsetMs),
      x: key.x,
      width: key.width,
    }];
  }));
}

export function synthesiaDisplayElapsedMs(plan: PlaybackPlan | undefined, phase: PlaybackPhase, rollElapsedMs: number, displayedEventIndex: number): number {
  if (phase !== "idle") return rollElapsedMs;
  return plan?.events.find((item) => item.eventIndex === displayedEventIndex)?.onsetMs ?? 0;
}

export function synthesiaVerticalGeometry(block: Pick<SynthesiaNoteBlock, "onsetMs" | "durationMs">, elapsedMs: number, pixelsPerSecond = SYNTHESIA_PIXELS_PER_SECOND): SynthesiaVerticalGeometry {
  const pixelsPerMs = pixelsPerSecond / 1000;
  return {
    bottom: (block.onsetMs - elapsedMs) * pixelsPerMs,
    height: Math.max(SYNTHESIA_MIN_BLOCK_HEIGHT, block.durationMs * pixelsPerMs),
  };
}

export function isSynthesiaBlockVisible(geometry: SynthesiaVerticalGeometry, panelHeight: number): boolean {
  return geometry.bottom < panelHeight && geometry.bottom + geometry.height > 0;
}

export function isSynthesiaBlockStriking(block: Pick<SynthesiaNoteBlock, "onsetMs" | "durationMs">, elapsedMs: number): boolean {
  return block.onsetMs <= elapsedMs && elapsedMs < block.onsetMs + Math.max(block.durationMs, SYNTHESIA_MIN_STRIKE_HIGHLIGHT_MS);
}
