# Project Status

## Purpose
The project is a browser-based piano learning proof of concept. The current milestone proves the complete technical path from a local MusicXML/MXL score to rendered notation, normalized expected events, live Web MIDI input, correct-note recognition, and score-position advancement.

## What Works
- Vite React TypeScript app starts locally with `npm run dev`.
- `.mxl`, `.musicxml`, and `.xml` files can be selected from the local computer.
- `.mxl` files are decompressed in-browser with `fflate`.
- OpenSheetMusicDisplay renders selected scores as conventional notation and is configured to honor MusicXML system/page breaks when the file provides them.
- MusicXML is normalized into ordered playable `ScoreEvent` objects with per-note staff, pitch spelling, key-signature metadata, and lightweight import diagnostics.
- The app requests Web MIDI access, lists MIDI inputs, and subscribes to the selected input. This has been smoke-tested with a real keyboard by the user.
- MIDI note-on, note-off, velocity-zero note-off, and sustain pedal messages are decoded; real keypresses have been observed by the user.
- Held notes are compared with the current expected event; user-confirmed real-keyboard progress works after the renderer lifecycle fix.
- Chords advance only when every expected filtered note is held; extra notes are reported but do not block progress.
- Correct held notes render as green score feedback markers, wrong held notes render as red markers, and note-name text can be toggled independently for correct and wrong feedback. Vertical pitch placement is calibrated independently from OSMD's rendered treble and bass staff lines; correct notes use their MusicXML staff and wrong notes use the nearest active expected note's staff.
- After a correct event advances, the still-held completed notes are suppressed from wrong-note feedback until released so they do not appear as mistakes against the next event.
- Correct notes from a completed event remain anchored at that event for 450ms, staying solid briefly before fading; wrong-note feedback remains live-only.
- Visual score selection uses a smooth freeform drag/resize outline as a positioning guide while event-aligned clear/faded regions use true anchors and neighbour midpoints to show the exact range that release will commit without exposing adjacent events.
- Selected ranges can play once or loop, and practice can be filtered to both hands, right hand staff 1, or left hand staff 2; one-hand practice skips events with no notes for the selected hand.
- One-hand modes apply a lighter white-wash fade to the inactive staff across the full score or within the active selection preview, while feedback and interaction overlays remain clear.
- Practice hand selection now uses staff-aligned RH/LH toggles beside the score and prevents disabling the final active hand; loop mode lives in an extensible floating toolbar above the score or active selection.
- The score now occupies the primary page area, with compact file/practice/debug panels in a narrow right sidebar. MIDI configuration opens from a top-right cog in a centred modal, remembers the chosen input, and reconnects automatically when browser permission is already granted.
- Settings now include a persisted System/Light/Dark application theme and independent Paper/Night score styles. Paper uses a warm textured page; Night asks OSMD to render pale notation on a dark page, with all fading and interaction overlays using matching score tokens.
- A persisted, collapsible full-width piano panel is fixed to the bottom of the viewport so it remains visible while long scores scroll. It supports 88/76/61/49-key and validated custom ranges, three heights, Auto/Fit/Scroll width modes, optional scientific note labels, and accessible expected/correct/wrong/carried-note states. Expected notes outside the visible range can be revealed in one action.
- Piano highlight colours are configurable in Settings. Normalized key geometry and panel-level visual tokens provide the horizontal foundation for a future falling-note view without coupling layout to pixels.
- A soundless timed Play mode follows embedded MusicXML tempo changes (with a configurable fallback BPM), supports full-score or selection playback, and drives the score cursor plus duration-aware piano expectations through rests and tempo changes.
- Play mode has a configurable countdown, Play/Stop controls, and loop-end restart waiting. The final countdown number remains until the exact playback onset, when a compact Go cue and first-event pulse identify the intended first-note moment. Any computer key or MIDI note restarts a loop through a fresh countdown; the restart input is not scored, and the waiting prompt leaves score/results fully visible without fading.
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

## Work In Progress
- Current baseline is usable for `Samples/Mad_world_Piano.mxl` per user feedback. Wrong/correct note reporting is improved but still needs more real-keyboard refinement.
- `Samples/Final_Fantast_IV_The_Prelude_-_Piano_Solo.mxl` appears to encode its opening pitched notes on staff 1 only, so left-hand practice has little/no opening material for that file. Other tested scores appear to split hands normally.

## Known Issues Or Blockers
- Written repeat expansion is deferred; the parser follows printed measure order and reports repeat warnings.
- Score overlays prefer OSMD graphical measure/timestamp mapping instead of cursor-step sampling, but exact notehead-level placement is still deferred.
- Correct/wrong score feedback uses rendered staff-line geometry plus MusicXML/key-signature-aware diatonic steps, but remains an app-owned overlay rather than exact rendered notehead geometry.
- Tied stop-only notes are skipped as re-strikes, but tie durations are not merged into extended event durations.
- Real MIDI hardware has been partially validated by the user: device detection, keypress display, Mad World score rendering, score selection, and basic progression are working well. Feedback behavior still needs follow-up polish.
- No `.mid` playback/comparison path is implemented; the `.mxl` score remains the source of truth.
- Piano pointer interaction, sound generation, recording, and falling-note lanes are intentionally deferred.
- Timed performance marking currently scores note-on pitch/onset only; velocity, held duration, note-off timing, sustain quality, export, and audio remain deferred.

## Important Assumptions
- Desktop Chromium is the initial supported browser target.
- Localhost/127.0.0.1 is sufficient for Web MIDI development because it is treated as a secure context.
- The user will handle remote pushes.
- `Samples/` may contain copyrighted or third-party music and should remain local-only unless explicitly approved for commit.

## Recommended Next Steps
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
- `src/music/musicXmlLoader.ts`
- `src/music/musicXmlParser.ts`
- `src/midi/messages.ts`
- `src/midi/heldNotes.ts`
- `src/hooks/useMidiInput.ts`
- `src/learning/matcher.ts`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/ROADMAP.md`
