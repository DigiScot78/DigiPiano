import { describe, expect, it } from "vitest";
import {
  DOMAIN_SCHEMA_VERSION,
  SCORE_ANCHOR_SCHEMA_VERSION,
  type CourseVersionDto,
  type ScoreAnchorDto,
  isScoreAnchorDto,
  isSupportedDomainVersion,
  validateCourseVersion,
  validateSelectionAnchors,
} from "./domain";

const anchor = (quarter: number, overrides: Partial<ScoreAnchorDto> = {}): ScoreAnchorDto => ({
  schemaVersion: SCORE_ANCHOR_SCHEMA_VERSION,
  scoreVersionId: "score-version-1",
  partId: "P1",
  measureNumber: Math.floor(quarter / 4) + 1,
  absoluteQuarter: quarter,
  staffNumber: 1,
  cachedEventIndex: Math.floor(quarter),
  ...overrides,
});

describe("platform domain contracts", () => {
  it("accepts only the current explicit schema versions", () => {
    expect(isSupportedDomainVersion(DOMAIN_SCHEMA_VERSION)).toBe(true);
    expect(isSupportedDomainVersion(2)).toBe(false);
    expect(isScoreAnchorDto(anchor(4))).toBe(true);
    expect(isScoreAnchorDto({ ...anchor(4), schemaVersion: 2 })).toBe(false);
  });

  it("validates durable selections independently of disposable event indexes", () => {
    expect(validateSelectionAnchors({ scoreVersionId: "score-version-1", start: anchor(4, { cachedEventIndex: 99 }), end: anchor(8, { cachedEventIndex: 2 }) })).toBe(true);
    expect(validateSelectionAnchors({ scoreVersionId: "score-version-1", start: anchor(8), end: anchor(4) })).toBe(false);
    expect(validateSelectionAnchors({ scoreVersionId: "another-version", start: anchor(4), end: anchor(8) })).toBe(false);
  });

  it("rejects ambiguous course ordering and duplicate step identities", () => {
    const course: CourseVersionDto = {
      schemaVersion: DOMAIN_SCHEMA_VERSION,
      courseId: "foundations",
      versionId: "foundations-v1",
      title: "Beginner Foundations",
      publishedAt: "2026-09-05T08:00:00.000Z",
      sections: [
        { id: "unit-1", title: "Unit 1", order: 1, steps: [{ id: "lesson-1", title: "Find C, D, E", order: 1 }] },
        { id: "unit-2", title: "Unit 2", order: 2, steps: [{ id: "lesson-2", title: "Next lesson", order: 1 }] },
      ],
    };
    expect(validateCourseVersion(course)).toBe(true);
    expect(validateCourseVersion({ ...course, sections: course.sections.map((section) => ({ ...section, order: 1 })) })).toBe(false);
    expect(validateCourseVersion({ ...course, sections: course.sections.map((section) => ({ ...section, steps: [{ ...section.steps[0], id: "same-step" }] })) })).toBe(false);
  });
});
