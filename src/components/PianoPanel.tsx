import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PracticeRunMode } from "../learning/matcher";
import { midiNoteToName } from "../music/note";
import { generatePianoLayout, rangeForSettings, resolvePianoKeyState, SYNTHESIA_MIN_HEIGHT, validateCustomRange, type PianoExpectation, type PianoFingering, type PianoHeight, type PianoRangePreset, type PianoSettings, type PianoWidthMode, type SynthesiaSpeed } from "../piano/piano";
import { availableSynthesiaHeight, createSynthesiaBlocks, isSynthesiaBlockStriking, isSynthesiaBlockVisible, synthesiaVerticalGeometry } from "../piano/synthesia";
import type { PlaybackPhase, PlaybackPlan } from "../playback/playback";
import type { AudioSettings } from "../audio/settings";
import { PianoSynthEngine, type ScoreAudioEngine } from "../audio/pianoSynth";
import { AudioControls } from "./AudioControls";
import { PlayModeDialog } from "./PlayModeDialog";
import { MetronomeControls } from "./MetronomeControls";
import type { PlayMode } from "../playback/settings";

export interface PianoPanelProps {
  expectations?: PianoExpectation[];
  fingerings?: PianoFingering[];
  /** Compatibility for isolated consumers; application code should provide event-backed expectations. */
  expectedNotes?: number[];
  heldNotes: number[];
  ignoredCarriedNotes: number[];
  settings: PianoSettings;
  playbackPlan?: PlaybackPlan;
  playbackPhase: PlaybackPhase;
  rollElapsedMs: number;
  playbackElapsedMs: number;
  displayedEventIndex: number;
  canPlay: boolean;
  runMode: PracticeRunMode;
  pauseOnNotes: boolean;
  playMode?: PlayMode;
  showProgressWhilePlaying?: boolean;
  canClearPerformance: boolean;
  audioSettings?: AudioSettings;
  audioError?: string;
  tempoPercent?: number;
  writtenTempoBpm?: number;
  tempoVaries?: boolean;
  countInBars?: 0 | 1 | 2;
  seeNoteEnabled?: boolean;
  learningOpen?: boolean;
  inspectedMidiNote?: number;
  auditionEngine?: ScoreAudioEngine;
  onPanelHeightChange?: (height: number) => void;
  onSettingsChange: (update: Partial<PianoSettings> | ((current: PianoSettings) => PianoSettings)) => void;
  onTogglePlayback: () => void;
  onStop?: () => void;
  onReset: () => void;
  onSeek: (eventIndex: number) => void;
  onRunModeChange: (mode: PracticeRunMode) => void;
  onPlayModeChange?: (mode: PlayMode) => void;
  onShowProgressWhilePlayingChange?: (enabled: boolean) => void;
  onPauseOnNotesChange?: (enabled: boolean) => void;
  onClearPerformance: () => void;
  onAudioSettingsChange?: (update: Partial<AudioSettings>) => void;
  onTempoPercentChange?: (percent: number) => void;
  onCountInBarsChange?: (bars: 0 | 1 | 2) => void;
  onSeeNoteToggle?: () => void;
  onLearningOpenChange?: (open: boolean) => void;
}

const HEIGHT_LABELS: Record<PianoHeight, string> = { small: "Small", medium: "Medium", large: "Large" };
const WIDTH_LABELS: Record<PianoWidthMode, string> = { auto: "Auto", fit: "Fit", scroll: "Scroll" };
const SPEED_LABELS: Record<SynthesiaSpeed, string> = { 70: "Slow", 100: "Normal", 140: "Fast" };
const ACTIVE_ROLL_PHASES = new Set<PlaybackPhase>(["countdown", "playing", "waiting-note", "paused"]);

export function PianoPanel({ expectations, fingerings = [], expectedNotes = [], heldNotes, ignoredCarriedNotes, settings, playbackPlan, playbackPhase, rollElapsedMs, playbackElapsedMs, displayedEventIndex, canPlay, runMode, pauseOnNotes, playMode = pauseOnNotes ? "pause-each-note" : "play", showProgressWhilePlaying = false, canClearPerformance, audioSettings, audioError, tempoPercent = 100, writtenTempoBpm = 120, tempoVaries = false, countInBars = 1, seeNoteEnabled = false, learningOpen = false, inspectedMidiNote, auditionEngine: providedAuditionEngine, onPanelHeightChange, onSettingsChange, onTogglePlayback, onStop, onReset, onSeek, onRunModeChange, onPlayModeChange, onShowProgressWhilePlayingChange, onClearPerformance, onAudioSettingsChange, onTempoPercentChange, onCountInBarsChange, onSeeNoteToggle, onLearningOpenChange }: PianoPanelProps) {
  const configuredRange = rangeForSettings(settings);
  const range = inspectedMidiNote === undefined ? configuredRange : { low: Math.min(configuredRange.low, inspectedMidiNote), high: Math.max(configuredRange.high, inspectedMidiNote) };
  const pianoVisible = settings.pianoVisible || seeNoteEnabled;
  const keys = useMemo(() => generatePianoLayout(range.low, range.high), [range.high, range.low]);
  const blocks = useMemo(() => createSynthesiaBlocks(playbackPlan, keys), [keys, playbackPlan]);
  const whiteCount = keys.filter((key) => !key.isBlack).length;
  const viewportRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const keyboardRef = useRef<HTMLDivElement>(null);
  const pianoControlRef = useRef<HTMLDivElement>(null);
  const synthesiaControlRef = useRef<HTMLDivElement>(null);
  const resizeStartRef = useRef<{ y: number; height: number } | undefined>(undefined);
  const auditionIdRef = useRef(0);
  const auditionGestureRef = useRef<{ pointerId: number; activeMidiNote?: number; activeVoiceId?: string } | undefined>(undefined);
  const [auditionEngine] = useState<ScoreAudioEngine>(() => providedAuditionEngine ?? new PianoSynthEngine());
  const [auditioningNotes, setAuditioningNotes] = useState<number[]>([]);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [availableRollHeight, setAvailableRollHeight] = useState(settings.synthesiaHeight);
  const [draftRollHeight, setDraftRollHeight] = useState<number | undefined>();
  const [openOptions, setOpenOptions] = useState<"piano" | "synthesia" | undefined>();
  const [playModeOpen, setPlayModeOpen] = useState(false);
  const [acceptedHeldNotes, setAcceptedHeldNotes] = useState<number[]>([]);
  const resolvedExpectations = useMemo(() => expectations ?? expectedNotes.map((midiNote) => ({ midiNote, hand: "right" as const, strength: "active" as const })), [expectations, expectedNotes]);
  const expectedMidiNotes = resolvedExpectations.map((item) => item.midiNote);
  const expectedInRange = expectedMidiNotes.filter((note) => note >= range.low && note <= range.high);
  const outsideExpected = expectedMidiNotes.filter((note) => note < range.low || note > range.high);
  const minimumWhiteWidth = settings.widthMode === "fit" ? 0 : settings.widthMode === "scroll" ? 28 : 22;
  const minimumAllowedHeight = Math.min(SYNTHESIA_MIN_HEIGHT, availableRollHeight);
  const rollHeight = Math.max(minimumAllowedHeight, Math.min(draftRollHeight ?? settings.synthesiaHeight, availableRollHeight));
  const showBlocks = settings.synthesiaEnabled && ACTIVE_ROLL_PHASES.has(playbackPhase);
  const strikingHandByNote = useMemo(() => handMap(blocks.filter((block) => isSynthesiaBlockStriking(block, rollElapsedMs)).map((block) => ({ midiNote: block.midiNote, hand: block.hand }))), [blocks, rollElapsedMs]);
  const expectationByNote = useMemo(() => new Map(resolvedExpectations.map((item) => [item.midiNote, item])), [resolvedExpectations]);
  const fingeringsByNote = useMemo(() => {
    const result = new Map<number, PianoFingering[]>();
    for (const fingering of fingerings) result.set(fingering.midiNote, [...(result.get(fingering.midiNote) ?? []), fingering]);
    return result;
  }, [fingerings]);
  const activeWrittenNotes = useMemo(() => activeNotesAt(playbackPlan, playbackElapsedMs), [playbackElapsedMs, playbackPlan]);
  const timedFeedbackActive = playbackPhase === "playing" || playbackPhase === "waiting-note" || playbackPhase === "paused";
  const correctHeldNotes = useMemo(() => timedFeedbackActive ? heldNotes.filter((note) => activeWrittenNotes.has(note)) : [], [activeWrittenNotes, heldNotes, timedFeedbackActive]);
  const playbackCarriedNotes = timedFeedbackActive ? [...new Set([
    ...acceptedHeldNotes.filter((note) => heldNotes.includes(note) && !activeWrittenNotes.has(note)),
    ...ignoredCarriedNotes.filter((note) => heldNotes.includes(note)),
  ])] : [];

  useEffect(() => {
    if (inspectedMidiNote === undefined || !pianoVisible) return;
    const viewport = viewportRef.current;
    const target = viewport?.querySelector<HTMLElement>(`[data-midi-note="${inspectedMidiNote}"]`);
    if (!viewport || !target) return;
    const nextLeft = Math.max(0, target.offsetLeft + target.offsetWidth / 2 - viewport.clientWidth / 2);
    if (typeof viewport.scrollTo === "function") viewport.scrollTo({ left: nextLeft, behavior: "smooth" });
    else viewport.scrollLeft = nextLeft;
  }, [inspectedMidiNote, pianoVisible, range.high, range.low]);

  useLayoutEffect(() => {
    if (!timedFeedbackActive) {
      setAcceptedHeldNotes((current) => current.length ? [] : current);
      return;
    }
    setAcceptedHeldNotes((current) => {
      const next = new Set(current.filter((note) => heldNotes.includes(note)));
      for (const note of correctHeldNotes) next.add(note);
      const values = [...next];
      return values.length === current.length && values.every((note) => current.includes(note)) ? current : values;
    });
  }, [correctHeldNotes, heldNotes, timedFeedbackActive]);

  useEffect(() => {
    auditionEngine.setOutput(audioSettings?.volume ?? 65, audioSettings?.muted ?? false);
  }, [audioSettings?.muted, audioSettings?.volume, auditionEngine]);

  useEffect(() => () => {
    auditionEngine.close();
  }, [auditionEngine]);

  useEffect(() => {
    if (!openOptions) return;
    const closeOnPointer = (event: PointerEvent) => {
      const active = openOptions === "piano" ? pianoControlRef.current : synthesiaControlRef.current;
      if (!active?.contains(event.target as Node)) setOpenOptions(undefined);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpenOptions(undefined); };
    document.addEventListener("pointerdown", closeOnPointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOnPointer); document.removeEventListener("keydown", closeOnEscape); };
  }, [openOptions]);

  const releaseAuditionVoice = useCallback(() => {
    const voiceId = auditionGestureRef.current?.activeVoiceId;
    if (voiceId) {
      if (auditionEngine.stopNote) auditionEngine.stopNote(voiceId);
      else auditionEngine.stopAll();
    }
    if (auditionGestureRef.current) {
      auditionGestureRef.current.activeMidiNote = undefined;
      auditionGestureRef.current.activeVoiceId = undefined;
    }
    setAuditioningNotes([]);
  }, [auditionEngine]);

  const auditionNote = useCallback((midiNote: number) => {
    const gesture = auditionGestureRef.current;
    if (!gesture || gesture.activeMidiNote === midiNote) return;
    releaseAuditionVoice();
    const id = ++auditionIdRef.current;
    const voiceId = `pointer:${id}:${midiNote}`;
    gesture.activeMidiNote = midiNote;
    gesture.activeVoiceId = voiceId;
    setAuditioningNotes([midiNote]);
    void auditionEngine.prepare().then(() => {
      if (auditionGestureRef.current?.activeVoiceId !== voiceId) return;
      auditionEngine.setOutput(audioSettings?.volume ?? 65, audioSettings?.muted ?? false);
      auditionEngine.scheduleNote(voiceId, midiNote, 0, 600_000);
    }).catch(() => undefined);
  }, [audioSettings?.muted, audioSettings?.volume, auditionEngine, releaseAuditionVoice]);

  const beginAudition = useCallback((pointerId: number, midiNote: number) => {
    if (auditionGestureRef.current) return;
    auditionGestureRef.current = { pointerId };
    auditionNote(midiNote);
  }, [auditionNote]);

  const enterAuditionKey = useCallback((pointerId: number, midiNote: number) => {
    if (auditionGestureRef.current?.pointerId !== pointerId) return;
    auditionNote(midiNote);
  }, [auditionNote]);

  const finishAudition = useCallback((pointerId: number) => {
    if (auditionGestureRef.current?.pointerId !== pointerId) return;
    releaseAuditionVoice();
    auditionGestureRef.current = undefined;
  }, [releaseAuditionVoice]);

  useEffect(() => {
    const finish = (event: PointerEvent) => finishAudition(event.pointerId);
    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", finish);
    return () => {
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", finish);
    };
  }, [finishAudition]);

  const measurePiano = useCallback(() => {
    const panel = panelRef.current;
    const toolbar = toolbarRef.current;
    const viewport = viewportRef.current;
    const keyboard = keyboardRef.current;
    if (!panel || !toolbar) return;
    setContentWidth(pianoVisible && keyboard ? keyboard.scrollWidth : panel.clientWidth);
    if (!pianoVisible) setScrollLeft(0);
    const strikeTop = pianoVisible && viewport ? viewport.getBoundingClientRect().top : toolbar.getBoundingClientRect().top;
    const headerBottom = document.querySelector<HTMLElement>(".app-header")?.getBoundingClientRect().bottom ?? 0;
    setAvailableRollHeight(availableSynthesiaHeight(strikeTop, headerBottom));
  }, [pianoVisible]);

  useEffect(() => {
    measurePiano();
    window.addEventListener("resize", measurePiano);
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measurePiano);
    if (panelRef.current) observer?.observe(panelRef.current);
    if (toolbarRef.current) observer?.observe(toolbarRef.current);
    if (keyboardRef.current) observer?.observe(keyboardRef.current);
    if (viewportRef.current) observer?.observe(viewportRef.current);
    const header = document.querySelector<HTMLElement>(".app-header");
    if (header) observer?.observe(header);
    return () => { window.removeEventListener("resize", measurePiano); observer?.disconnect(); };
  }, [measurePiano, settings.height, settings.synthesiaEnabled, settings.widthMode]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || !onPanelHeightChange) return;
    const synthesia = panel.querySelector<HTMLElement>(".synthesia-panel");
    const report = () => {
      const panelBounds = panel.getBoundingClientRect();
      const top = synthesia ? Math.min(panelBounds.top, synthesia.getBoundingClientRect().top) : panelBounds.top;
      onPanelHeightChange(Math.ceil(panelBounds.bottom - top));
    };
    report();
    window.addEventListener("resize", report);
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(report);
    observer?.observe(panel);
    if (synthesia) observer?.observe(synthesia);
    return () => { window.removeEventListener("resize", report); observer?.disconnect(); };
  }, [onPanelHeightChange, pianoVisible, rollHeight, settings.synthesiaEnabled]);

  useEffect(() => {
    if (!pianoVisible || settings.widthMode === "fit" || expectedInRange.length === 0) return;
    if (settings.synthesiaEnabled && settings.widthMode === "scroll") return;
    if (settings.synthesiaEnabled && settings.widthMode === "auto" && showBlocks) return;
    const viewport = viewportRef.current;
    const target = viewport?.querySelector<HTMLElement>(`[data-midi-note="${expectedInRange[0]}"]`);
    if (!viewport || !target) return;
    const left = target.offsetLeft;
    const right = left + target.offsetWidth;
    if ((left < viewport.scrollLeft || right > viewport.scrollLeft + viewport.clientWidth) && typeof target.scrollIntoView === "function") target.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [expectedInRange, pianoVisible, settings.synthesiaEnabled, settings.widthMode, showBlocks]);

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
    onSettingsChange({ rangePreset: "custom", customLow: expanded.low, customHigh: expanded.high, pianoVisible: true });
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
    <section ref={panelRef} className={`piano-panel height-${settings.height}${pianoVisible ? "" : " piano-hidden"}${settings.synthesiaEnabled ? " synthesia-open" : ""}${playbackPlan ? " timeline-visible" : ""}`} style={{ "--piano-expected": settings.expectedColor, "--piano-correct": settings.correctColor, "--piano-wrong": settings.wrongColor, "--see-note": settings.seeNoteColor, "--play-right": settings.playRightColor, "--play-left": settings.playLeftColor, "--synthesia-right": settings.synthesiaRightColor, "--synthesia-left": settings.synthesiaLeftColor, "--synthesia-height": `${rollHeight}px` } as React.CSSProperties} aria-label="Practice toolbar and piano">
      {settings.synthesiaEnabled ? <div className={`synthesia-panel${settings.synthesiaOpaque ? " opaque" : ""}`} style={{ height: rollHeight }} aria-label="Synthesia falling notes">
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
      <div className="piano-toolbar" ref={toolbarRef} role="toolbar" aria-label="Practice controls">
        <div className="piano-toolbar-section toolbar-left">
          <button type="button" className={`toolbar-icon-button see-note-toggle${seeNoteEnabled ? " active" : ""}`} aria-label="See Note" aria-pressed={seeNoteEnabled} disabled={playbackPhase !== "idle" && playbackPhase !== "paused"} title="Identify written notes" onClick={onSeeNoteToggle}><EyeIcon /></button>
          <div className="toolbar-control-group" ref={pianoControlRef}>
            <button type="button" className={`toolbar-icon-button piano-toggle${settings.pianoVisible ? " active" : ""}`} aria-label={settings.pianoVisible ? "Hide piano" : "Show piano"} title={settings.pianoVisible ? "Hide piano" : "Show piano"} aria-pressed={settings.pianoVisible} onClick={() => onSettingsChange({ pianoVisible: !settings.pianoVisible })}><PianoIcon /></button>
            <button type="button" className="toolbar-icon-button toolbar-options-button" aria-label="Piano options" aria-expanded={openOptions === "piano"} aria-haspopup="dialog" title="Piano options" onClick={() => setOpenOptions((current) => current === "piano" ? undefined : "piano")}><ChevronDownIcon /></button>
            {openOptions === "piano" ? <div className="toolbar-options-popover piano-options-popover" role="dialog" aria-label="Piano options">
              <strong>Piano</strong>
              <label className="toolbar-checkbox"><input type="checkbox" checked={settings.showLabels} onChange={(event) => onSettingsChange({ showLabels: event.target.checked })} /> Note names</label>
              <label className="toolbar-checkbox"><input type="checkbox" checked={settings.showTrainingFingerings} onChange={(event) => onSettingsChange({ showTrainingFingerings: event.target.checked })} /> Finger numbers in training</label>
              <ToolbarSelect label="Range" value={settings.rangePreset} values={["88", "76", "61", "49", "custom"]} format={(value) => value === "custom" ? "Custom" : `${value} keys`} onChange={(value) => onSettingsChange({ rangePreset: value as PianoRangePreset })} />
              {settings.rangePreset === "custom" ? <div className="piano-custom-range">
                <label>Low <input aria-label="Custom low MIDI note" type="number" min="21" max="96" value={settings.customLow} onChange={(event) => { const next = validateCustomRange(Number(event.target.value), settings.customHigh); onSettingsChange({ customLow: next.low, customHigh: next.high }); }} /></label>
                <label>High <input aria-label="Custom high MIDI note" type="number" min="33" max="108" value={settings.customHigh} onChange={(event) => { const next = validateCustomRange(settings.customLow, Number(event.target.value)); onSettingsChange({ customLow: next.low, customHigh: next.high }); }} /></label>
              </div> : null}
              <ToolbarSelect label="Height" value={settings.height} values={["small", "medium", "large"]} format={(value) => HEIGHT_LABELS[value as PianoHeight]} onChange={(value) => onSettingsChange({ height: value as PianoHeight })} />
              <ToolbarSelect label="Width" value={settings.widthMode} values={["auto", "fit", "scroll"]} format={(value) => WIDTH_LABELS[value as PianoWidthMode]} onChange={(value) => onSettingsChange({ widthMode: value as PianoWidthMode })} />
              <span className="piano-range-name">{midiNoteToName(range.low)}–{midiNoteToName(range.high)}</span>
            </div> : null}
          </div>
          <div className="toolbar-control-group" ref={synthesiaControlRef}>
            <button type="button" className={`toolbar-icon-button${settings.synthesiaEnabled ? " active" : ""}`} aria-label="Toggle Synthesia" aria-pressed={settings.synthesiaEnabled} title={settings.synthesiaEnabled ? "Synthesia on" : "Synthesia off"} onClick={() => {
              const enabled = !settings.synthesiaEnabled;
              if (enabled) onLearningOpenChange?.(false);
              onSettingsChange({ synthesiaEnabled: enabled });
            }}><RollIcon /></button>
            <button type="button" className="toolbar-icon-button toolbar-options-button" aria-label="Synthesia options" aria-expanded={openOptions === "synthesia"} aria-haspopup="dialog" title="Synthesia options" onClick={() => setOpenOptions((current) => current === "synthesia" ? undefined : "synthesia")}><ChevronDownIcon /></button>
            {openOptions === "synthesia" ? <div className="toolbar-options-popover synthesia-options-popover" role="dialog" aria-label="Synthesia options">
              <strong>Synthesia</strong>
              <label className="toolbar-checkbox"><input type="checkbox" checked={settings.synthesiaOpaque} onChange={(event) => onSettingsChange({ synthesiaOpaque: event.target.checked })} /> Opaque background</label>
              <label className="toolbar-checkbox"><input type="checkbox" checked={settings.synthesiaShowNoteLabels} onChange={(event) => onSettingsChange({ synthesiaShowNoteLabels: event.target.checked })} /> Falling note labels</label>
              <ToolbarSelect label="Roll speed" value={String(settings.synthesiaSpeed)} values={["70", "100", "140"]} format={(value) => SPEED_LABELS[Number(value) as SynthesiaSpeed]} onChange={(value) => onSettingsChange({ synthesiaSpeed: Number(value) as SynthesiaSpeed })} />
            </div> : null}
          </div>
          <button type="button" className={`toolbar-icon-button learning-toggle${learningOpen ? " active" : ""}`} aria-label="Toggle Learning" aria-pressed={learningOpen} disabled={playbackPhase !== "idle"} title={learningOpen ? "Learning on" : "Learning off"} onClick={() => {
            const open = !learningOpen;
            setOpenOptions(undefined);
            if (open && settings.synthesiaEnabled) onSettingsChange({ synthesiaEnabled: false });
            onLearningOpenChange?.(open);
          }}><LearningIcon /></button>
        </div>
        <div className="piano-toolbar-section piano-transport-controls toolbar-centre" role="group" aria-label="Playback controls">
            <div className="play-control-group"><button type="button" aria-label={playbackPhase === "idle" ? "Play score from piano" : playbackPhase === "paused" ? "Resume score from piano" : "Pause playback from piano"} title={playbackPhase === "idle" ? "Play" : playbackPhase === "paused" ? "Resume" : "Pause"} disabled={!canPlay} onClick={onTogglePlayback}>{playbackPhase === "idle" || playbackPhase === "paused" ? <PlayIcon /> : <TransportPauseIcon />}</button><button type="button" className="toolbar-icon-button toolbar-options-button" aria-label="Choose play mode from piano" title="Play mode" aria-haspopup="dialog" onClick={() => setPlayModeOpen(true)}><ChevronDownIcon /></button></div>
            <button type="button" aria-label="Stop score playback from piano" title="Stop" disabled={!canStop(playbackPhase)} onClick={onStop}><StopIcon /></button>
            <button type="button" className={runMode === "loop" ? "active" : ""} aria-label="Loop from piano" aria-pressed={runMode === "loop"} disabled={playbackPhase !== "idle"} title={runMode === "loop" ? "Loop on" : "Loop off"} onClick={() => onRunModeChange(runMode === "loop" ? "once" : "loop")}><LoopIcon /></button>
            <button type="button" aria-label="Clear performance from piano" title="Clear performance" disabled={!canClearPerformance} onClick={onClearPerformance}><ClearIcon /></button>
            <button type="button" aria-label="Reset score progress from piano" title="Reset" disabled={!canPlay} onClick={onReset}><ResetIcon /></button>
        </div>
        <div className="piano-toolbar-section toolbar-right">
          {audioSettings && onAudioSettingsChange && onTempoPercentChange && onCountInBarsChange ? <MetronomeControls settings={audioSettings} tempoPercent={tempoPercent} tempoDisabled={playbackPhase !== "idle"} writtenTempoBpm={writtenTempoBpm} tempoVaries={tempoVaries} countInBars={countInBars} onAudioSettingsChange={onAudioSettingsChange} onTempoPercentChange={onTempoPercentChange} onCountInBarsChange={onCountInBarsChange} /> : null}
          {audioSettings && onAudioSettingsChange ? <AudioControls settings={audioSettings} error={audioError} onSettingsChange={onAudioSettingsChange} compact /> : null}
        </div>
      </div>
      {playModeOpen ? <PlayModeDialog value={playMode} showProgress={showProgressWhilePlaying} onChange={(mode) => { onPlayModeChange?.(mode); setPlayModeOpen(false); }} onShowProgressChange={(enabled) => onShowProgressWhilePlayingChange?.(enabled)} onClose={() => setPlayModeOpen(false)} /> : null}
      {pianoVisible && outsideExpected.length > 0 ? <div className="piano-warning" role="status">Expected {outsideExpected.map(midiNoteToName).join(", ")} {outsideExpected.length === 1 ? "is" : "are"} outside this keyboard. <button type="button" onClick={revealExpected}>Reveal expected</button></div> : null}
      {pianoVisible ? <div className={`piano-viewport width-${settings.widthMode}`} ref={viewportRef} onScroll={(event) => setScrollLeft(event.currentTarget.scrollLeft)}>
        <div className="piano-lane-layer" aria-hidden="true" />
        <div className="piano-keyboard" ref={keyboardRef} style={{ minWidth: minimumWhiteWidth ? `${whiteCount * minimumWhiteWidth}px` : undefined }}>
          {keys.map((key) => {
            const expectation = expectationByNote.get(key.midiNote);
            const visualExpected = expectedMidiNotes;
            const visualCarried = playbackPhase === "idle" ? ignoredCarriedNotes : playbackCarriedNotes;
            const visualHeld = correctHeldNotes.includes(key.midiNote) ? [...heldNotes] : heldNotes;
            const state = correctHeldNotes.includes(key.midiNote) ? "correct" : resolvePianoKeyState(key.midiNote, visualExpected, visualHeld, visualCarried);
            const name = midiNoteToName(key.midiNote);
            const keyFingerings = settings.showTrainingFingerings ? fingeringsByNote.get(key.midiNote) ?? [] : [];
            const leftFingers = keyFingerings.filter((item) => item.hand === "left").map((item) => item.finger).join("/");
            const rightFingers = keyFingerings.filter((item) => item.hand === "right").map((item) => item.finger).join("/");
            const strikingHand = showBlocks ? strikingHandByNote.get(key.midiNote) : undefined;
            return <div key={key.midiNote} data-midi-note={key.midiNote} className={`piano-key ${key.isBlack ? "black" : "white"} state-${state}${expectation && state === "expected" ? ` play-expected hand-${expectation.hand} expectation-${expectation.strength}` : ""}${strikingHand && !(expectation && state === "expected") ? ` synthesia-active hand-${strikingHand}` : ""}${auditioningNotes.includes(key.midiNote) ? " auditioning" : ""}${inspectedMidiNote === key.midiNote ? " inspected" : ""}`} style={{ left: `${key.x * 100}%`, width: `${key.width * 100}%` }} role="button" tabIndex={-1} aria-label={`${name}, ${state === "neutral" ? "not active" : state}${keyFingerings.length ? `, ${keyFingerings.map((item) => `${item.hand} hand finger ${item.finger}`).join(", ")}` : ""}${inspectedMidiNote === key.midiNote ? ", inspected score note" : ""}`} onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); beginAudition(event.pointerId, key.midiNote); }} onPointerEnter={(event) => enterAuditionKey(event.pointerId, key.midiNote)} onPointerUp={(event) => finishAudition(event.pointerId)} onPointerCancel={(event) => finishAudition(event.pointerId)}>
              {leftFingers ? <span className="piano-finger-number hand-left">{leftFingers}</span> : null}
              {rightFingers ? <span className="piano-finger-number hand-right">{rightFingers}</span> : null}
              {settings.showLabels ? <span className="piano-note-name">{name}</span> : null}
            </div>;
          })}
        </div>
      </div> : null}
      {playbackPlan ? <ScoreTimeline plan={playbackPlan} phase={playbackPhase} elapsedMs={playbackElapsedMs} displayedEventIndex={displayedEventIndex} onSeek={onSeek} /> : null}
    </section>
  );
}

function ScoreTimeline({ plan, phase, elapsedMs, displayedEventIndex, onSeek }: { plan: PlaybackPlan; phase: PlaybackPhase; elapsedMs: number; displayedEventIndex: number; onSeek: (eventIndex: number) => void }) {
  const displayed = plan.events.find((item) => item.eventIndex === displayedEventIndex);
  const positionMs = phase === "idle" ? displayed?.onsetMs ?? 0 : elapsedMs;
  const duration = Math.max(1, plan.durationMs);
  const seek = (value: number) => {
    const nearest = [...plan.events].sort((a, b) => Math.abs(a.onsetMs - value) - Math.abs(b.onsetMs - value))[0];
    if (nearest) onSeek(nearest.eventIndex);
  };
  return <div className="score-timeline" aria-label="Score timeline">
    <span className="score-timeline-time">{formatTimelineTime(positionMs)}</span>
    <div className="score-timeline-track" style={{ "--timeline-progress": Math.min(100, Math.max(0, positionMs / duration * 100)) } as React.CSSProperties}>
      <div className="score-timeline-progress" style={{ width: `${Math.min(100, Math.max(0, positionMs / duration * 100))}%` }} />
      <div className="score-timeline-events" aria-hidden="true">{plan.events.map((item) => {
        const hand = item.event.staffNumbers.includes(1) && item.event.staffNumbers.includes(2) ? "both" : item.event.staffNumbers.includes(2) ? "left" : "right";
        return <span key={`${item.eventIndex}-${item.onsetMs}`} className={`score-timeline-event hand-${hand}`} style={{ left: `${item.onsetMs / duration * 100}%` }} />;
      })}</div>
      <input aria-label="Seek score timeline" type="range" min="0" max={Math.round(duration)} step="1" value={Math.round(Math.min(duration, Math.max(0, positionMs)))} onChange={(event) => seek(Number(event.target.value))} />
    </div>
    <span className="score-timeline-time">{formatTimelineTime(duration)}</span>
  </div>;
}

function formatTimelineTime(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function ToolbarSelect({ label, value, values, format, onChange }: { label: string; value: string; values: readonly string[]; format: (value: string) => string; onChange: (value: string) => void }) {
  return <label>{label}<select aria-label={`Piano ${label.toLowerCase()}`} value={value} onChange={(event) => onChange(event.target.value)}>{values.map((item) => <option key={item} value={item}>{format(item)}</option>)}</select></label>;
}

function RollIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h3v18H4V3Zm6 5h3v13h-3V8Zm6-5h3v18h-3V3Z" /></svg>; }
function LearningIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4.5C6.8 4.1 9.8 5 12 7c2.2-2 5.2-2.9 9-2.5v14c-3.7-.4-6.7.5-9 2.5-2.3-2-5.3-2.9-9-2.5v-14Zm2 2.1v9.8c2.3 0 4.3.5 6 1.5V8.8C9.4 7.3 7.4 6.6 5 6.6Zm14 0c-2.4 0-4.4.7-6 2.2v9.1c1.7-1 3.7-1.5 6-1.5V6.6Z" /></svg>; }
function PianoIcon() { return <svg viewBox="0 0 28 20" aria-hidden="true"><path d="M2 2h24v16H2V2Zm2 2v12h4V4H4Zm6 0v12h4V4h-4Zm6 0v12h4V4h-4Zm6 0v12h2V4h-2Z" /><path className="piano-icon-black" d="M7 3h3v8H7V3Zm6 0h3v8h-3V3Zm7 0h3v8h-3V3Z" /></svg>; }
function EyeIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5c5.5 0 9.5 5.2 9.5 7s-4 7-9.5 7S2.5 13.8 2.5 12 6.5 5 12 5Zm0 2c-3.7 0-6.6 3.2-7.4 5 .8 1.8 3.7 5 7.4 5s6.6-3.2 7.4-5c-.8-1.8-3.7-5-7.4-5Zm0 2.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6Z" /></svg>; }
function ChevronDownIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 8 7 7 7-7-2-2-5 5-5-5-2 2Z" /></svg>; }
function PlayIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13-8L7 4Z" /></svg>; }
function TransportPauseIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4v16H6V4Zm8 0h4v16h-4V4Z" /></svg>; }
function StopIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5V5Z" /></svg>; }
function ResetIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.1 7.2A8 8 0 1 1 4 14h2.1a6 6 0 1 0 .8-5.2L10 12H2V4l3.1 3.2Z" /></svg>; }
function LoopIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.7 7.3A8 8 0 0 0 4.6 9H2l3.5-4L9 9H6.7a6 6 0 0 1 9.6-.3L17.7 7.3Zm-10.4 9.4A8 8 0 0 0 20 15h2l-3.5 4-3.5-4h2.3a6 6 0 0 1-9.6.3l-1.4 1.4Z" /></svg>; }
function ClearIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 6 1-2h8l1 2h4v2H3V6h4Zm1 4h8l-1 10H9L8 10Z" /></svg>; }

type PianoHand = "right" | "left" | "both";

function canStop(phase: PlaybackPhase): boolean { return phase === "countdown" || phase === "playing" || phase === "waiting-note" || phase === "paused" || phase === "waiting-restart"; }

function activeNotesAt(plan: PlaybackPlan | undefined, elapsedMs: number): Set<number> {
  return new Set(plan?.events.filter((item) => item.onsetMs <= elapsedMs + 0.001 && item.endMs > elapsedMs + 0.001).flatMap((item) => item.event.midiNotes) ?? []);
}

function handMap(items: { midiNote: number; hand: "right" | "left" }[]): Map<number, PianoHand> {
  const result = new Map<number, PianoHand>();
  for (const item of items) {
    const current = result.get(item.midiNote);
    result.set(item.midiNote, current && current !== item.hand ? "both" : item.hand);
  }
  return result;
}
