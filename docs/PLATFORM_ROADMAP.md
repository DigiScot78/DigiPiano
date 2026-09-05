# Online Platform Architecture Blueprint

## Status And Purpose
This document records the intended route from the current browser-only piano-learning proof of concept to a hosted, account-backed product. It is a future architecture and delivery plan, not a description of implemented functionality.

The current application remains deliberately local: score parsing, notation rendering, MIDI handling, playback, and live scoring all run in the browser. Platform work should preserve that low-latency boundary and add durable services around it rather than moving musical interaction to a server.

Initial product direction:
- Guest users can load a local MusicXML/MXL score and practise without an account.
- Accounts use email magic links or Google sign-in and are intended for users aged 16 or over, initially in the UK/EU.
- Signed-in users gain a private score bank, saved selections and bookmarks, attempt summaries, progress, and enrolment in platform-curated courses.
- Public score sharing follows private libraries only and requires an explicit rights, moderation, and publishing workflow.
- The commercial direction is freemium, but tier names, prices, and quotas remain a later product decision.

## Guiding Principles
- Keep the musical hot path local. MIDI messages, held-note matching, playback clocks, audio scheduling, score rendering, and in-progress attempt state stay in the browser.
- Make local practice useful without registration. Authentication should add durability and synchronization, not gate the core proof-of-concept experience.
- Store completed summaries, not raw musical telemetry. The initial platform does not retain individual MIDI messages or note-level attempt histories.
- Treat imported scores as untrusted private files. Validate them, isolate storage by owner, and never make an upload public implicitly.
- Version content that owns progress. Attempts, selections, bookmarks, and courses refer to an immutable score version so a replacement file cannot silently change their meaning.
- Enforce authorization in the data layer. UI checks improve usability but Row Level Security and server-side entitlement checks remain authoritative.
- Add services behind explicit client interfaces so backend adoption does not spread through playback and rendering code.

## Proposed Service Map

| Concern | Initial choice | Responsibility |
| --- | --- | --- |
| Web application | Existing Vite/React app on Vercel | Static application delivery and deployment previews |
| Authentication | Supabase Auth | Email magic-link and Google identity flows, sessions, account identity |
| Relational data | Supabase Postgres in an EU region | Libraries, content metadata, selections, bookmarks, summaries, progress, courses, and entitlements |
| Score objects | Private Supabase Storage buckets | Original `.musicxml`, `.xml`, and `.mxl` uploads |
| Privileged operations | Supabase Edge Functions | Billing webhooks, account export/deletion, official publishing, and authoritative quota operations |
| Payments | Stripe, introduced after the learning product is proven | Checkout/subscriptions, customer portal, and billing event source |
| Product access | Internal entitlement records | Stable feature/limit checks derived from billing state rather than direct client trust in Stripe |

Use environment-specific Supabase projects and Vercel deployments for local/development, staging, and production. Secrets belong in provider-managed environment configuration and must never be committed or exposed through Vite client variables unless they are explicitly public client credentials.

## Responsibility Boundary

### Browser
- Read and decompress MusicXML/MXL.
- Parse normalized score events and render notation through OSMD.
- Process Web MIDI, held notes, transport, audio, and live feedback.
- Calculate the current versioned performance score.
- Keep an unfinished attempt in memory.
- Submit a completed attempt summary after natural completion.
- Continue guest practice from local files without cloud persistence.

### Backend
- Establish identity and ownership.
- Store score objects and searchable metadata.
- Persist selections, bookmarks, attempt summaries, aggregate progress, and course enrolment.
- Enforce per-user access and product limits.
- Publish only reviewed platform-owned or rights-approved content.
- Process billing events idempotently and derive entitlements.
- Support account data export and deletion.

The server should not sit in the real-time MIDI or playback path. Temporary loss of connectivity may delay a completed-summary upload but must not interrupt the current exercise.

## Client Boundaries To Introduce
Introduce these interfaces before selecting concrete SDK calls throughout the UI:

```ts
interface ScoreRepository {
  list(): Promise<ScoreLibraryItem[]>;
  upload(file: File, metadata: ScoreMetadata): Promise<ScoreVersionRef>;
  open(versionId: string): Promise<Blob>;
  rename(scoreId: string, title: string): Promise<void>;
  removeFromLibrary(scoreId: string): Promise<void>;
}

interface LearningDataRepository {
  listSelections(scoreVersionId: string): Promise<SavedSelection[]>;
  saveSelection(input: SavedSelectionInput): Promise<SavedSelection>;
  listBookmarks(scoreVersionId: string): Promise<Bookmark[]>;
  saveBookmark(input: BookmarkInput): Promise<Bookmark>;
  recordCompletedAttempt(summary: AttemptSummary): Promise<void>;
  getProgress(scope: ProgressScope): Promise<ProgressSummary>;
}

interface CourseRepository {
  listAvailable(): Promise<CourseSummary[]>;
  getVersion(courseVersionId: string): Promise<CourseVersion>;
  getEnrollment(courseId: string): Promise<CourseEnrollment | null>;
  recordStepCompletion(input: StepCompletionInput): Promise<void>;
}

interface AccountPreferencesRepository {
  load(): Promise<AccountPreferences>;
  save(preferences: AccountPreferences): Promise<void>;
}

interface EntitlementRepository {
  getCurrent(): Promise<EntitlementSet>;
}
```

Concrete names may evolve, but UI and learning code should depend on these capabilities rather than Supabase tables or Stripe objects. Guest implementations may remain memory/local-file based; account implementations use cloud services.

## Durable Data Model

All durable entities use UUID identifiers plus `created_at` and `updated_at` timestamps where applicable. User-owned rows carry an immutable owner identifier and are protected by Row Level Security.

### Identity And Governance
- `profiles`: application-facing profile for an Auth user; avoid duplicating credentials or provider secrets.
- `legal_acceptances`: terms/privacy version, timestamp, and minimally necessary evidence of acceptance.
- `admin_audit_events`: append-only record of privileged publishing, moderation, entitlement, export, and deletion actions.

### Scores And Libraries
- `scores`: logical work owned by a user or the platform; title, composer/display metadata, visibility, and lifecycle state.
- `score_versions`: immutable uploaded content identity, content hash, byte size, format, storage key, parser/schema version, and import diagnostics.
- `library_entries`: a user's relationship to a score, allowing later support for owned, saved, or enrolled content without duplicating the score.

Only MusicXML, XML, and MXL are accepted initially. Apply explicit extension, MIME, decompressed-size, archive-entry, and XML-complexity limits. Storage paths must be server-derived from authenticated ownership rather than trusted client filenames. A content hash may deduplicate a user's identical upload while preserving separate library metadata.

### Musical Anchors
Selections and bookmarks must not persist only current array indexes. Store a durable anchor containing:
- score version and part identifier;
- measure identity/number and absolute quarter position;
- staff and optional voice/source-note hints;
- parser-anchor schema version;
- cached event index only as a disposable acceleration hint.

On load, resolve the durable anchor against the exact immutable score version. If a future parser revision cannot resolve it confidently, show the item as needing repair rather than jumping silently to the wrong music.

### Personal Learning Data
- `saved_selections`: named start/end anchors, hand filter, and optional practice defaults.
- `bookmarks`: named single anchor with optional notes.
- `attempt_summaries`: score version, full-score/selection context, hand filter, Play mode, scoring algorithm version, totals, hits, misses, bad attempts, result percentage, timing aggregates where applicable, and start/completion timestamps.
- `progress_summaries`: derived or transactionally maintained aggregates by user and exercise identity, including best, last, average, completion count, and latest completion.

Do not upload raw MIDI messages, individual note attempts, or unfinished attempts in the first version. Attempt submission needs a client-generated idempotency key so reconnect/retry cannot create duplicate completions. Historical percentages retain their scoring algorithm version and are not silently recalculated under a later formula.

### Courses
- `courses`: stable course identity and ownership, initially platform-owned.
- `course_versions`: immutable published structure so active learners do not change underneath an edit.
- `course_sections`: ordered organization within a version.
- `course_steps`: ordered mastery tasks referencing a score version and optionally a saved range, hand, mode, target score, and required completion count.
- `course_enrollments`: user, course, pinned version, current state, and enrolment/completion dates.
- `course_step_progress`: attempts and mastery state for each enrolled step.

Initial progression is ordered: a learner completes the current mastery requirement to unlock the next required step. Course authorship and publishing remain restricted to platform administrators until moderation, licensing, and creator tools are intentionally designed.

### Commercial State
- `subscriptions`: local projection of Stripe customer/subscription state.
- `entitlements`: provider-independent features and numeric limits currently granted to a user.
- `billing_events`: processed Stripe event identifiers, status, and timestamps for idempotency and operational diagnosis.

Stripe webhooks update the projection; the browser never grants access from redirect query parameters or client-supplied price identifiers. Product code consumes internal entitlements so pricing changes do not leak throughout the application.

## Delivery Phases

Effort is relative and intentionally excludes calendar and cost promises. Each phase has an exit gate; do not begin the next merely because partial code exists.

### Phase 1: Domain Readiness — Medium
Deliverables:
- [x] Define versioned DTOs for score identities, anchors, selections, bookmarks, attempts, progress, and courses. Initial browser-independent contracts and boundary validation live in `src/platform/domain.ts`.
- [x] Put current session scoring behind a pure, versioned summary builder. Completed playback now produces the persistence-ready v1 summary and the existing UI performance shape from one calculation.
- [x] Add the repository interfaces above with guest/in-memory implementations. Score/library bytes, learning records and idempotent attempts, aggregate progress, ordered course enrolment, account preferences, and guest entitlements now have browser-only adapters.
- [x] Separate persisted account preferences from device-only hardware and presentation preferences. The account-safe v1 contract currently contains only Learning tempo build-up; MIDI selection/shortcuts, audio, playback, piano/Synthesia, appearance, and workspace layout remain explicitly device-local.
- [x] Add deterministic anchor resolution and scoring-version tests. Resolution ignores cached indexes, requires the immutable score version and durable musical coordinates, and returns an explicit repair state for missing or ambiguous matches; guest repositories reject unsupported scoring versions.

Exit gate: the existing guest experience behaves unchanged, and future persistence can be attached without backend imports in MIDI, playback, audio, or renderer modules.

**Status:** Complete in the browser-only implementation. The guest workflow remains unchanged and no backend SDK enters the real-time music path.

### Phase 2: Hosted Guest Beta — Small
Deliverables:
- Deploy the current client to Vercel with production-safe headers, error boundaries, and environment configuration.
- Document browser/Web MIDI compatibility and the local-file privacy model.
- Establish staging and production deployment checks.
- Add privacy-preserving operational error reporting only after choosing a vendor and retention policy.

Exit gate: a public HTTPS deployment supports the existing guest workflow reliably on desktop Chromium without uploading scores.

### Phase 3: Accounts — Medium
Deliverables:
- Create EU-region Supabase development/staging/production projects and migrations.
- Add magic-link and Google authentication, callback handling, session restoration, sign-out, and account shell.
- Add profiles, legal acceptance, RLS tests, rate limits, and safe auth error UX.
- Keep guest mode available; signing in must not unexpectedly upload an already open local score.

Exit gate: automated and manual tests prove two users cannot read or mutate each other's rows, and all auth paths recover cleanly from expiry, cancellation, and duplicate callbacks.

### Phase 4: Private Score Bank — Large
Deliverables:
- Add private storage, upload validation, metadata extraction, immutable versions, library browsing, rename, and removal.
- Define retention and recovery semantics for deletion and replaced versions.
- Add user-facing storage and file-count reporting without committing to paid limits yet.
- Threat-test malformed XML and compressed archives.

Exit gate: users can upload, reopen, and remove supported scores across devices; direct object URLs and forged owner IDs cannot cross account boundaries.

### Phase 5: Personal Learning Data — Large
Deliverables:
- Save, rename, reorder, and delete score selections and bookmarks.
- Persist only naturally completed attempt summaries using idempotent writes.
- Show last/best/average and exercise progress across devices.
- Queue a small bounded set of completed summaries during transient offline failure and clearly report sync state.

Exit gate: anchors survive reloads and parser-compatible app upgrades, retries cannot duplicate attempts, and Reset/Stop/Pause behavior remains consistent with current scoring rules.

### Phase 6: Platform Courses — Large
Deliverables:
- Build private admin authoring for versioned, ordered mastery courses.
- Enrol users, enforce step prerequisites, and show course/section/step progress.
- Pin enrolments to published versions and define an explicit migration path to newer versions.
- Seed only content for which the platform has documented usage rights.

Exit gate: a learner can complete an end-to-end curated course without edits invalidating prior progress, and every published asset has recorded provenance/rights status.

### Phase 7: Commercial Layer — Medium/Large
Deliverables:
- Decide free/paid feature limits from observed use before encoding them.
- Add Stripe Checkout/subscriptions and the hosted customer portal.
- Process signed webhooks idempotently and project them into internal entitlements.
- Define failed-payment, cancellation, refund, grace-period, and downgrade data-retention behavior.

Exit gate: entitlement tests cover new purchase, renewal, out-of-order/duplicate webhook, failure, cancellation, and restoration; users never lose personal data merely because access is downgraded.

### Phase 8: Public Launch Hardening — Large
Deliverables:
- Complete privacy notice, terms, cookie assessment, data-processing inventory, retention schedule, and 16+ age statement with appropriate professional review.
- Implement self-service account export and deletion, including queued storage cleanup and billing linkage handling.
- Establish database backups, restore drills, monitoring, alerting, support workflow, incident response, and dependency/security update routines.
- Perform accessibility, performance, abuse, quota, and cross-account penetration testing.

Exit gate: restore, export, deletion, and incident exercises have been run successfully in production-like conditions and launch owners accept the operational checklist.

### Phase 9: Approved Public Content — Large
Deliverables:
- Add an explicit private/unlisted/public state machine rather than a boolean flag.
- Add rights declarations, moderation queues, reporting, takedown, audit history, and search/indexing controls.
- Start with platform-reviewed submissions or platform-owned material; do not enable instant public user uploads.

Exit gate: every public item has an accountable publication decision, a reversible moderation path, and a tested abuse/takedown workflow.

### Phase 10: Creator Expansion — Future
Potential work includes user-authored courses, teacher/student relationships, family plans, collaborative annotations, a marketplace, and revenue sharing. Each materially expands permissions, safeguarding, moderation, taxation, and support obligations and therefore needs its own plan before implementation.

## Security, Privacy, And Operations Checklist
- Enable RLS on every exposed table and test policies with distinct user sessions, anonymous access, and service roles.
- Keep service-role keys and Stripe secrets server-only; rotate secrets and document ownership.
- Use short-lived signed access for private score objects and prevent bucket listing across owners.
- Validate both compressed and decompressed upload limits; reject archive traversal and unexpected archive contents.
- Minimize stored personal data and establish purpose, retention, and deletion behavior for each category.
- Never store raw authentication tokens, Google credentials, card data, or unrestricted diagnostic payloads in application tables/logs.
- Make privileged functions idempotent and auditable.
- Back up relational data and validate restore procedures; object storage retention/recovery needs an explicit complementary plan.
- Prefer aggregate, opt-in product analytics if analytics is later introduced; do not capture score contents or MIDI events by default.
- Obtain legal/privacy/licensing advice before accepting payments or publishing third-party scores; this blueprint is an engineering plan, not legal advice.

## Validation Strategy
- Migration tests: schemas apply from empty and upgrade representative prior states.
- Authorization tests: anonymous/user/admin matrices for every table, storage path, and privileged function.
- Auth browser tests: magic link, Google, expiry, cancellation, refresh, multiple tabs, and sign-out.
- File tests: valid formats, spoofed MIME/extensions, malformed XML, compression bombs, oversized files, duplicates, and interrupted uploads.
- Anchor tests: selections/bookmarks across reloads, score versions, parser revisions, repeats, and unresolved-anchor UX.
- Attempt tests: scoring versions, completion-only writes, retry/idempotency, offline queue bounds, and aggregate consistency.
- Course tests: ordering, mastery thresholds, version pinning, course updates, and enrolment completion.
- Billing tests: webhook signatures, duplicate and out-of-order delivery, failed payments, cancellation, refund, and entitlement reconciliation.
- Lifecycle tests: export completeness, account deletion, storage cleanup, audit evidence, backup restoration, and disaster recovery.
- Regression tests: guest loading, Web MIDI, rendering, transport, scoring, and browser audio remain functional with no account and during network failure.

## Decision Gates Still Open
- Exact free and paid tiers, storage/file/course limits, pricing, trials, and grace periods.
- Product analytics and operational monitoring vendors and retention.
- Whether preferences sync wholesale or remain mostly device-local; MIDI device IDs must remain device-local.
- Public catalogue licensing model and which uploads can be shared.
- Data-retention periods for deleted accounts, audit records, and billing records.
- Offline scope beyond a bounded completed-summary retry queue.
- Search infrastructure; begin with Postgres capabilities and add a separate service only after measured need.
- Future formats such as MIDI or PDF, teacher/family features, mobile support, adaptive learning, and note-level history.

## Primary Risks
- Copyright and licensing can dominate public score distribution; private-first sequencing is intentional.
- Persisting event indexes would corrupt user anchors as parsing evolves; immutable versions and semantic anchors are required first.
- A single percentage can change meaning as scoring evolves; retain raw summary counts and a scoring version.
- RLS mistakes can expose private music or learning data; policy tests are a release gate, not optional coverage.
- Billing webhooks are asynchronous and may be duplicated or reordered; entitlements need reconciliation and idempotency.
- Adding network calls to the musical hot path would degrade practice reliability; keep synchronization outside live progression.

## Reference Documentation
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Supabase Google sign-in](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Supabase Edge Function secrets](https://supabase.com/docs/guides/functions/secrets)
- [Vercel deployments](https://vercel.com/docs/deployments/overview)
- [Vercel function regions](https://vercel.com/docs/functions/configuring-functions/region)
- [Stripe subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks?locale=en-GB)
- [Stripe Entitlements](https://docs.stripe.com/billing/entitlements?dashboard-or-api=api&locale=en-GB)
- [Stripe customer portal](https://docs.stripe.com/customer-management)
