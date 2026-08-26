# Roadmap

## Purpose
This roadmap tracks the path from the working proof of concept to a richer interactive piano learning surface. Keep it current as milestones complete or design assumptions change.

## Milestone 1: Interactive Score Foundation
Status: implemented; awaiting real-score validation.

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
- Hand mode supports both hands, right hand staff 1, and left hand staff 2.
- Wrong-note feedback continues to work against the filtered expected notes and appears as red ghost noteheads near the current score event.
- Core selection, resizing, filtering, and loop logic has automated tests.

## Milestone 2: Selection Precision And Renderer Evaluation
Status: planned.

Goals:
- Improve the fidelity of score hit-testing and highlight placement.
- Decide whether OSMD overlays are sufficient for rich interaction.

Acceptance criteria:
- Event anchors align acceptably with the real sample score across systems/pages.
- Selection segments, resize handles, and wrong-note ghosts are validated against `Samples/Mad_world_Piano.mxl`.
- Gaps, repeats, and multi-staff events are documented with screenshots or notes.
- A decision is recorded: continue OSMD overlay strategy, deepen OSMD integration, or evaluate an alternative renderer.

## Milestone 3: Practice Session Tools
Status: planned.

Goals:
- Make selected range practice feel deliberate and repeatable without persistence.

Acceptance criteria:
- Range controls show start/end measure/event information.
- User can reset to range start, loop continuously, or play selected range once.
- Current hand mode and run mode are visible in the main practice panel.
- Debug panel exposes selected range, filtered expected event, and completion state.

## Milestone 4: Feedback Quality
Status: planned.

Goals:
- Improve how correct, missing, and extra notes are shown on the score.

Acceptance criteria:
- Wrong-note overlay is stable during repeated MIDI input.
- Wrong-note ghost y-placement is useful enough for unfamiliar players to locate the pressed key relative to the current score position.
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
- Renderer: OpenSheetMusicDisplay with app-owned overlays.
- Selection: visual drag mapped to `ScoreEvent` indices with segmented system-row rectangles that preserve mid-system boundaries and meet vertically between systems.
- Selection after release: outside content is dimmed; selected area remains clear.
- Selection resizing: left/right handles snap to `ScoreEvent` anchors.
- Wrong-note feedback: app-owned red ghost noteheads at the current event x-position with approximate diatonic staff/pitch y-placement.
- Hand split: staff 1 is right hand; staff 2 is left hand.
- Looping: practice loop waits for correct MIDI input and jumps back to selection start.
- Persistence: out of scope until the interaction model proves itself.
