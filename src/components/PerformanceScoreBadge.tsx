import { useEffect, useRef, useState } from "react";
import type { ExercisePerformanceHistory } from "../playback/performanceScore";

const MODE_LABELS = { play: "Play", "pause-each-note": "Pause at each note", practice: "Practice" } as const;
const HAND_LABELS = { both: "Both hands", right: "Right hand", left: "Left hand" } as const;

export function PerformanceScoreBadge({ history }: { history: ExercisePerformanceHistory }) {
  const [displayScore, setDisplayScore] = useState(history.last.score);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [focusDismissed, setFocusDismissed] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const open = hovered || pinned || (focused && !focusDismissed);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setDisplayScore(history.last.score);
      return;
    }
    let frame = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 900);
      const eased = 1 - (1 - progress) ** 3;
      setDisplayScore(Math.round(history.last.score * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    setDisplayScore(0);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [history.attempts, history.last.score]);

  const last = history.last;
  return <div
    className="performance-score"
    ref={wrapperRef}
    onMouseEnter={() => { setHovered(true); setFocusDismissed(false); }}
    onMouseLeave={() => setHovered(false)}
    onFocus={() => { setFocused(true); setFocusDismissed(false); }}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) { setFocused(false); setFocusDismissed(false); } }}
    onKeyDown={(event) => { if (event.key === "Escape") { setPinned(false); setHovered(false); setFocusDismissed(true); } }}
  >
    <button type="button" className="performance-score-badge" aria-expanded={open} aria-controls="performance-score-panel" onClick={() => { const next = !open; setPinned(next); setFocusDismissed(!next); if (!next) setHovered(false); }}>
      <span aria-hidden="true">{displayScore}%</span><span className="sr-only" aria-live="polite">Last performance score {history.last.score} percent</span>
    </button>
    {open ? <section id="performance-score-panel" className="performance-score-panel" role="dialog" aria-label="Performance statistics">
      <dl className="performance-score-summary"><Stat label="Last" value={`${last.score}%`} /><Stat label="Best" value={`${history.best.score}%`} /><Stat label="Average" value={`${history.averageScore}%`} /></dl>
      <p className="performance-score-context">{MODE_LABELS[last.playMode]} · {HAND_LABELS[last.handMode]} · {last.range ? `Events ${last.range.startIndex + 1}–${last.range.endIndex + 1}` : "Full score"}</p>
      <dl className="performance-score-stats">
        <Stat label="Tempo" value={`${last.tempoPercent}%`} />
        <Stat label="Accuracy" value={`${last.accuracyScore}%`} />
        {last.playMode !== "play" && last.paceScore !== undefined ? <Stat label="Pace" value={`${last.paceScore}%`} /> : null}
        {last.playMode !== "play" ? <Stat label="Actual time" value={formatDuration(last.activeDurationMs)} /> : null}
        {last.playMode !== "play" ? <Stat label="Ideal time" value={formatDuration(last.idealDurationMs)} /> : null}
        <Stat label="Completed attempts" value={history.attempts} />
        <Stat label="Expected notes" value={last.totalNotes} />
        <Stat label="Hits" value={last.hits} />
        <Stat label="Misses" value={last.misses} />
        <Stat label="Bad attempts" value={last.badNotes} />
        <Stat label="Wrong pitches" value={last.wrongPitches} />
        <Stat label="Mistimed notes" value={last.mistimedNotes} />
        <Stat label="Hit rate" value={`${last.hitRate}%`} />
        {last.playMode === "play" && last.averageTimingErrorMs !== undefined ? <Stat label="Average timing error" value={`${last.averageTimingErrorMs} ms`} /> : null}
      </dl>
      <p className="performance-score-totals">This exercise: {history.hits}/{history.totalNotes} hits, {history.misses} misses, {history.badNotes} bad attempts.</p>
    </section> : null}
  </div>;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function formatDuration(durationMs: number): string {
  const seconds = Math.round(durationMs / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
