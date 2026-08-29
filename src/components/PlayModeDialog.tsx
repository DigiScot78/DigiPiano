import type { PlayMode } from "../playback/settings";

const OPTIONS: { mode: PlayMode; title: string; description: string }[] = [
  { mode: "play", title: "Play", description: "Follow the score tempo and record timing and pitch." },
  { mode: "pause-each-note", title: "Pause at each note", description: "Follow the score tempo, pausing at each note or chord until it is played correctly." },
  { mode: "practice", title: "Practice", description: "Ignore tempo and move to the next note or chord immediately when correct, while recording mistakes." },
];

export function PlayModeDialog({ value, showProgress, onChange, onShowProgressChange, onClose }: { value: PlayMode; showProgress: boolean; onChange: (mode: PlayMode) => void; onShowProgressChange: (enabled: boolean) => void; onClose: () => void }) {
  return <div className="modal-backdrop play-mode-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="play-mode-dialog" role="dialog" aria-modal="true" aria-labelledby="play-mode-title">
      <header><div><h2 id="play-mode-title">Play mode</h2><p>Choose how the score advances and records your performance.</p></div><button type="button" className="dialog-close" aria-label="Close play mode" onClick={onClose}>×</button></header>
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
  </div>;
}
