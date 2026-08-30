import { useEffect, useRef, useState } from "react";
import type { AudioSettings } from "../audio/settings";

export function MetronomeControls({ settings, tempoPercent, tempoDisabled, writtenTempoBpm, tempoVaries, countInBars, onAudioSettingsChange, onTempoPercentChange, onCountInBarsChange }: {
  settings: AudioSettings;
  tempoPercent: number;
  tempoDisabled: boolean;
  writtenTempoBpm: number;
  tempoVaries: boolean;
  countInBars: 0 | 1 | 2;
  onAudioSettingsChange: (update: Partial<AudioSettings>) => void;
  onTempoPercentChange: (percent: number) => void;
  onCountInBarsChange: (bars: 0 | 1 | 2) => void;
}) {
  const [open, setOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOnPointer = (event: PointerEvent) => { if (!shellRef.current?.contains(event.target as Node)) setOpen(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", closeOnPointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOnPointer); document.removeEventListener("keydown", closeOnEscape); };
  }, [open]);
  const effective = Math.round(writtenTempoBpm * tempoPercent) / 100;
  return <div className="toolbar-control-group metronome-control" ref={shellRef}>
    <button type="button" className={`toolbar-icon-button${settings.metronomeEnabled ? " active" : ""}`} aria-label="Toggle metronome" aria-pressed={settings.metronomeEnabled} title={settings.metronomeEnabled ? "Metronome on" : "Metronome off"} onClick={() => onAudioSettingsChange({ metronomeEnabled: !settings.metronomeEnabled })}><MetronomeIcon /></button>
    <button type="button" className="toolbar-icon-button toolbar-options-button" aria-label="Metronome and tempo options" aria-expanded={open} aria-haspopup="dialog" title="Metronome and tempo" onClick={() => setOpen((current) => !current)}><ChevronDownIcon /></button>
    {open ? <div className="toolbar-options-popover metronome-options-popover" role="dialog" aria-label="Metronome and tempo options">
      <div className="metronome-options-heading"><strong>Tempo</strong><span>{tempoPercent}%</span></div>
      <p className="settings-hint">{tempoVaries ? `Written tempo varies; starts at ${writtenTempoBpm} BPM.` : `Written ${writtenTempoBpm} BPM.`} Effective start: {effective} BPM.</p>
      <label>Speed<input aria-label="Score tempo percentage" type="range" min="40" max="200" step="5" value={tempoPercent} disabled={tempoDisabled} onInput={(event) => onTempoPercentChange(Number(event.currentTarget.value))} /></label>
      <button type="button" className="secondary-button tempo-reset-button" disabled={tempoDisabled || tempoPercent === 100} onClick={() => onTempoPercentChange(100)}>Written tempo (100%)</button>
      <fieldset className="count-in-options" disabled={tempoDisabled}><legend>Count-in</legend>{([0, 1, 2] as const).map((bars) => <button key={bars} type="button" className={countInBars === bars ? "selected" : ""} aria-pressed={countInBars === bars} onClick={() => onCountInBarsChange(bars)}>{bars === 0 ? "Off" : `${bars} bar${bars === 1 ? "" : "s"}`}</button>)}</fieldset>
      {tempoDisabled ? <p className="settings-hint">Tempo and count-in can be changed when playback is idle.</p> : null}
    </div> : null}
  </div>;
}

function MetronomeIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l4 18H5L9 3Zm1.6 2L7.5 19h9L13.4 5h-2.8Z" /><path d="m12.7 7 1.5.4-2.4 8.8-1.5-.4L12.7 7Z" /><circle cx="11" cy="16.5" r="1.5" /></svg>; }
function ChevronDownIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 8 7 7 7-7-2-2-5 5-5-5-2 2Z" /></svg>; }
