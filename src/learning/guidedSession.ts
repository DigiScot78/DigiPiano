import type { ScoreEvent } from "../music/scoreTypes";
import type { GuidedLessonSection } from "./guidedPractice";

export type GuidedSessionStep = "listen" | "right" | "left" | "both" | "tempo";

export function guidedStepsForSection(events: ScoreEvent[], section: GuidedLessonSection | undefined): GuidedSessionStep[] {
  if (!section) return ["listen"];
  const sectionEvents = events.slice(section.startIndex, section.endIndex + 1);
  const staves = new Set(sectionEvents.flatMap((event) => event.noteDetails.length > 0
    ? event.noteDetails.map((note) => note.staffNumber)
    : event.staffNumbers));
  const hasRight = staves.has(1);
  const hasLeft = staves.has(2);
  if (hasRight && hasLeft) return ["listen", "right", "left", "both", "tempo"];
  if (hasLeft) return ["listen", "left", "tempo"];
  if (hasRight) return ["listen", "right", "tempo"];
  return ["listen"];
}
