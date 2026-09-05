import { describe, expect, it } from "vitest";
import { recommendLearningRoute } from "./routeRecommendation";

describe("learning route recommendations", () => {
  it("starts genuinely new learners with foundations regardless of goal", () => expect(recommendLearningRoute("new", "sight-reading").action).toBe("foundations"));
  it("routes piece learners to guidance", () => expect(recommendLearningRoute("returning", "learn-piece").action).toBe("guided-piece"));
  it("routes technique learners to generated reference work", () => expect(recommendLearningRoute("confident", "technique").action).toBe("reference"));
  it("routes reading goals to sight reading", () => expect(recommendLearningRoute("returning", "read-music").action).toBe("sight-reading"));
});
