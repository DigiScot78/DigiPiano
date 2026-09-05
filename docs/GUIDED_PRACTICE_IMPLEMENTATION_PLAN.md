# Guided Practice Implementation Plan

## Current Checkpoint

Milestones 1–3 are complete in code, with the core lesson flow and Piano Shortcuts positively validated on a real keyboard. Milestone 4 diagnosis is now active.

Locked decisions:

- The existing Learning toolbar button opens Learning Home.
- Home and Reference ship before accounts.
- Whole scores default to four-measure contiguous lessons.
- Boundaries snap to score events and remain user-editable.
- Changed, split, or merged sections lose their previous completion state.
- Guided RH/LH stages will be included when relevant but remain skippable.
- Recommendations are learner-initiated and never start practice automatically.
- Initial tempo progression defaults will be 60% start, 90% success, and 10-point increases.

## Milestone 1: Home And Planner

- [x] Add a pure session-plan model with deterministic create/split/move/merge/reset behaviour.
- [x] Replace the reference-only overlay with Learning Home plus Reference navigation.
- [x] Support whole-score and current-selection plan creation.
- [x] Render every planned lesson over the existing score.
- [x] Add draggable and keyboard-accessible internal boundaries.
- [x] Add event-snapped boundary placement and boundary deletion.
- [x] Add a planning card and section list to the existing right workspace.
- [x] Preserve a plan when leaving/reopening Learning; clear it when replacing the score.
- [x] Add focused lesson audition and a planner-only score presentation.
- [x] Validate the revised planner UX and responsive layout through iterative attached-browser/user testing.

### Active Planner Regressions

The latest user validation on 2 September 2026 found both issues still present despite passing automated tests:

Runtime diagnosis on 2 September 2026 identified both causes and fixes; hands-on confirmation remains required:

1. The constant-width SVG stayed unchanged when planning itself was toggled, and lighter planner overlays reduced visual interference, but further user testing proved the malformed systems were real and width-dependent. OSMD was combining its responsive wrapping with imported fixed `new-system`/`new-page` hints—an interaction its option documentation warns can strand one stretched measure. Responsive rendering now lets OSMD own system breaks; imported print breaks remain diagnostics. Live checks at 1304px, 984px, and 734px score widths produced ordinary responsive systems.
2. At a 1374px viewport the fixed sidebar grew to 2824px because its auto block size honored the lesson list's intrinsic grid height instead of the fixed top/bottom space. The sidebar now has an explicit dynamic-viewport height/max-height derived from the existing top and bottom clearance variables. The same live case measures 1031px high from y=66 to y=1097, and the 2443px lesson list scrolls inside a 650px track.

The user confirmed the revised planner UX on 2 September 2026, clearing Milestone 2 to begin.

## Milestone 2: Guided Session Shell

- [x] Add guide header, step rail, focus card, skip/repeat/leave actions, and section activation.
- [x] Add a non-assessed listen-through.
- [x] Add skippable RH, LH, and both-hand Pause stages using existing player state.

## Milestone 2.5: Piano Shortcuts

Goal: let a learner operate the guide without taking their hands away from the instrument, while never interpreting ordinary practice notes as navigation.

- [x] Add a reusable, context-aware MIDI command layer above practice input.
- [x] Add Settings → Controls → Piano shortcuts with a global enable switch and a friendly Learn-key capture flow.
- [x] Require a configurable held modifier piano key before any mapped action key is accepted.
- [x] Initially support Primary action, Previous step, Repeat step, Toggle loop, and Stop; do not bind destructive/exit actions by default.
- [x] Make Primary contextual: Listen/Stop listening, Done/Continue, Start practice, Repeat now, or Next lesson according to the visible guide state.
- [x] Suppress recognised modifier/action notes from practice assessment, held-note feedback, and carried-note state. (MIDI input does not currently trigger synthesized piano sound.)
- [x] Validate that bindings are unique, the modifier cannot also be an action, and a command fires once per fresh action-key press.
- [x] Ignore shortcuts while capture is open, text/select controls are focused, a blocking dialog is open, or the current guide state does not permit that command.
- [x] Keep all ordinary buttons and keyboard access; show only a compact optional shortcut hint in the guide rather than adding another toolbar.
- [x] Persist bindings locally with versioned defaults and leave the command abstraction open to MIDI CC/foot-pedal bindings later.
- [x] Add deterministic tests for recognition, suppression, debouncing, invalid conflicts, and settings migration.
- [x] Validate the core shortcut interaction with the user's real MIDI keyboard; move the default modifier to A1 for one-handed control.

## Milestone 3: Tempo Progression

- [x] Add reduced-tempo Play, confirmed progression decisions, target tempo, and final performance.
- [x] Require two qualifying target-tempo runs before marking a section comfortable.
- [ ] Validate scoring, tempo decisions, two-target-run completion, loop interaction, shortcuts, and preference restoration with a physical keyboard.
- [x] Add Settings → Learning with Tempo build-up presets: Gentle (60/70/80/90/100), Steady (80/90/100), and At tempo (100). Apply the preference to new plans without rewriting plans already underway.

## Milestone 4: Diagnosis

- [x] Group concrete note-attempt evidence by section, boundary revision, measure, and hand.
- [x] Show a prominent primary issue after lesson completion plus expandable supporting counts.
- [x] Add one-click, learner-initiated targeted detours.

## Resume Instructions

At the beginning of each session, read this file together with `AGENTS.md`, `PROJECT_STATUS.md`, `ARCHITECTURE.md`, and `DECISIONS.md`. Continue the first unchecked item in the active milestone. Update this checkpoint, completed boxes, validation results, and any changed product decision before ending the session.

## Validation Record

- Focused model and component tests: 8 passed; full suite: 229 passed.
- Type checking, linting, production build, and `git diff --check` passed. The build retains only the existing large-chunk advisory.
- The local Vite app started successfully on `127.0.0.1`; no in-app Chromium target was attached, so visual, drag, responsive, and theme checks remain pending.
- Subsequent user testing confirmed the score-system and outer-sidebar fixes and approved starting Milestone 2.
- Milestone 2 first slice: typecheck/lint pass; 32 test files and 234 tests pass. Attached Chromium confirmed Done Planning opens the selected lesson's Listen step and RH starts in note-gated Pause mode while the guide remains visible.
- Milestone 2.5 user feedback confirmed the shortcut approach works well; A1 replaced A0 as the modifier default. Milestone 3 adds a visible Tempo stage at 60%, a 100% target, 90-point qualification, explicit 10-point increases, and two required qualifying target runs. The RH-only live flow was verified through its 60% Tempo entry; full scoring needs physical MIDI.
- Milestone 4 first slice adds session-only evidence collection for every assessed Guided Practice pass. The completed lesson now ranks missed, wrong-pitch, and mistimed notes by measure, names a hand only when its issue count is clearly dominant, and exposes the underlying counts in an expandable Practice insight card. Focused detours remain the next unchecked item.
- Milestone 4 targeted detours are implemented. The Practice insight exposes “Start focused practice” directly; it scopes the score to the diagnosed measure and dominant hand, uses Pause-at-each-note for a focused pass, incorporates that pass into session diagnosis evidence, and restores the exact lesson range, hand, play mode, tempo, and loop preference on return without altering plan boundaries or completion.
