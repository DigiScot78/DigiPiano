import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PracticeRunMode } from "../learning/matcher";
import { midiNoteToName } from "../music/note";
import { generatePianoLayout, rangeForSettings, resolvePianoKeyState, SYNTHESIA_MIN_HEIGHT, validateCustomRange, type PianoHeight, type PianoRangePreset, type PianoSettings, type PianoWidthMode, type SynthesiaSpeed } from "../piano/piano";
import { createSynthesiaBlocks, isSynthesiaBlockStriking, isSynthesiaBlockVisible, synthesiaVerticalGeometry } from "../piano/synthesia";
import type { PlaybackPhase, PlaybackPlan } from "../playback/playback";
import type { AudioSettings } from "../audio/settings";
import { AudioControls } from "./AudioControls";

export interface PianoPanelProps {
  expectedNotes: number[];
  heldNotes: number[];
  ignoredCarriedNotes: number[];
  settings: PianoSettings;
  playbackPlan?: PlaybackPlan;
  playbackPhase: PlaybackPhase;
  rollElapsedMs: number;
  canPlay: boolean;
  runMode: PracticeRunMode;
  pauseOnNotes: boolean;
  canClearPerformance: boolean;
  audioSettings?: AudioSettings;
  audioError?: string;
  onSettingsChange: (update: Partial<PianoSettings> | ((current: PianoSettings) => PianoSettings)) => void;
  onPlay: () => void;
  onStop: () => void;
  onRunModeChange: (mode: PracticeRunMode) => void;
  onPauseOnNotesChange: (enabled: boolean) => void;
  onClearPerformance: () => void;
  onAudioSettingsChange?: (update: Partial<AudioSettings>) => void;
}

const HEIGHT_LABELS: Record<PianoHeight, string> = { small: "Small", medium: "Medium", large: "Large" };
const WIDTH_LABELS: Record<PianoWidthMode, string> = { auto: "Auto", fit: "Fit", scroll: "Scroll" };
const SPEED_LABELS: Record<SynthesiaSpeed, string> = { 70: "Slow", 100: "Normal", 140: "Fast" };
const ACTIVE_ROLL_PHASES = new Set<PlaybackPhase>(["countdown", "playing", "waiting-note"]);

export function PianoPanel({ expectedNotes, heldNotes, ignoredCarriedNotes, settings, playbackPlan, playbackPhase, rollElapsedMs, canPlay, runMode, pauseOnNotes, canClearPerformance, audioSettings, audioError, onSettingsChange, onPlay, onStop, onRunModeChange, onPauseOnNotesChange, onClearPerformance, onAudioSettingsChange }: PianoPanelProps) {
  const range = rangeForSettings(settings);
  const keys = useMemo(() => generatePianoLayout(range.low, range.high), [range.high, range.low]);
  const blocks = useMemo(() => createSynthesiaBlocks(playbackPlan, keys), [keys, playbackPlan]);
  const whiteCount = keys.filter((key) => !key.isBlack).length;
  const viewportRef = useRef<HTMLDivElement>(null);
  const keyboardRef = useRef<HTMLDivElement>(null);
  const resizeStartRef = useRef<{ y: number; height: number } | undefined>(undefined);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [availableRollHeight, setAvailableRollHeight] = useState(settings.synthesiaHeight);
  const [draftRollHeight, setDraftRollHeight] = useState<number | undefined>();
  const expectedInRange = expectedNotes.filter((note) => note >= range.low && note <= range.high);
  const outsideExpected = expectedNotes.filter((note) => note < range.low || note > range.high);
  const minimumWhiteWidth = settings.widthMode === "fit" ? 0 : settings.widthMode === "scroll" ? 28 : 22;
  const minimumAllowedHeight = Math.min(SYNTHESIA_MIN_HEIGHT, availableRollHeight);
  const rollHeight = Math.max(minimumAllowedHeight, Math.min(draftRollHeight ?? settings.synthesiaHeight, availableRollHeight));
  const showBlocks = settings.synthesiaEnabled && ACTIVE_ROLL_PHASES.has(playbackPhase);
  const activeHandByNote = useMemo(() => {
    if (!showBlocks) return new Map<number, "right" | "left">();
    return new Map(blocks.filter((block) => isSynthesiaBlockStriking(block, rollElapsedMs)).map((block) => [block.midiNote, block.hand]));
  }, [blocks, rollElapsedMs, showBlocks]);

  const measurePiano = useCallback(() => {
    const viewport = viewportRef.current;
    const keyboard = keyboardRef.current;
    if (!viewport || !keyboard) return;
    setContentWidth(keyboard.scrollWidth);
    setAvailableRollHeight(Math.max(80, viewport.getBoundingClientRect().top - 8));
  }, []);

  useEffect(() => {
    measurePiano();
    window.addEventListener("resize", measurePiano);
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measurePiano);
    if (keyboardRef.current) observer?.observe(keyboardRef.current);
    if (viewportRef.current) observer?.observe(viewportRef.current);
    return () => { window.removeEventListener("resize", measurePiano); observer?.disconnect(); };
  }, [measurePiano, settings.expanded, settings.height, settings.synthesiaEnabled, settings.widthMode]);

  useEffect(() => {
    if (!settings.expanded || settings.widthMode === "fit" || expectedInRange.length === 0) return;
    if (settings.synthesiaEnabled && settings.widthMode === "scroll") return;
    if (settings.synthesiaEnabled && settings.widthMode === "auto" && showBlocks) return;
    const viewport = viewportRef.current;
    const target = viewport?.querySelector<HTMLElement>(`[data-midi-note="${expectedInRange[0]}"]`);
    if (!viewport || !target) return;
    const left = target.offsetLeft;
    const right = left + target.offsetWidth;
    if ((left < viewport.scrollLeft || right > viewport.scrollLeft + viewport.clientWidth) && typeof target.scrollIntoView === "function") target.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [expectedInRange, settings.expanded, settings.synthesiaEnabled, settings.widthMode, showBlocks]);

  useEffect(() => {
    if (!showBlocks || settings.widthMode !== "auto") return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const nextOnset = blocks.filter((block) => block.onsetMs >= rollElapsedMs && isSynthesiaBlockVisible(synthesiaVerticalGeometry(block, rollElapsedMs, settings.synthesiaSpeed), rollHeight)).sort((a, b) => a.onsetMs - b.onsetMs)[0]?.onsetMs;
    if (nextOnset === undefined) return;
    const group = blocks.filter((block) => Math.abs(block.onsetMs - nextOnset) < 0.001);
    const targets = group.map((block) => viewport.querySelector<HTMLElement>(`[data-midi-note="${block.midiNote}"]`)).filter((target): target is HTMLElement => Boolean(target));
    if (targets.length === 0) return;
    const left = Math.min(...targets.map((target) => target.offsetLeft));
    const right = Math.max(...targets.map((target) => target.offsetLeft + target.offsetWidth));
    if (left >= viewport.scrollLeft && right <= viewport.scrollLeft + viewport.clientWidth) return;
    const nextLeft = Math.max(0, (left + right - viewport.clientWidth) / 2);
    if (typeof viewport.scrollTo === "function") viewport.scrollTo({ left: nextLeft, behavior: "smooth" });
    else viewport.scrollLeft = nextLeft;
  }, [blocks, rollElapsedMs, rollHeight, settings.synthesiaSpeed, settings.widthMode, showBlocks]);

  const revealExpected = () => {
    if (outsideExpected.length === 0) return;
    const expanded = validateCustomRange(Math.min(range.low, ...outsideExpected), Math.max(range.high, ...outsideExpected));
    onSettingsChange({ rangePreset: "custom", customLow: expanded.low, customHigh: expanded.high, expanded: true });
  };

  const beginResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    resizeStartRef.current = { y: event.clientY, height: rollHeight };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraftRollHeight(rollHeight);
  };
  const resize = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!resizeStartRef.current) return;
    const proposed = resizeStartRef.current.height + resizeStartRef.current.y - event.clientY;
    setDraftRollHeight(Math.round(Math.max(minimumAllowedHeight, Math.min(proposed, availableRollHeight))));
  };
  const finishResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!resizeStartRef.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    resizeStartRef.current = undefined;
    const nextHeight = Math.round(draftRollHeight ?? rollHeight);
    setDraftRollHeight(undefined);
    onSettingsChange({ synthesiaHeight: nextHeight });
  };

  return (
    <section className={`piano-panel height-${settings.height}${settings.expanded ? "" : " collapsed"}${settings.synthesiaEnabled && settings.expanded ? " synthesia-open" : ""}`} style={{ "--piano-expected": settings.expectedColor, "--piano-correct": settings.correctColor, "--piano-wrong": settings.wrongColor, "--synthesia-height": `${rollHeight}px` } as React.CSSProperties} aria-label="Piano keyboard">
      {settings.expanded && settings.synthesiaEnabled ? <div className={`synthesia-panel${settings.synthesiaOpaque ? " opaque" : ""}`} style={{ height: rollHeight }} aria-label="Synthesia falling notes">
        <button type="button" className="synthesia-resize-handle" aria-label="Resize Synthesia panel" title="Drag to resize Synthesia" onPointerDown={beginResize} onPointerMove={resize} onPointerUp={finishResize} onPointerCancel={finishResize}><span /></button>
        <div className="synthesia-content synthesia-lane-content" style={{ width: contentWidth || "100%", transform: `translateX(${-scrollLeft}px)` }}>
          {keys.map((key) => <div key={`lane-${key.midiNote}`} className={`synthesia-lane ${key.isBlack ? "black" : "white"}`} style={{ left: `${key.x * 100}%`, width: `${key.width * 100}%` }} />)}
        </div>
        <div className="synthesia-content synthesia-note-content" style={{ width: contentWidth || "100%", transform: `translateX(${-scrollLeft}px)` }}>
          {showBlocks ? blocks.map((block) => {
            const vertical = synthesiaVerticalGeometry(block, rollElapsedMs, settings.synthesiaSpeed);
            if (!isSynthesiaBlockVisible(vertical, rollHeight)) return null;
            return <div key={block.id} className={`synthesia-note hand-${block.hand}`} style={{ left: `${block.x * 100}%`, width: `${block.width * 100}%`, bottom: vertical.bottom, height: vertical.height }} role="img" aria-label={`${block.hand} hand ${midiNoteToName(block.midiNote)}`}>{settings.synthesiaShowNoteLabels ? <span>{midiNoteToName(block.midiNote)}</span> : null}</div>;
          }) : null}
        </div>
        <div className="synthesia-strike-line" aria-hidden="true" />
      </div> : null}
      <div className="piano-toolbar">
        <button type="button" className="piano-toggle" aria-label={settings.expanded ? "Hide piano" : "Show piano"} title={settings.expanded ? "Hide piano" : "Show piano"} aria-expanded={settings.expanded} onClick={() => onSettingsChange({ expanded: !settings.expanded })}><PianoIcon /></button>
        {settings.expanded ? <>
          <div className="piano-transport-controls" role="toolbar" aria-label="Piano playback controls">
            <button type="button" className={settings.synthesiaEnabled ? "active" : ""} aria-label="Toggle Synthesia" aria-pressed={settings.synthesiaEnabled} title={settings.synthesiaEnabled ? "Synthesia on" : "Synthesia off"} onClick={() => onSettingsChange({ synthesiaEnabled: !settings.synthesiaEnabled })}><RollIcon /></button>
            <button type="button" className={settings.synthesiaOpaque ? "active" : ""} aria-label="Toggle opaque Synthesia" aria-pressed={settings.synthesiaOpaque} title={settings.synthesiaOpaque ? "Opaque Synthesia on" : "Opaque Synthesia off"} onClick={() => onSettingsChange({ synthesiaOpaque: !settings.synthesiaOpaque })}><OpaqueIcon /></button>
            <button type="button" className={settings.synthesiaShowNoteLabels ? "active" : ""} aria-label="Show falling note labels" aria-pressed={settings.synthesiaShowNoteLabels} title={settings.synthesiaShowNoteLabels ? "Falling note labels on" : "Falling note labels off"} onClick={() => onSettingsChange({ synthesiaShowNoteLabels: !settings.synthesiaShowNoteLabels })}><NoteLabelIcon /></button>
            {playbackPhase === "idle" ? <button type="button" aria-label="Play score from piano" title="Play" disabled={!canPlay} onClick={onPlay}><PlayIcon /></button> : <button type="button" aria-label="Stop playback from piano" title="Stop" onClick={onStop}><StopIcon /></button>}
            <button type="button" className={runMode === "loop" ? "active" : ""} aria-label="Loop from piano" aria-pressed={runMode === "loop"} disabled={playbackPhase !== "idle"} title={runMode === "loop" ? "Loop on" : "Loop off"} onClick={() => onRunModeChange(runMode === "loop" ? "once" : "loop")}><LoopIcon /></button>
            <button type="button" className={pauseOnNotes ? "active" : ""} aria-label="Pause at each note from piano" aria-pressed={pauseOnNotes} title={pauseOnNotes ? "Pause at each note on" : "Pause at each note off"} onClick={() => onPauseOnNotesChange(!pauseOnNotes)}><PauseIcon /></button>
            <button type="button" aria-label="Clear performance from piano" title="Clear performance" disabled={!canClearPerformance} onClick={onClearPerformance}><ClearIcon /></button>
            {audioSettings && onAudioSettingsChange ? <AudioControls settings={audioSettings} error={audioError} onSettingsChange={onAudioSettingsChange} compact /> : null}
          </div>
          <label><input type="checkbox" checked={settings.showLabels} onChange={(event) => onSettingsChange({ showLabels: event.target.checked })} /> Note names</label>
          <ToolbarSelect label="Range" value={settings.rangePreset} values={["88", "76", "61", "49", "custom"]} format={(value) => value === "custom" ? "Custom" : `${value} keys`} onChange={(value) => onSettingsChange({ rangePreset: value as PianoRangePreset })} />
          {settings.rangePreset === "custom" ? <div className="piano-custom-range">
            <label>Low <input aria-label="Custom low MIDI note" type="number" min="21" max="96" value={settings.customLow} onChange={(event) => { const next = validateCustomRange(Number(event.target.value), settings.customHigh); onSettingsChange({ customLow: next.low, customHigh: next.high }); }} /></label>
            <label>High <input aria-label="Custom high MIDI note" type="number" min="33" max="108" value={settings.customHigh} onChange={(event) => { const next = validateCustomRange(settings.customLow, Number(event.target.value)); onSettingsChange({ customLow: next.low, customHigh: next.high }); }} /></label>
          </div> : null}
          <ToolbarSelect label="Height" value={settings.height} values={["small", "medium", "large"]} format={(value) => HEIGHT_LABELS[value as PianoHeight]} onChange={(value) => onSettingsChange({ height: value as PianoHeight })} />
          <ToolbarSelect label="Width" value={settings.widthMode} values={["auto", "fit", "scroll"]} format={(value) => WIDTH_LABELS[value as PianoWidthMode]} onChange={(value) => onSettingsChange({ widthMode: value as PianoWidthMode })} />
          {settings.synthesiaEnabled ? <ToolbarSelect label="Roll speed" value={String(settings.synthesiaSpeed)} values={["70", "100", "140"]} format={(value) => SPEED_LABELS[Number(value) as SynthesiaSpeed]} onChange={(value) => onSettingsChange({ synthesiaSpeed: Number(value) as SynthesiaSpeed })} /> : null}
          <span className="piano-range-name">{midiNoteToName(range.low)}–{midiNoteToName(range.high)}</span>
        </> : null}
      </div>
      {settings.expanded && outsideExpected.length > 0 ? <div className="piano-warning" role="status">Expected {outsideExpected.map(midiNoteToName).join(", ")} {outsideExpected.length === 1 ? "is" : "are"} outside this keyboard. <button type="button" onClick={revealExpected}>Reveal expected</button></div> : null}
      {settings.expanded ? <div className={`piano-viewport width-${settings.widthMode}`} ref={viewportRef} onScroll={(event) => setScrollLeft(event.currentTarget.scrollLeft)}>
        <div className="piano-lane-layer" aria-hidden="true" />
        <div className="piano-keyboard" ref={keyboardRef} style={{ minWidth: minimumWhiteWidth ? `${whiteCount * minimumWhiteWidth}px` : undefined }}>
          {keys.map((key) => {
            const state = resolvePianoKeyState(key.midiNote, expectedNotes, heldNotes, ignoredCarriedNotes);
            const name = midiNoteToName(key.midiNote);
            const activeHand = activeHandByNote.get(key.midiNote);
            return <div key={key.midiNote} data-midi-note={key.midiNote} className={`piano-key ${key.isBlack ? "black" : "white"} state-${state}${activeHand ? ` synthesia-active hand-${activeHand}` : ""}`} style={{ left: `${key.x * 100}%`, width: `${key.width * 100}%` }} role="img" aria-label={`${name}, ${state === "neutral" ? "not active" : state}`}>
              {settings.showLabels ? <span>{name}</span> : null}
            </div>;
          })}
        </div>
      </div> : null}
    </section>
  );
}

function ToolbarSelect({ label, value, values, format, onChange }: { label: string; value: string; values: readonly string[]; format: (value: string) => string; onChange: (value: string) => void }) {
  return <label>{label}<select aria-label={`Piano ${label.toLowerCase()}`} value={value} onChange={(event) => onChange(event.target.value)}>{values.map((item) => <option key={item} value={item}>{format(item)}</option>)}</select></label>;
}

function RollIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h3v18H4V3Zm6 5h3v13h-3V8Zm6-5h3v18h-3V3Z" /></svg>; }
function PianoIcon() { return <svg viewBox="0 0 28 20" aria-hidden="true"><path d="M2 2h24v16H2V2Zm2 2v12h4V4H4Zm6 0v12h4V4h-4Zm6 0v12h4V4h-4Zm6 0v12h2V4h-2Z" /><path className="piano-icon-black" d="M7 3h3v8H7V3Zm6 0h3v8h-3V3Zm7 0h3v8h-3V3Z" /></svg>; }
function OpaqueIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4V4Zm3 3v10h10V7H7Z" /></svg>; }
function NoteLabelIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5V4Zm3 3v2h3v8h2V9h3V7H8Z" /></svg>; }
function PlayIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13-8L7 4Z" /></svg>; }
function StopIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h12v12H6z" /></svg>; }
function LoopIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.7 7.3A8 8 0 0 0 4.6 9H2l3.5-4L9 9H6.7a6 6 0 0 1 9.6-.3L17.7 7.3Zm-10.4 9.4A8 8 0 0 0 20 15h2l-3.5 4-3.5-4h2.3a6 6 0 0 1-9.6.3l-1.4 1.4Z" /></svg>; }
function PauseIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4v16H5V4Zm7 0h4v7.2l3.5 2.1-1 1.7-4.5-2.7V4h-2Z" /></svg>; }
function ClearIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 6 1-2h8l1 2h4v2H3V6h4Zm1 4h8l-1 10H9L8 10Z" /></svg>; }
