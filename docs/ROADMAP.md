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
- Staff-aligned RH/LH score toggles control hand mode without allowing both hands to be disabled, and an extensible floating score toolbar exposes loop mode.
- The score-first layout keeps temporary controls in a full-height tabbed right workspace, while MIDI setup is isolated in a modal and reuses previously granted access.
- Appearance settings independently control System/Light/Dark application chrome and extensible score-page presets, initially Paper and Night.
- A smooth freeform outline guides selection and resizing while neighbour-midpoint fading previews the exact committed range; event inclusion changes when the moving boundary crosses an event's true anchor.
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
Status: initial implementation complete; needs broader browser/MIDI validation and polish.

Goals:
- Make selected range practice feel deliberate and repeatable without persistence.

Acceptance criteria:
- Range controls show start/end measure/event information.
- User can reset to range start, loop continuously, or play selected range once.
- Current hand mode and run mode are visible in the main practice panel.
- Debug panel exposes selected range, filtered expected event, selected-hand playability, next playable event, and completion state.
- Soundless Play follows MusicXML tempo over the full score or selection, with a configurable countdown and fallback tempo.
- Loop playback waits for keyboard or MIDI confirmation before beginning the next countdown.
- Timestamped MIDI note-ons produce one deduplicated green completion per written note plus individual red mistake attempts at their played score-time positions; results default to appearing after playback and remain until cleared or a new run starts.
- Pause-at-each-note can be changed live and freezes timed playback at each hand-filtered onset until fresh MIDI input completes the note or chord without compressing later rhythm.
- The fixed piano toolbar mirrors Play/Pause/Resume, Reset, Loop, Pause-at-each-note, and Clear controls from the score toolbar.
- A persisted, resizable Synthesia overlay shares piano geometry and playback time, supports transparent/opaque and note-label modes, and aligns staff-coloured duration blocks plus strike-time key fills with the keyboard.
- Score and Synthesia Play controls produce synchronized piano-like browser audio, with shared persisted mute/volume controls and Pause-gate-aware scheduling.
- Both toolbars and Space share Play/Pause/countdown-Resume behavior, with Reset returning to the active plan start.
- Timed and untimed cursor movement auto-follows notation systems, and Synthesia exposes a selection-relative event-snapped timeline below the keyboard.
- The timeline remains available without Synthesia and with the keyboard collapsed; score clicks provide the same event-snapped navigation while preserving active selection bounds.
- A fixed application header keeps app identity, imported score title/subtitle, and Settings visible while the score scrolls. The right workspace panel persists collapse, active Practice/Debug tab, and drag-resized width; it remains viewport-fixed below that header, hides for every fresh Play run but can be restored mid-run, reserves score width while layering above bottom instruments in its own column, and uses independent open/docked score margins. Optional Play fullscreen owns only the fullscreen session it starts. OSMD overlays remain aligned through every live layout/display/fullscreen resize.

## Milestone 4: Feedback Quality
Status: in progress.

Goals:
- Improve how correct, missing, and extra notes are shown on the score.

Acceptance criteria:
- Correct held notes show green feedback during partial chords and wrong held notes show red feedback.
- Note-name text for correct and wrong feedback can be toggled independently.
- Completed notes that remain held after advancement do not immediately become wrong-note feedback on the next event.
- Completed correct notes remain anchored to the completed event briefly, then fade; wrong notes remain live-only.
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
- Live fading: strong white-wash fading follows the event-backed draft while a separate freeform outline follows the pointer; one-hand modes use a lighter wash for the inactive staff within the current clear range or across the full score when no range exists.
- Selection resizing: left/right handles preview smoothly and snap to `ScoreEvent` anchors on release.
- Note feedback: app-owned green/red marker heads show correct/wrong held notes near the current score event; vertical pitch placement derives independently from rendered treble and bass staff-line geometry, with wrong notes assigned to the nearest active expected staff, and correct and wrong note-name labels can be toggled independently.
- Held-note carry-over: notes that completed the previous event are ignored for wrong-note feedback against the next event until released.
- Completed feedback: successful green markers remain at the completed event for 450ms and fade during the final portion; newer completions replace older snapshots.
- Hand split: staff 1 is right hand; staff 2 is left hand; one-hand progression skips events with no notes for the selected hand.
- Score diagnostics: debug output reports staff counts, system breaks, first parsed events, and practice attempts to troubleshoot file/parser/renderer mismatches.
- Looping: practice loop waits for correct MIDI input and jumps back to selection start.
- Timed transport: MusicXML tempo-aware monotonic playback with countdown, performance marking, note gates, and loop-restart waiting.
- Score audio: dependency-free synthesized piano voice driven by the active hand-filtered playback plan; sampled piano quality, score dynamics, sustain interpretation, and output-device selection remain future work.
- Synthesia: persisted Slow/Normal/Fast visual speeds (70/100/140px per second); cyan staff-1/right-hand blocks, violet staff-2/left-hand blocks; short notes receive a 140ms minimum strike-key highlight while written block duration remains unchanged; duration is visual only and does not yet assess release timing.
- Preferences: appearance, piano layout, Synthesia presentation, and Play settings persist locally; reusable training-list persistence remains deferred.
