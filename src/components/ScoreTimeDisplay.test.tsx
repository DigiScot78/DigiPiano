import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatScoreDuration, ScoreTimeDisplay } from "./ScoreTimeDisplay";

describe("score time display", () => {
  it("formats a real zero-second interval between remaining time and overtime", () => {
    expect(formatScoreDuration(60_001)).toBe("01:01");
    expect(formatScoreDuration(1)).toBe("00:01");
    expect(formatScoreDuration(0)).toBe("00:00");
    expect(formatScoreDuration(-1)).toBe("00:00");
    expect(formatScoreDuration(-999)).toBe("00:00");
    expect(formatScoreDuration(-1_000)).toBe("-00:01");
  });

  it("marks only negative remaining time as overtime", () => {
    expect(renderToStaticMarkup(<ScoreTimeDisplay remainingMs={1_000} idealMs={60_000} />)).not.toContain("overtime");
    const overtime = renderToStaticMarkup(<ScoreTimeDisplay remainingMs={-1} idealMs={60_000} />);
    expect(overtime).toContain("score-time overtime");
    expect(overtime).toContain("00:00 / 01:00");
  });

  it("keeps negative time in the normal colour until pace grace expires", () => {
    const grace = renderToStaticMarkup(<ScoreTimeDisplay remainingMs={-500} idealMs={10_000} graceMs={500} />);
    expect(grace).toContain("score-time grace");
    expect(grace).toContain("Within pace grace");
    expect(grace).not.toContain("overtime");
    const overtime = renderToStaticMarkup(<ScoreTimeDisplay remainingMs={-501} idealMs={10_000} graceMs={500} />);
    expect(overtime).toContain("score-time overtime");
  });
});
