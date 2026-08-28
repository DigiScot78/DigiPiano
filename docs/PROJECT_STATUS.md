# Project Status

## Purpose
The project is a browser-based piano learning proof of concept. The current milestone proves the complete technical path from a local MusicXML/MXL score to rendered notation, normalized expected events, live Web MIDI input, correct-note recognition, and score-position advancement.

## What Works
- Vite React TypeScript app starts locally with `npm run dev`.
- `.mxl`, `.musicxml`, and `.xml` files can be selected from the local computer.
- `.mxl` files are decompressed in-browser with `fflate`.
- OpenSheetMusicDisplay renders selected scores as conventional notation and is configured to honor MusicXML system/page breaks when the file provides them.
- MusicXML is normalized into ordered playable `ScoreEvent` objects with per-note staff, pitch spelling, active clef, arpeggio direction/group metadata, key-signature metadata, and lightweight import diagnostics.
- The app requests Web MIDI access, lists MIDI inputs, and subscribes to the selected input. Every raw message is captured in a bounded ordered event buffer with its own held-before/held-after snapshot, preventing React render batching from dropping rapid chord note-ons. This has been smoke-tested with a real keyboard by the user.
- MIDI note-on, note-off, velocity-zero note-off, and sustain pedal messages are decoded; real keypresses have been observed by the user.
- Held notes are compared with the current expected event; user-confirmed real-keyboard progress works after the renderer lifecycle fix.
- Chords advance only when every expected filtered note is held; extra notes are reported but do not block progress.
- Correct held notes render as green score feedback markers, wrong held notes render as red markers, and note-name text can be toggled independently for correct and wrong feedback. Vertical placement combines OSMD's measured staff lines with the active per-note MusicXML clef, including lower-staff treble, F/C clefs, non-default lines, octave changes, and clef changes. Correct notes use their written staff and wrong notes use the nearest active expected note's staff.
- After a correct event advances, the still-held completed notes are suppressed from wrong-note feedback until released so they do not appear as mistakes against the next event.
- Correct notes from a completed event remain anchored at that event for 450ms, staying solid briefly before fading; wrong-note feedback remains live-only.
- Visual score selection uses a smooth freeform drag/resize outline as a positioning guide while event-aligned clear/faded regions use true anchors and neighbour midpoints to show the exact range that release will commit without exposing adjacent events.
- Selected ranges can play once or loop, and practice can be filtered to both hands, right hand staff 1, or left hand staff 2; one-hand practice skips events with no notes for the selected hand.
- One-hand modes apply a lighter white-wash fade to the inactive staff across the full score or within the active selection preview, while feedback and interaction overlays remain clear.
- Practice hand selection now uses staff-aligned RH/LH toggles beside the score and prevents disabling the final active hand; loop mode lives in an extensible floating toolbar above the score or active selection.
- The score now occupies the primary page area, with compact file/practice/debug panels in a right sidebar. The Settings cog sits beside Open score inside that panel; its centred modal remembers the chosen MIDI input and reconnects automatically when browser permission is already granted.
- The right sidebar is now a persisted right-docked workspace panel with a 240–640px drag-resizable width, a collapse control, and a fixed right-edge restore tab. It reserves score width but uses the full viewport height as an opaque layer above the piano, Synthesia, and timeline in its own column. A fixed Open score/Settings header and persisted, keyboard-accessible Practice/Debug tabs give the selected workspace the only scrolling body; Debug is no longer trapped in a nested miniature pane. Optional Play-time auto-hide docks an initially open panel through countdown, playback, pauses, gates, and loop waiting, then restores it only when the run stops; manual restoration cancels hiding for that run. Separate persisted 8–300px margins for panel-open and panel-docked layouts symmetrically resize the score paper and trigger OSMD reflow.
- Settings now use a wide responsive four-tab General/Appearance/Piano/Play workspace with keyboard-accessible navigation and grouped cards. They include a persisted System/Light/Dark application theme and independent Paper/Night score styles. Paper uses a warm textured page; Night asks OSMD to render pale notation on a dark page, with all fading and interaction overlays using matching score tokens.
- A persisted, collapsible full-width piano panel is fixed to the bottom of the viewport so it remains visible while long scores scroll. It supports 88/76/61/49-key and validated custom ranges, three heights, Auto/Fit/Scroll width modes, optional scientific note labels, and accessible expected/correct/wrong/carried-note states. Expected notes outside the visible range can be revealed in one action.
- Piano highlight colours are configurable in Settings. Normalized key geometry and panel-level visual tokens are shared by the keyboard and falling-note view without coupling layout to pixels.
- A tempo-aware timed Play mode follows embedded MusicXML tempo changes (with a configurable fallback BPM), supports full-score or selection playback, and drives the score cursor plus duration-aware piano expectations through rests and tempo changes.
- Timed Play can now produce a lightweight piano-like Web Audio voice from the same hand-filtered playback plan used by the score and Synthesia view. Clicking any visible on-screen piano key auditions that pitch through an isolated synth voice, including during playback, and follows the shared mute/volume setting. Both transport toolbars expose synchronized persisted mute/volume popovers. Audio follows score tempo, selections, hand filters, countdowns, stops, and loops; raw MIDI input remains silent.
- Both transport toolbars now share Play/Pause/Resume and Reset controls. Manual pause freezes score, Synthesia, audio, and note gates; resume uses the configured countdown before continuing from the frozen position. Space is reserved globally for the same transport toggle, while Reset stops and returns timed and untimed practice to the active full-score or selection start with clean results.
- Starting with either Play button or Space begins from the currently displayed practice event; Reset is the explicit shortcut back to the active plan start. Countdown presentation is fixed above the Synthesia surface, system following leaves generous space above the notation toolbar, and the Synthesia controls sit below the keys immediately above the timeline.
- Play mode has a configurable countdown, Play/Pause/Resume and Reset controls, and loop-end restart waiting. The final countdown number remains until the exact playback onset, when a compact Go cue and first-event pulse identify the intended first-note moment. Any computer key or MIDI note restarts a loop through a fresh countdown; the restart input is not scored, and the waiting prompt leaves score/results fully visible without fading.
- The floating score toolbar has a live Pause-at-each-note option. Timed playback freezes at each upcoming hand-filtered onset until the complete required note or chord is freshly pressed and held concurrently, then resumes with its remaining tempo and spacing intact. Releasing a partial chord removes those pitches from gate progress, so sequential taps cannot accumulate. Rapid multi-note bursts are drained event-by-event even when React batches their state updates. The transport's next unopened gate is authoritative for both keyboard expectations and audio lookahead, preventing sustained/future-note highlight bursts and preventing a gated chord from sounding before successful input. Waiting shows only live held-key feedback—green for currently held expected pitches and red for currently held wrong pitches—and gated input never creates permanent correct, wrong, or missed-note performance marks.
- MusicXML arpeggios are treated as ordered gestures rather than simultaneous chords in both untimed practice and Pause-at-each-note gates. Direction defaults upward or follows an explicit downward mark; successive notes may be released but must arrive in order within a 750ms gap. The waiting prompt names only the next rolled pitch, the sidebar labels the arpeggio and direction, and synthesized score playback spreads rolled notes by 70ms.
- The expanded piano toolbar can enable a persisted initial Synthesia view and exposes synchronized Play/Pause/Resume, Reset, Loop, Pause-at-each-note, and Clear controls. Its pointer-through lane panel rises from the keyboard, has a persisted drag-adjustable height plus transparent/opaque, falling-note-label, and Slow/Normal/Fast speed controls, follows the keyboard's normalized and horizontally scrolled key geometry, and renders bright staff-coloured duration blocks above the toolbar. Countdown time positions the first blocks precisely; keys fill with the matching hand colour at the strike point, note-gated playback freezes that state until the required input, and very short written notes retain the strike highlight for a brief readable minimum without changing transport timing.
- Expanded Synthesia includes a selection-relative timeline below the keyboard with hand-coloured event marks, elapsed/total time, a live playhead, and event-snapped seeking. Timed seeking creates a clean paused attempt at the destination; untimed seeking moves the learning cursor directly.
- The score timeline is available whenever a playable score is loaded, including with Synthesia disabled or the keyboard collapsed. In collapsed mode it remains a slim navigation strip beside the piano restore button.
- The score auto-follows the displayed cursor by smoothly bringing each newly active notation system to the top of the viewport in timed playback and untimed practice.
- OSMD and every app-owned overlay anchor now refresh after observed score-width changes and window/screen resize events, covering live sidebar resizing, panel collapse, margin adjustment, viewport resize, and moving the browser between displays without reloading MusicXML.
- A single score click moves to the nearest hand-filtered playable event, while movement beyond a small threshold retains drag selection. Clicks outside an existing selection are ignored; timed clicks use the same clean paused seek as the timeline.
- MIDI note-on attempts are timestamped at the browser input boundary. Each written event/pitch accepts one deduplicated green in-tolerance result centered over the expected note. Wrong-pitch and mistimed attempts remain individual red markers at the played pitch and interpolated score-time position. Results can be shown live via a persisted option but default to appearing after Stop/completion; expected pitches without a valid green result receive a compact red X at natural completion.
- A simulation button can advance events without hardware.
- Debug panel shows loaded file, selected MIDI device, last MIDI message, held notes, ignored carried notes, expected event, event index, selected-hand playability, next playable index, parser warnings, import diagnostics, comparison results, and practice-attempt diagnostics.

## Recently Completed
- Implemented the first browser-only PoC architecture.
- Added deterministic unit tests for core MIDI, note, parser, matcher, progress logic, and renderer overlay behavior.
- Added architecture and decision documentation.
- Added `Samples/` to `.gitignore`; local sample files remain available for manual testing but are not committed.
- Verified through a temporary local-only test that `Samples/Mad_world_Piano.mxl` decompresses and produces playable score events.
- Fixed a renderer lifecycle bug where MIDI/debug rerenders could reload OpenSheetMusicDisplay and cause severe memory growth per keypress.
- Reworked score selection so dragging and resize handles use freeform pointer previews and resolve to score events only on release.
- Added OSMD graphical-event anchoring, narrower current-event markers, MusicXML system-break rendering options, and import diagnostics for staff/layout troubleshooting.
- Fixed rest-over-pitched-note parsing so rests in another voice at the same timestamp do not hide playable notes.
- Added green correct-note feedback, red wrong-note feedback, independent note-name toggles, and carry-over suppression for notes still held after a correct advancement.
- Added the read-only bottom piano panel and reusable piano settings/geometry/state module.
- Added the first timed playback and performance-marking foundation without sound generation.
- Added MIDI-gated timed playback as the transport foundation used by the Synthesia-style mode.
- Added the initial transparent Synthesia falling-note view using the shared piano and timed-transport geometry.

## Work In Progress
- Current baseline is usable for `Samples/Mad_world_Piano.mxl` per user feedback. Wrong/correct note reporting is improved but still needs more real-keyboard refinement.
- The first Pause-at-each-note and Synthesia implementation is complete and considered a strong initial form. Further visual/timing refinements are expected after broader hands-on testing rather than before this checkpoint is committed.
- The first synthesized score-audio implementation is complete in code. Sound quality, onset feel, chord balance, Pause-gate behavior, mute/volume ergonomics, and stop/loop cleanup still need hands-on Chromium speaker and MIDI testing.
- Manual pause/resume, timeline seeking, Reset, global Space handling, and system auto-follow are implemented and covered by deterministic tests where practical, but still need hands-on Chromium validation for scroll feel, focus behavior, layout, and audible resume cleanup.
- `Samples/Final_Fantast_IV_The_Prelude_-_Piano_Solo.mxl` appears to encode its opening pitched notes on staff 1 only, so left-hand practice has little/no opening material for that file. Other tested scores appear to split hands normally.

## Known Issues Or Blockers
- Written repeat expansion is deferred; the parser follows printed measure order and reports repeat warnings.
- Score overlays prefer OSMD graphical measure/timestamp mapping instead of cursor-step sampling, but exact notehead-level placement is still deferred.
- Correct/wrong score feedback uses rendered staff-line geometry plus MusicXML/key-signature-aware diatonic steps, but remains an app-owned overlay rather than exact rendered notehead geometry.
- Tied stop-only notes are skipped as re-strikes, but tie durations are not merged into extended event durations.
- Real MIDI hardware has been partially validated by the user: device detection, keypress display, Mad World score rendering, score selection, and basic progression are working well. Feedback behavior still needs follow-up polish.
- No `.mid` playback/comparison path is implemented; the `.mxl` score remains the source of truth.
- MIDI-input sound generation, performance export, and note-off/held-duration assessment remain deferred. The first falling-note lanes are visual and use written onset/duration only. The current score and pointer-audition voices are synthesized; a sampled piano remains a later audio-quality upgrade.
- Timed performance marking currently scores note-on pitch/onset only; velocity, held duration, note-off timing, sustain quality, and export remain deferred. Score audio uses fixed synthesized dynamics and does not yet interpret MusicXML dynamics, sustain, or articulation.
- The two `ScoreRenderer` geometry failures were resolved by anchoring completed feedback to the written-note position and mirroring pointer interaction mode in a ref so batched pointer events retain the full drag preview. With arpeggio parsing/recognition/audio, rapid MIDI chord capture, clef-aware marker placement, workspace persistence/migration, responsive-renderer, click-navigation, transport, timeline, piano-audition, and authoritative pause-gate scheduling coverage, the automated suite now reports 130/130 passing tests.
- The current managed Codex environment blocks Vite/Vitest's normal config bundling and Vitest fork workers with `spawn EPERM`; native config loading plus `--pool=vmThreads --maxWorkers=1` runs validation successfully. No in-app browser target was attached during the latest refinement, so Synthesia and score-audio behavior still need local Chromium and real-speaker verification.

## Important Assumptions
- Desktop Chromium is the initial supported browser target.
- Localhost/127.0.0.1 is sufficient for Web MIDI development because it is treated as a secure context.
- The user will handle remote pushes.
- `Samples/` may contain copyrighted or third-party music and should remain local-only unless explicitly approved for commit.

## Recommended Next Steps
- Start with real-browser and MIDI-keyboard testing of Pause-at-each-note and Synthesia across several scores, ranges, tempos, hand filters, piano widths, transparent/opaque modes, and resized roll heights.
- Test score audio through real speakers across countdowns, full scores and selections, RH/LH filters, Pause gates, loops, Stop, mute, and live volume changes; note onset drift, stuck notes, clipping, or harsh chord balance before tuning the synth.
- Refine Synthesia only from observed use: block speed/readability, label density, staff colours, auto-follow behavior, strike/key feedback, and toolbar ergonomics are the likely adjustment points.
- Continue with wrong/correct note feedback polish: validate green markers, red markers, label toggles, and held-note carry-over suppression on a real keyboard.
- Validate the 450ms completed-correct linger/fade timing with a real keyboard and adjust only if it feels too fast or distracting.
- Confirm once/loop practice uses resized ranges correctly across several scores.
- Use import diagnostics when a score appears to assign notes to the wrong hand; verify `firstPitchedMeasureByStaff`, `firstMeasures`, and `firstParsedEvents` before changing parser behavior.
- Decide whether the OSMD graphical-event overlay strategy is accurate enough for the next milestone or whether deeper notehead-level renderer integration is required.
- Decide how to handle repeat expansion before moving beyond the proof of concept.
- Consider MIDI file use only if it adds concrete value for playback-order validation or reference playback.

## Relevant Files
- `src/App.tsx`
- `src/components/ScoreRenderer.tsx`
- `src/components/PianoPanel.tsx`
- `src/piano/synthesia.ts`
- `src/playback/usePlaybackSession.ts`
- `src/music/musicXmlLoader.ts`
- `src/music/musicXmlParser.ts`
- `src/midi/messages.ts`
- `src/midi/heldNotes.ts`
- `src/hooks/useMidiInput.ts`
- `src/learning/matcher.ts`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/ROADMAP.md`
