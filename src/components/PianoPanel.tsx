import { useEffect, useMemo, useRef } from "react";
import { midiNoteToName } from "../music/note";
import { generatePianoLayout, rangeForSettings, resolvePianoKeyState, validateCustomRange, type PianoHeight, type PianoRangePreset, type PianoSettings, type PianoWidthMode } from "../piano/piano";

export interface PianoPanelProps {
  expectedNotes: number[];
  heldNotes: number[];
  ignoredCarriedNotes: number[];
  settings: PianoSettings;
  onSettingsChange: (update: Partial<PianoSettings> | ((current: PianoSettings) => PianoSettings)) => void;
}

const HEIGHT_LABELS: Record<PianoHeight, string> = { small: "Small", medium: "Medium", large: "Large" };
const WIDTH_LABELS: Record<PianoWidthMode, string> = { auto: "Auto", fit: "Fit", scroll: "Scroll" };

export function PianoPanel({ expectedNotes, heldNotes, ignoredCarriedNotes, settings, onSettingsChange }: PianoPanelProps) {
  const range = rangeForSettings(settings);
  const keys = useMemo(() => generatePianoLayout(range.low, range.high), [range.high, range.low]);
  const whiteCount = keys.filter((key) => !key.isBlack).length;
  const viewportRef = useRef<HTMLDivElement>(null);
  const expectedInRange = expectedNotes.filter((note) => note >= range.low && note <= range.high);
  const outsideExpected = expectedNotes.filter((note) => note < range.low || note > range.high);
  const minimumWhiteWidth = settings.widthMode === "fit" ? 0 : settings.widthMode === "scroll" ? 28 : 22;

  useEffect(() => {
    if (!settings.expanded || settings.widthMode === "fit" || expectedInRange.length === 0) return;
    const viewport = viewportRef.current;
    const target = viewport?.querySelector<HTMLElement>(`[data-midi-note="${expectedInRange[0]}"]`);
    if (!viewport || !target) return;
    const left = target.offsetLeft;
    const right = left + target.offsetWidth;
    if ((left < viewport.scrollLeft || right > viewport.scrollLeft + viewport.clientWidth) && typeof target.scrollIntoView === "function") target.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [expectedInRange, settings.expanded, settings.widthMode]);

  const revealExpected = () => {
    if (outsideExpected.length === 0) return;
    const expanded = validateCustomRange(Math.min(range.low, ...outsideExpected), Math.max(range.high, ...outsideExpected));
    onSettingsChange({ rangePreset: "custom", customLow: expanded.low, customHigh: expanded.high, expanded: true });
  };

  return (
    <section className={`piano-panel height-${settings.height}${settings.expanded ? "" : " collapsed"}`} style={{ "--piano-expected": settings.expectedColor, "--piano-correct": settings.correctColor, "--piano-wrong": settings.wrongColor } as React.CSSProperties} aria-label="Piano keyboard">
      <div className="piano-toolbar">
        <button type="button" className="piano-toggle" aria-expanded={settings.expanded} onClick={() => onSettingsChange({ expanded: !settings.expanded })}>{settings.expanded ? "Hide piano" : "Show piano"}</button>
        {settings.expanded ? <>
          <label><input type="checkbox" checked={settings.showLabels} onChange={(event) => onSettingsChange({ showLabels: event.target.checked })} /> Note names</label>
          <ToolbarSelect label="Range" value={settings.rangePreset} values={["88", "76", "61", "49", "custom"]} format={(value) => value === "custom" ? "Custom" : `${value} keys`} onChange={(value) => onSettingsChange({ rangePreset: value as PianoRangePreset })} />
          {settings.rangePreset === "custom" ? <div className="piano-custom-range">
            <label>Low <input aria-label="Custom low MIDI note" type="number" min="21" max="96" value={settings.customLow} onChange={(event) => { const next = validateCustomRange(Number(event.target.value), settings.customHigh); onSettingsChange({ customLow: next.low, customHigh: next.high }); }} /></label>
            <label>High <input aria-label="Custom high MIDI note" type="number" min="33" max="108" value={settings.customHigh} onChange={(event) => { const next = validateCustomRange(settings.customLow, Number(event.target.value)); onSettingsChange({ customLow: next.low, customHigh: next.high }); }} /></label>
          </div> : null}
          <ToolbarSelect label="Height" value={settings.height} values={["small", "medium", "large"]} format={(value) => HEIGHT_LABELS[value as PianoHeight]} onChange={(value) => onSettingsChange({ height: value as PianoHeight })} />
          <ToolbarSelect label="Width" value={settings.widthMode} values={["auto", "fit", "scroll"]} format={(value) => WIDTH_LABELS[value as PianoWidthMode]} onChange={(value) => onSettingsChange({ widthMode: value as PianoWidthMode })} />
          <span className="piano-range-name">{midiNoteToName(range.low)}–{midiNoteToName(range.high)}</span>
        </> : null}
      </div>
      {settings.expanded && outsideExpected.length > 0 ? <div className="piano-warning" role="status">Expected {outsideExpected.map(midiNoteToName).join(", ")} {outsideExpected.length === 1 ? "is" : "are"} outside this keyboard. <button type="button" onClick={revealExpected}>Reveal expected</button></div> : null}
      {settings.expanded ? <div className={`piano-viewport width-${settings.widthMode}`} ref={viewportRef}>
        <div className="piano-lane-layer" aria-hidden="true" />
        <div className="piano-keyboard" style={{ minWidth: minimumWhiteWidth ? `${whiteCount * minimumWhiteWidth}px` : undefined }}>
          {keys.map((key) => {
            const state = resolvePianoKeyState(key.midiNote, expectedNotes, heldNotes, ignoredCarriedNotes);
            const name = midiNoteToName(key.midiNote);
            return <div key={key.midiNote} data-midi-note={key.midiNote} className={`piano-key ${key.isBlack ? "black" : "white"} state-${state}`} style={{ left: `${key.x * 100}%`, width: `${key.width * 100}%` }} role="img" aria-label={`${name}, ${state === "neutral" ? "not active" : state}`}>
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
