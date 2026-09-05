import { DOMAIN_SCHEMA_VERSION, isSupportedAttemptSummary, type AccountPreferencesDto, type AttemptSummaryDto, type BookmarkDto, type CourseEnrollmentDto, type CourseVersionDto, type EntitlementSetDto, type ProgressScopeDto, type ProgressSummaryDto, type SavedSelectionDto, type ScoreLibraryItemDto } from "./domain";
import type { AccountPreferencesRepository, BookmarkInput, CourseRepository, EntitlementRepository, LearningDataRepository, SavedSelectionInput, ScoreRepository } from "./repositories";

type GuestOptions = { id?: () => string; now?: () => string };
const copy = <T>(value: T): T => structuredClone(value);

export class InMemoryScoreRepository implements ScoreRepository {
  private readonly items = new Map<string, ScoreLibraryItemDto>();
  private readonly files = new Map<string, Blob>();
  constructor(private readonly options: GuestOptions = {}) {}
  async list() { return copy([...this.items.values()]); }
  async upload(file: File, metadata: { title: string; composer?: string }) {
    const scoreId = this.options.id?.() ?? crypto.randomUUID();
    const versionId = this.options.id?.() ?? crypto.randomUUID();
    const extension = file.name.split(".").at(-1)?.toLowerCase();
    const format = extension === "mxl" ? "mxl" as const : extension === "musicxml" ? "musicxml" as const : "xml" as const;
    this.items.set(scoreId, { scoreId, currentVersionId: versionId, title: metadata.title, ...(metadata.composer ? { composer: metadata.composer } : {}), format });
    this.files.set(versionId, file.slice());
    return { scoreId, versionId };
  }
  async open(versionId: string) { const file = this.files.get(versionId); if (!file) throw new Error("Score version not found."); return file.slice(); }
  async rename(scoreId: string, title: string) { const item = this.items.get(scoreId); if (!item) throw new Error("Score not found."); this.items.set(scoreId, { ...item, title }); }
  async removeFromLibrary(scoreId: string) { this.items.delete(scoreId); }
}

export class InMemoryLearningDataRepository implements LearningDataRepository {
  private readonly selections: SavedSelectionDto[] = [];
  private readonly bookmarks: BookmarkDto[] = [];
  private readonly attempts = new Map<string, AttemptSummaryDto>();
  constructor(private readonly options: GuestOptions = {}) {}
  async listSelections(scoreVersionId: string) { return copy(this.selections.filter((item) => item.scoreVersionId === scoreVersionId)); }
  async saveSelection(input: SavedSelectionInput) { const now = this.options.now?.() ?? new Date().toISOString(); const item = { ...copy(input), id: this.options.id?.() ?? crypto.randomUUID(), createdAt: now, updatedAt: now }; this.selections.push(item); return copy(item); }
  async listBookmarks(scoreVersionId: string) { return copy(this.bookmarks.filter((item) => item.scoreVersionId === scoreVersionId)); }
  async saveBookmark(input: BookmarkInput) { const now = this.options.now?.() ?? new Date().toISOString(); const item = { ...copy(input), id: this.options.id?.() ?? crypto.randomUUID(), createdAt: now, updatedAt: now }; this.bookmarks.push(item); return copy(item); }
  async recordCompletedAttempt(summary: AttemptSummaryDto) { if (!isSupportedAttemptSummary(summary)) throw new Error("Unsupported attempt summary version."); if (!this.attempts.has(summary.idempotencyKey)) this.attempts.set(summary.idempotencyKey, copy(summary)); }
  async getProgress(scope: ProgressScopeDto): Promise<ProgressSummaryDto> {
    const matching = [...this.attempts.values()].filter((attempt) => (!scope.scoreVersionId || attempt.scope.scoreVersionId === scope.scoreVersionId)
      && (!scope.selectionId || attempt.scope.selectionId === scope.selectionId)
      && (!scope.courseId || attempt.scope.courseId === scope.courseId)
      && (!scope.courseStepId || attempt.scope.courseStepId === scope.courseStepId));
    const scores = matching.map((attempt) => attempt.score);
    return { schemaVersion: DOMAIN_SCHEMA_VERSION, scope: copy(scope), attemptCount: scores.length, completionCount: scores.length, ...(scores.length ? { bestScore: Math.max(...scores), lastScore: scores.at(-1), averageScore: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length), lastCompletedAt: matching.at(-1)?.completedAt } : {}) };
  }
}

export class InMemoryCourseRepository implements CourseRepository {
  private readonly enrollments = new Map<string, CourseEnrollmentDto>();
  constructor(private readonly courses: CourseVersionDto[] = []) {}
  async listAvailable() { return copy(this.courses); }
  async getVersion(versionId: string) { const course = this.courses.find((item) => item.versionId === versionId); if (!course) throw new Error("Course version not found."); return copy(course); }
  async getEnrollment(courseId: string) { return copy(this.enrollments.get(courseId) ?? null); }
  async recordStepCompletion(courseId: string, stepId: string, completedAt: string) {
    const course = this.courses.find((item) => item.courseId === courseId); if (!course) throw new Error("Course not found.");
    const current = this.enrollments.get(courseId) ?? { schemaVersion: DOMAIN_SCHEMA_VERSION, courseId, courseVersionId: course.versionId, status: "active" as const, completedStepIds: [], enrolledAt: completedAt };
    const allSteps = course.sections.flatMap((section) => section.steps);
    if (!allSteps.some((step) => step.id === stepId)) throw new Error("Course step not found.");
    const expectedStep = allSteps.find((step) => !current.completedStepIds.includes(step.id));
    if (expectedStep && expectedStep.id !== stepId && !current.completedStepIds.includes(stepId)) throw new Error("Complete the current course step first.");
    const completedStepIds = current.completedStepIds.includes(stepId) ? current.completedStepIds : [...current.completedStepIds, stepId];
    const next = allSteps.find((step) => !completedStepIds.includes(step.id));
    this.enrollments.set(courseId, { ...current, completedStepIds, status: next ? "active" : "completed", ...(next ? { currentStepId: next.id } : { completedAt }) });
  }
}

export class InMemoryAccountPreferencesRepository implements AccountPreferencesRepository {
  constructor(private value: AccountPreferencesDto = { schemaVersion: DOMAIN_SCHEMA_VERSION, learning: { tempoBuildUp: "gentle" } }) {}
  async load() { return copy(this.value); }
  async save(preferences: AccountPreferencesDto) { this.value = copy(preferences); }
}

export class GuestEntitlementRepository implements EntitlementRepository {
  constructor(private readonly value: EntitlementSetDto = { schemaVersion: DOMAIN_SCHEMA_VERSION, features: ["guest-practice"], limits: {} }) {}
  async getCurrent() { return copy(this.value); }
}
