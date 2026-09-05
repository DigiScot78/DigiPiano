export function formatScoreDuration(durationMs: number): string {
  const signedSeconds = Math.ceil(durationMs / 1000);
  const sign = signedSeconds < 0 ? "-" : "";
  const totalSeconds = Math.abs(signedSeconds);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${sign}${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function ScoreTimeDisplay({ remainingMs, idealMs, graceMs = 0 }: { remainingMs: number; idealMs: number; graceMs?: number }) {
  const withinGrace = remainingMs < 0 && remainingMs >= -graceMs;
  const overtime = remainingMs < -graceMs;
  const remaining = formatScoreDuration(remainingMs);
  const ideal = formatScoreDuration(idealMs);
  return <span
    className={`score-time${withinGrace ? " grace" : overtime ? " overtime" : ""}`}
    role="timer"
    aria-label={`${withinGrace ? "Within pace grace" : overtime ? "Overtime" : "Time remaining"} ${remaining}; ideal time ${ideal}`}
  >{remaining} / {ideal}</span>;
}
