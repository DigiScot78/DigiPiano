import { describe, expect, it } from "vitest";
import { DOMAIN_SCHEMA_VERSION, SCORE_ANCHOR_SCHEMA_VERSION, type AttemptSummaryDto, type CourseVersionDto } from "./domain";
import { GuestEntitlementRepository, InMemoryAccountPreferencesRepository, InMemoryCourseRepository, InMemoryLearningDataRepository, InMemoryScoreRepository } from "./inMemoryRepositories";

const anchor = { schemaVersion: SCORE_ANCHOR_SCHEMA_VERSION, scoreVersionId: "sv1", partId: "P1", measureNumber: 1, absoluteQuarter: 0, staffNumber: 1 };
const attempt = (key: string, score: number): AttemptSummaryDto => ({ schemaVersion: DOMAIN_SCHEMA_VERSION, scoringVersion: 1, idempotencyKey: key, attemptId: key, scope: { scoreVersionId: "sv1" }, hand: "both", mode: "play", tempoPercent: 100, score, accuracyScore: score, totalNotes: 1, hits: 1, misses: 0, badNotes: 0, wrongPitches: 0, mistimedNotes: 0, hitRate: 100, activeDurationMs: 1000, idealDurationMs: 1000, startedAt: "2026-01-01T00:00:00Z", completedAt: `2026-01-01T00:00:0${key}.000Z` });

describe("guest repositories", () => {
  it("keeps uploaded score bytes and mutable library metadata in memory", async () => {
    let id = 0; const repository = new InMemoryScoreRepository({ id: () => `id-${++id}` });
    const reference = await repository.upload(new File(["<score />"], "study.musicxml", { type: "application/xml" }), { title: "Study" });
    expect(reference).toEqual({ scoreId: "id-1", versionId: "id-2" });
    expect(await (await repository.open("id-2")).text()).toBe("<score />");
    await repository.rename("id-1", "New title");
    expect(await repository.list()).toMatchObject([{ title: "New title", format: "musicxml" }]);
    await repository.removeFromLibrary("id-1");
    expect(await repository.list()).toEqual([]);
  });

  it("stores learning items by score version and deduplicates attempt retries", async () => {
    let id = 0; const repository = new InMemoryLearningDataRepository({ id: () => `id-${++id}`, now: () => "2026-01-01T00:00:00Z" });
    await repository.saveSelection({ schemaVersion: 1, scoreVersionId: "sv1", name: "Opening", start: anchor, end: { ...anchor, absoluteQuarter: 4 }, hand: "right" });
    await repository.saveBookmark({ schemaVersion: 1, scoreVersionId: "sv1", name: "Again", anchor });
    expect(await repository.listSelections("sv1")).toHaveLength(1);
    expect(await repository.listBookmarks("other")).toHaveLength(0);
    await repository.recordCompletedAttempt(attempt("1", 80)); await repository.recordCompletedAttempt(attempt("1", 20)); await repository.recordCompletedAttempt(attempt("2", 100));
    expect(await repository.getProgress({ scoreVersionId: "sv1" })).toMatchObject({ attemptCount: 2, completionCount: 2, bestScore: 100, lastScore: 100, averageScore: 90 });
    await expect(repository.recordCompletedAttempt({ ...attempt("3", 90), scoringVersion: 2 } as unknown as AttemptSummaryDto)).rejects.toThrow("Unsupported attempt summary version");
  });

  it("advances an in-memory course without duplicating completions", async () => {
    const course: CourseVersionDto = { schemaVersion: 1, courseId: "c1", versionId: "cv1", title: "Course", publishedAt: "2026-01-01", sections: [{ id: "u1", title: "Unit 1", order: 1, steps: [{ id: "s1", title: "One", order: 1 }, { id: "s2", title: "Two", order: 2 }] }] };
    const repository = new InMemoryCourseRepository([course]);
    await expect(repository.recordStepCompletion("c1", "s2", "2026-01-01")).rejects.toThrow("current course step");
    await repository.recordStepCompletion("c1", "s1", "2026-01-01"); await repository.recordStepCompletion("c1", "s1", "2026-01-01");
    expect(await repository.getEnrollment("c1")).toMatchObject({ status: "active", currentStepId: "s2", completedStepIds: ["s1"] });
    await repository.recordStepCompletion("c1", "s2", "2026-01-02");
    expect(await repository.getEnrollment("c1")).toMatchObject({ status: "completed", completedAt: "2026-01-02" });
  });

  it("returns defensive copies for preferences and guest entitlements", async () => {
    const preferences = new InMemoryAccountPreferencesRepository(); const loaded = await preferences.load(); loaded.learning.tempoBuildUp = "steady";
    expect((await preferences.load()).learning).toEqual({ tempoBuildUp: "gentle" });
    expect(await new GuestEntitlementRepository().getCurrent()).toMatchObject({ features: ["guest-practice"] });
  });
});
