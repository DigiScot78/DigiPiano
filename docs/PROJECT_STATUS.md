# Project Status

## Purpose
The project is a browser-based piano learning proof of concept. The current milestone proves the complete technical path from a local MusicXML/MXL score to rendered notation, normalized expected events, live Web MIDI input, correct-note recognition, and score-position advancement.

## What Works
- Vite React TypeScript app starts locally with `npm run dev`.
- `.mxl`, `.musicxml`, and `.xml` files can be selected from the local computer.
- `.mxl` files are decompressed in-browser with `fflate`.
- OpenSheetMusicDisplay renders the selected score as conventional notation.
- MusicXML is normalized into ordered playable `ScoreEvent` objects with per-note staff metadata.
- The app requests Web MIDI access, lists MIDI inputs, and subscribes to the selected input. This has been smoke-tested with a real keyboard by the user.
- MIDI note-on, note-off, velocity-zero note-off, and sustain pedal messages are decoded; real keypresses have been observed by the user.
- Held notes are compared with the current expected event; user-confirmed real-keyboard progress now works after the renderer lifecycle fix.
- Chords advance only when every expected filtered note is held; extra notes are shown in the status panel and as red labels near the current score cursor, but do not block progress.
- A simulation button can advance events without hardware.
- Debug panel shows loaded file, selected MIDI device, last MIDI message, held notes, expected event, event index, parser warnings, and comparison results.

## Recently Completed
- Implemented the first browser-only PoC architecture.
- Added deterministic unit tests for core MIDI, note, parser, matcher, and progress logic.
- Added architecture and decision documentation.
- Added `Samples/` to `.gitignore`; local sample files remain available for manual testing but are not committed.
- Verified through a temporary local-only test that `Samples/Mad_world_Piano.mxl` decompresses and produces playable score events.
- Fixed a renderer lifecycle bug where MIDI/debug rerenders could reload OpenSheetMusicDisplay and cause severe memory growth per keypress.
- Added a cursor-anchored red wrong-note overlay for extra held MIDI notes.
- Added `docs/ROADMAP.md` for multi-session planning.
- Added visual drag selection, selected-range highlighting, once/loop practice modes, and staff-based hand filtering.

## Work In Progress
- Interactive score foundation is in progress: visual range selection, staff hand filters, and selected-range once/loop practice are implemented and awaiting real-keyboard validation.

## Known Issues Or Blockers
- Written repeat expansion is deferred; the parser follows printed measure order and reports repeat warnings.
- OSMD cursor advancement, selection hit zones, and wrong-note overlay placement are event-index/cursor based and may not perfectly align with all complex MusicXML constructs.
- Tied stop-only notes are skipped as re-strikes, but tie durations are not merged into extended event durations.
- Real MIDI hardware has been partially validated by the user: device detection, keypress display, and correct-event score/progress advancement work. Device connection/disconnection behavior still needs focused validation.
- No `.mid` playback/comparison path is implemented; the `.mxl` score remains the source of truth.

## Important Assumptions
- Desktop Chromium is the initial supported browser target.
- Localhost/127.0.0.1 is sufficient for Web MIDI development because it is treated as a secure context.
- The user will handle remote pushes.
- `Samples/` may contain copyrighted or third-party music and should remain local-only unless explicitly approved for commit.

## Recommended Next Steps
- Retest `Samples/Mad_world_Piano.mxl` after the renderer lifecycle fix and confirm memory stays stable during repeated keypresses.
- Confirm whether the current expected event advances and whether OSMD cursor movement is clear enough during real-keyboard matching.
- Connect the real electric piano and validate Web MIDI permission, device selection, note-on/note-off behavior, and sustain pedal behavior.
- Improve cursor alignment or true notehead-level highlighting if the cursor-anchored wrong-note overlay is too coarse for the sample score.
- Decide how to handle repeat expansion before moving beyond the first proof of concept.
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
