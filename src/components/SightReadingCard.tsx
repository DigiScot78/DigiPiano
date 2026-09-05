import { useEffect, useRef, useState } from "react";
import type { SightReadingOptions } from "../learning/sightReading";
import type { SightReadingAssessment } from "../learning/sightReadingAssessment";

export function SightReadingCard({ options, phase, assessment, playbackActive, shortcutHint, shortcutNotice, onStart, onNew, onReview, onStopReview, onLeave }: { options: SightReadingOptions; phase: "prepare" | "attempt" | "result" | "review"; assessment?: SightReadingAssessment; playbackActive: boolean; shortcutHint?: string; shortcutNotice?: string; onStart: () => void; onNew: () => void; onReview: () => void; onStopReview: () => void; onLeave: () => void }) {
  const label = options.level === "beginner" ? "Beginner" : options.level === "developing" ? "Developing" : "Intermediate";
  const hand = options.hand === "both" ? "Both hands" : options.hand === "left" ? "Left hand" : "Right hand";
  const [preparationRemaining, setPreparationRemaining] = useState<number>(options.preparationSeconds);
  const onStartRef = useRef(onStart);
  useEffect(() => { onStartRef.current = onStart; }, [onStart]);
  useEffect(() => {
    if (phase !== "prepare" || options.preparationSeconds === 0) return;
    setPreparationRemaining(options.preparationSeconds);
    const startedAt = Date.now();
    const ticker = window.setInterval(() => setPreparationRemaining(Math.max(0, options.preparationSeconds - Math.floor((Date.now() - startedAt) / 1000))), 250);
    const starter = window.setTimeout(() => onStartRef.current(), options.preparationSeconds * 1000);
    return () => { window.clearInterval(ticker); window.clearTimeout(starter); };
  }, [options.preparationSeconds, phase]);
  return <section className="guided-session-card sight-reading-card" aria-label="Sight reading">
    <header><div><span>Sight reading</span><h2>{label} · {options.measures} measures</h2></div></header>
    <div className="guided-focus-card">
      <span>{phase === "prepare" ? "Preparation" : phase === "attempt" ? "One uninterrupted attempt" : phase === "review" ? "Review playback" : "Attempt complete"}</span>
      <h3>{phase === "prepare" ? "Look before you play" : phase === "attempt" ? "Keep going" : phase === "review" ? "Listen back" : assessment !== undefined && assessment.score >= 90 ? "Strong reading" : assessment !== undefined && assessment.score >= 70 ? "Developing fluency" : "Keep reading forward"}</h3>
      <div className="guided-tempo-status"><strong>{options.tempoBpm} BPM</strong><span>{hand}</span><span>{options.measures} measures</span></div>
      {phase === "prepare" && options.preparationSeconds > 0 ? <div className="sight-preparation-timer" role="timer" aria-label={`${preparationRemaining} seconds preparation remaining`}><strong>{preparationRemaining}</strong><span>seconds to inspect</span></div> : null}
      {phase === "prepare" ? <p>Check the key, starting note, hand position, and rhythm. You can practise notes here; Start one attempt resets to the first bar and hides correctness markers until the attempt ends.</p> : null}
      {phase === "attempt" ? <p>Continue through mistakes without stopping. This exercise is scored once, after the final bar.</p> : null}
      {phase === "review" ? <p>This deliberate review starts from bar one and does not replace or change your first-look result.</p> : null}
      {phase === "result" && assessment ? <div className="sight-reading-result">
        <div className={`guided-step-score ${assessment.score >= 90 ? "passed" : "retry"}`}><strong>{assessment.score}%</strong><span>Reading score</span></div>
        <div className="sight-reading-metrics"><div><strong>{assessment.noteAccuracy}%</strong><span>Note accuracy</span></div><div><strong>{assessment.continuity}%</strong><span>Kept moving</span></div></div>
        <p>{assessment.notesRead} of {assessment.totalNotes} notes read correctly · {assessment.momentsPlayed} of {assessment.totalMoments} reading moments attempted.</p>
      </div> : null}
      <div className="button-row">
        {phase === "prepare" ? <button type="button" className="primary" disabled={playbackActive} onClick={onStart}>Start one attempt</button> : null}
        {phase === "attempt" && !playbackActive ? <button type="button" className="primary" onClick={onStart}>Restart stopped attempt</button> : null}
        {phase === "result" ? <><button type="button" className="primary" onClick={onNew}>New excerpt</button><button type="button" onClick={onReview}>Review excerpt</button></> : null}
        {phase === "review" ? <button type="button" onClick={onStopReview}>Stop review</button> : null}
      </div>
      {shortcutHint && phase !== "attempt" ? <p className="guided-shortcut-hint">Piano shortcut: {shortcutHint}</p> : null}
      {shortcutNotice ? <p className="guided-shortcut-notice" role="status">{shortcutNotice}</p> : null}
    </div>
    <button type="button" className="guided-leave" disabled={playbackActive} onClick={onLeave}>Leave sight reading</button>
  </section>;
}
