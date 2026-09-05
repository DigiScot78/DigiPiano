import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import type { PlayMode } from "../playback/settings";

const OPTIONS: { mode: PlayMode; title: string; description: string }[] = [
  { mode: "play", title: "Play", description: "Follow the score tempo and record timing and pitch." },
  { mode: "pause-each-note", title: "Pause at each note", description: "Follow the score tempo, pausing at each note or chord until it is played correctly." },
  { mode: "practice", title: "Practice", description: "Ignore tempo and move to the next note or chord immediately when correct, while recording mistakes." },
];

export function PlayModeDialog({ value, showProgress, onChange, onShowProgressChange, onClose }: { value: PlayMode; showProgress: boolean; onChange: (mode: PlayMode) => void; onShowProgressChange: (enabled: boolean) => void; onClose: () => void }) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    closeRef.current?.focus();
    const closeFromEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", closeFromEscape);
    return () => { window.removeEventListener("keydown", closeFromEscape); previousFocus?.focus(); };
  }, []);

  return createPortal(<div className="modal-backdrop play-mode-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="play-mode-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header><div><h2 id={titleId}>Play mode</h2><p>Choose how the score advances and records your performance.</p></div><button ref={closeRef} type="button" className="dialog-close" aria-label="Close play mode" onClick={onClose}>×</button></header>
      <div className="play-mode-options" role="radiogroup" aria-label="Play mode">
        {OPTIONS.map((option) => <label key={option.mode} className={`play-mode-option${value === option.mode ? " selected" : ""}`}>
          <input type="radio" name="play-mode" value={option.mode} checked={value === option.mode} onChange={() => onChange(option.mode)} />
          <span><strong>{option.title}</strong><small>{option.description}</small></span>
        </label>)}
      </div>
      <footer className="play-mode-toolbar" aria-label="Play display options">
        <label><input type="checkbox" checked={showProgress} onChange={(event) => onShowProgressChange(event.target.checked)} /><span><strong>Show progress while playing</strong><small>Display recorded correct and wrong markers during active playback.</small></span></label>
      </footer>
    </section>
  </div>, document.body);
}
