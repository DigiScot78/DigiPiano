# Roadmap

## Purpose
This roadmap tracks the path from the working proof of concept to a richer interactive piano learning surface. Keep it current as milestones complete or design assumptions change.

## Milestone 1: Interactive Score Foundation
Status: implemented and user-validated on Mad World baseline; needs broader score validation.

Goals:
- Treat the rendered score as an interactive surface.
- Resolve visual score interaction to stable `ScoreEvent` ranges.
- Support staff-based hand practice before persistence or accounts.

Acceptance criteria:
- Dragging across the rendered score selects an event-backed range.
- Selected ranges show segmented system-row highlights while dragging and inverted outside dimming after release; selected system segments meet vertically between adjacent systems.
- Selected ranges can be resized with left and right edge handles.
- Practice can run over the full score or selected range.
- Run mode supports play once and loop selection.
- Hand mode supports both hands, right hand staff 1, and left hand staff 2, skipping events without notes for the selected hand.
- Correct and wrong note feedback works against filtered expected notes and appears as green/red score markers near the current score event, with independent note-name label toggles.
- Core selection, resizing, filtering, and loop logic has automated tests.

## Milestone 2: Selection Precision And Renderer Evaluation
Status: mostly implemented; continue validation/polish.

Goals:
- Improve the fidelity of score hit-testing and highlight placement.
- Decide whether OSMD overlays are sufficient for rich interaction.

Acceptance criteria:
- Event anchors align acceptably with real sample scores across systems/pages, including one-hand passages and dense/tightly spaced notes.
- Selection segments, resize handles, current-position highlight, and note feedback markers are validated against `Samples/Mad_world_Piano.mxl`; avoid further overlay changes without manual browser checks.
- Gaps, repeats, staff-assignment oddities, and multi-staff events are documented with screenshots or notes.
- A decision is recorded: continue OSMD overlay strategy, deepen OSMD integration, or evaluate an alternative renderer.

## Milestone 3: Practice Session Tools
Status: planned.

Goals:
- Make selected range practice feel deliberate and repeatable without persistence.

Acceptance criteria:
- Range controls show start/end measure/event information.
- User can reset to range start, loop continuously, or play selected range once.
- Current hand mode and run mode are visible in the main practice panel.
- Debug panel exposes selected range, filtered expected event, selected-hand playability, next playable event, and completion state.

## Milestone 4: Feedback Quality
Status: in progress.

Goals:
- Improve how correct, missing, and extra notes are shown on the score.

Acceptance criteria:
- Correct held notes show green feedback during partial chords and wrong held notes show red feedback.
- Note-name text for correct and wrong feedback can be toggled independently.
- Completed notes that remain held after advancement do not immediately become wrong-note feedback on the next event.
- Feedback marker y-placement is useful enough for unfamiliar players to locate the pressed key relative to the current score position.
- Missing expected notes are distinguishable from extra held notes.
- If direct notehead-level highlighting is attempted, it is isolated behind renderer adapter APIs.

## Milestone 5: Training List Persistence
Status: deferred.

Goals:
- Save useful selected ranges as reusable practice items.

Deferred decisions:
- Local-only storage versus account-backed storage.
- Training item schema.
- Import/export format.
- User accounts and sync.

## Current Defaults
- Renderer: OpenSheetMusicDisplay with app-owned overlays; OSMD is configured to honor MusicXML `new-system` and `new-page` breaks when present.
- Selection: freeform pointer drag mapped to `ScoreEvent` indices on release, with segmented system-row rectangles that preserve mid-system boundaries and meet vertically between systems.
- Selection after release: outside content is dimmed; selected area remains clear.
- Selection resizing: left/right handles preview smoothly and snap to `ScoreEvent` anchors on release.
- Note feedback: app-owned green/red marker heads show correct/wrong held notes near the current score event; vertical pitch placement derives independently from rendered treble and bass staff-line geometry, with wrong notes assigned to the nearest active expected staff, and correct and wrong note-name labels can be toggled independently.
- Held-note carry-over: notes that completed the previous event are ignored for wrong-note feedback against the next event until released.
- Hand split: staff 1 is right hand; staff 2 is left hand; one-hand progression skips events with no notes for the selected hand.
- Score diagnostics: debug output reports staff counts, system breaks, first parsed events, and practice attempts to troubleshoot file/parser/renderer mismatches.
- Looping: practice loop waits for correct MIDI input and jumps back to selection start.
- Persistence: out of scope until the interaction model proves itself.
