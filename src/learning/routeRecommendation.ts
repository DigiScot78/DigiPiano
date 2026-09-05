export type LearningExperience = "new" | "returning" | "confident";
export type LearningGoal = "read-music" | "learn-piece" | "technique" | "sight-reading";
export type LearningRouteAction = "foundations" | "keyboard-check" | "guided-piece" | "reference" | "sight-reading";

export interface LearningRouteRecommendation { action: LearningRouteAction; title: string; description: string }

export function recommendLearningRoute(experience: LearningExperience, goal: LearningGoal): LearningRouteRecommendation {
  if (experience === "new") return { action: "foundations", title: "Start with Beginner foundations", description: "Find middle C and learn the neighbouring notes with immediate, pressure-free guidance from your MIDI keyboard." };
  if (goal === "learn-piece") return { action: "guided-piece", title: "Use Guided piece practice", description: "Open a score and divide it into manageable lessons with separate-hand work and gradual tempo building." };
  if (goal === "technique") return { action: "reference", title: "Explore chords and scales", description: "Use the playable Reference catalogue to inspect fingerings and generate focused practice scores." };
  if (goal === "sight-reading") return { action: "sight-reading", title: "Start a Sight reading challenge", description: "Choose a comfortable level, tempo, and length for one fresh uninterrupted reading attempt." };
  return { action: "sight-reading", title: "Build reading fluency", description: "Begin with a short Beginner sight-reading excerpt; use Reference whenever a symbol or keyboard shape needs review." };
}
