import { useEffect, useRef, useState } from "react";
import type { AudioSettings } from "../audio/settings";

export function AudioControls({ settings, error, onSettingsChange, compact = false }: { settings: AudioSettings; error?: string; onSettingsChange: (update: Partial<AudioSettings>) => void; compact?: boolean }) {
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

  const level = settings.muted || settings.volume === 0 ? "muted" : settings.volume < 45 ? "low" : "normal";
  return <div className={`audio-controls${compact ? " compact" : ""}`} ref={shellRef}>
    <button type="button" className={settings.muted ? "active" : ""} aria-label="Score audio controls" aria-expanded={open} aria-haspopup="dialog" title={settings.muted ? "Score audio muted" : `Score audio ${settings.volume}%`} onClick={() => setOpen((current) => !current)}><SpeakerIcon level={level} /></button>
    {open ? <div className="audio-popover" role="dialog" aria-label="Score audio settings">
      <div className="audio-popover-heading"><strong>Score audio</strong><span>{settings.muted ? "Muted" : `${settings.volume}%`}</span></div>
      <label>Volume<input aria-label="Score audio volume" type="range" min="0" max="100" step="1" value={settings.volume} onInput={(event) => onSettingsChange({ volume: Number(event.currentTarget.value), muted: false })} /></label>
      <button type="button" className="audio-mute-button" aria-pressed={settings.muted} onClick={() => onSettingsChange({ muted: !settings.muted })}>{settings.muted ? "Unmute" : "Mute"}</button>
      {error ? <p className="audio-error" role="status">{error}</p> : null}
    </div> : null}
  </div>;
}

function SpeakerIcon({ level }: { level: "muted" | "low" | "normal" }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z" />{level === "muted" ? <path d="m16 9 5 6m0-6-5 6" className="speaker-wave" /> : <path d={level === "low" ? "M16 9.5a4 4 0 0 1 0 5" : "M16 8a6 6 0 0 1 0 8m2-10a9 9 0 0 1 0 12"} className="speaker-wave" />}</svg>;
}
