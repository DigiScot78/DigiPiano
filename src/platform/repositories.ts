import type {
  AccountPreferencesDto, AttemptSummaryDto, BookmarkDto, CourseEnrollmentDto, CourseVersionDto,
  EntitlementSetDto, ProgressScopeDto, ProgressSummaryDto, SavedSelectionDto, ScoreLibraryItemDto,
  ScoreMetadataDto, ScoreVersionRefDto,
} from "./domain";

export type SavedSelectionInput = Omit<SavedSelectionDto, "id" | "createdAt" | "updatedAt">;
export type BookmarkInput = Omit<BookmarkDto, "id" | "createdAt" | "updatedAt">;

export interface ScoreRepository {
  list(): Promise<ScoreLibraryItemDto[]>;
  upload(file: File, metadata: ScoreMetadataDto): Promise<ScoreVersionRefDto>;
  open(versionId: string): Promise<Blob>;
  rename(scoreId: string, title: string): Promise<void>;
  removeFromLibrary(scoreId: string): Promise<void>;
}

export interface LearningDataRepository {
  listSelections(scoreVersionId: string): Promise<SavedSelectionDto[]>;
  saveSelection(input: SavedSelectionInput): Promise<SavedSelectionDto>;
  listBookmarks(scoreVersionId: string): Promise<BookmarkDto[]>;
  saveBookmark(input: BookmarkInput): Promise<BookmarkDto>;
  recordCompletedAttempt(summary: AttemptSummaryDto): Promise<void>;
  getProgress(scope: ProgressScopeDto): Promise<ProgressSummaryDto>;
}

export interface CourseRepository {
  listAvailable(): Promise<CourseVersionDto[]>;
  getVersion(courseVersionId: string): Promise<CourseVersionDto>;
  getEnrollment(courseId: string): Promise<CourseEnrollmentDto | null>;
  recordStepCompletion(courseId: string, stepId: string, completedAt: string): Promise<void>;
}

export interface AccountPreferencesRepository {
  load(): Promise<AccountPreferencesDto>;
  save(preferences: AccountPreferencesDto): Promise<void>;
}

export interface EntitlementRepository { getCurrent(): Promise<EntitlementSetDto> }
