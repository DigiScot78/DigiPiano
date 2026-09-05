export const DOMAIN_SCHEMA_VERSION = 1 as const;
export const SCORE_ANCHOR_SCHEMA_VERSION = 1 as const;
export const ATTEMPT_SCORING_VERSION = 1 as const;

export type DomainSchemaVersion = typeof DOMAIN_SCHEMA_VERSION;
export type ScoreAnchorSchemaVersion = typeof SCORE_ANCHOR_SCHEMA_VERSION;
export type AttemptScoringVersion = typeof ATTEMPT_SCORING_VERSION;
export type HandFilter = "both" | "right" | "left";
export type PracticeMode = "play" | "pause-at-each-note" | "practice" | "sight-reading";

export interface ScoreMetadataDto { title: string; composer?: string }
export interface ScoreLibraryItemDto { scoreId: string; currentVersionId: string; title: string; composer?: string; format: "mxl" | "xml" | "musicxml" }
export interface ScoreVersionRefDto { scoreId: string; versionId: string }

export interface ScoreIdentityDto {
  schemaVersion: DomainSchemaVersion;
  scoreId: string;
  versionId: string;
  title: string;
  composer?: string;
  format: "mxl" | "xml" | "musicxml";
  contentHash: string;
  parserVersion: string;
}

export interface ScoreAnchorDto {
  schemaVersion: ScoreAnchorSchemaVersion;
  scoreVersionId: string;
  partId: string;
  measureNumber: number;
  absoluteQuarter: number;
  staffNumber: number;
  voiceNumber?: string;
  sourceNoteId?: string;
  cachedEventIndex?: number;
}

export interface SavedSelectionDto {
  schemaVersion: DomainSchemaVersion;
  id: string;
  scoreVersionId: string;
  name: string;
  start: ScoreAnchorDto;
  end: ScoreAnchorDto;
  hand: HandFilter;
  createdAt: string;
  updatedAt: string;
}

export interface BookmarkDto {
  schemaVersion: DomainSchemaVersion;
  id: string;
  scoreVersionId: string;
  name: string;
  anchor: ScoreAnchorDto;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AttemptScopeDto {
  scoreVersionId: string;
  selectionId?: string;
  courseId?: string;
  courseStepId?: string;
  start?: ScoreAnchorDto;
  end?: ScoreAnchorDto;
}

export interface AttemptSummaryDto {
  schemaVersion: DomainSchemaVersion;
  scoringVersion: AttemptScoringVersion;
  idempotencyKey: string;
  attemptId: string;
  scope: AttemptScopeDto;
  hand: HandFilter;
  mode: PracticeMode;
  tempoPercent: number;
  score: number;
  accuracyScore: number;
  paceScore?: number;
  totalNotes: number;
  hits: number;
  misses: number;
  badNotes: number;
  wrongPitches: number;
  mistimedNotes: number;
  hitRate: number;
  averageTimingErrorMs?: number;
  activeDurationMs: number;
  idealDurationMs: number;
  startedAt: string;
  completedAt: string;
}

export interface ProgressScopeDto {
  scoreVersionId?: string;
  selectionId?: string;
  courseId?: string;
  courseStepId?: string;
}

export interface ProgressSummaryDto {
  schemaVersion: DomainSchemaVersion;
  scope: ProgressScopeDto;
  attemptCount: number;
  completionCount: number;
  bestScore?: number;
  lastScore?: number;
  averageScore?: number;
  lastCompletedAt?: string;
}

export interface CourseStepDto {
  id: string;
  title: string;
  order: number;
  scoreVersionId?: string;
  selectionId?: string;
  hand?: HandFilter;
  mode?: PracticeMode;
  targetScore?: number;
  requiredCompletions?: number;
}

export interface CourseSectionDto {
  id: string;
  title: string;
  order: number;
  steps: CourseStepDto[];
}

export interface CourseVersionDto {
  schemaVersion: DomainSchemaVersion;
  courseId: string;
  versionId: string;
  title: string;
  description?: string;
  sections: CourseSectionDto[];
  publishedAt: string;
}

export interface CourseEnrollmentDto {
  schemaVersion: DomainSchemaVersion;
  courseId: string;
  courseVersionId: string;
  status: "active" | "completed";
  currentStepId?: string;
  completedStepIds: string[];
  enrolledAt: string;
  completedAt?: string;
}

export interface AccountPreferencesDto {
  schemaVersion: DomainSchemaVersion;
  learning: {
    tempoBuildUp: "gentle" | "steady" | "at-tempo";
  };
}

export interface EntitlementSetDto {
  schemaVersion: DomainSchemaVersion;
  features: string[];
  limits: Record<string, number>;
}

export function isSupportedDomainVersion(value: unknown): value is DomainSchemaVersion {
  return value === DOMAIN_SCHEMA_VERSION;
}

export function isSupportedAnchorVersion(value: unknown): value is ScoreAnchorSchemaVersion {
  return value === SCORE_ANCHOR_SCHEMA_VERSION;
}

export function isSupportedAttemptScoringVersion(value: unknown): value is AttemptScoringVersion {
  return value === ATTEMPT_SCORING_VERSION;
}

export function isSupportedAttemptSummary(value: Pick<AttemptSummaryDto, "schemaVersion" | "scoringVersion">): boolean {
  return isSupportedDomainVersion(value.schemaVersion) && isSupportedAttemptScoringVersion(value.scoringVersion);
}

export function isScoreAnchorDto(value: unknown): value is ScoreAnchorDto {
  if (!value || typeof value !== "object") return false;
  const anchor = value as Partial<ScoreAnchorDto>;
  return isSupportedAnchorVersion(anchor.schemaVersion)
    && typeof anchor.scoreVersionId === "string" && anchor.scoreVersionId.length > 0
    && typeof anchor.partId === "string" && anchor.partId.length > 0
    && Number.isInteger(anchor.measureNumber) && (anchor.measureNumber ?? 0) >= 0
    && typeof anchor.absoluteQuarter === "number" && Number.isFinite(anchor.absoluteQuarter) && anchor.absoluteQuarter >= 0
    && Number.isInteger(anchor.staffNumber) && (anchor.staffNumber ?? 0) > 0
    && (anchor.cachedEventIndex === undefined || (Number.isInteger(anchor.cachedEventIndex) && anchor.cachedEventIndex >= 0));
}

export function validateSelectionAnchors(selection: Pick<SavedSelectionDto, "scoreVersionId" | "start" | "end">): boolean {
  return isScoreAnchorDto(selection.start)
    && isScoreAnchorDto(selection.end)
    && selection.start.scoreVersionId === selection.scoreVersionId
    && selection.end.scoreVersionId === selection.scoreVersionId
    && selection.start.absoluteQuarter <= selection.end.absoluteQuarter;
}

export function validateCourseVersion(course: CourseVersionDto): boolean {
  if (!isSupportedDomainVersion(course.schemaVersion) || !course.courseId || !course.versionId || !course.title || !course.publishedAt) return false;
  const sectionOrders = course.sections.map((section) => section.order);
  const stepIds = course.sections.flatMap((section) => section.steps.map((step) => step.id));
  return new Set(sectionOrders).size === sectionOrders.length
    && new Set(stepIds).size === stepIds.length
    && course.sections.every((section) => section.id && section.title && Number.isInteger(section.order)
      && section.steps.every((step) => step.id && step.title && Number.isInteger(step.order)));
}
