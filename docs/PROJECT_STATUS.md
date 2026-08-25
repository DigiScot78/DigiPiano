# Project Status

## Purpose
The project is a browser-based piano learning proof of concept. The current milestone proves the complete technical path from a local MusicXML/MXL score to rendered notation, normalized expected events, live Web MIDI input, correct-note recognition, and score-position advancement.

## What Works
- Vite React TypeScript app starts locally with `npm run dev`.
- `.mxl`, `.musicxml`, and `.xml` files can be selected from the local computer.
- `.mxl` files are decompressed in-browser with `fflate`.
- OpenSheetMusicDisplay renders the selected score as conventional notation.
- MusicXML is normalized into ordered playable `ScoreEvent` objects.
- The app requests Web MIDI access, lists MIDI inputs, and subscribes to the selected input.
- MIDI note-on, note-off, velocity-zero note-off, and sustain pedal messages are decoded.
- Held notes are compared with the current expected event.
- Chords advance only when every expected note is held; extra notes are shown but do not block progress.
- A simulation button can advance events without hardware.
- Debug panel shows loaded file, selected MIDI device, last MIDI message, held notes, expected event, event index, parser warnings, and comparison results.

## Recently Completed
- Implemented the first browser-only PoC architecture.
- Added deterministic unit tests for core MIDI, note, parser, matcher, and progress logic.
- Added architecture and decision documentation.
- Added `Samples/` to `.gitignore`; local sample files remain available for manual testing but are not committed.
- Verified through a temporary local-only test that `Samples/Mad_world_Piano.mxl` decompresses and produces playable score events.

## Work In Progress
- Browser visual upload/render smoke testing with `Samples/Mad_world_Piano.mxl` remains to be performed manually because the in-app browser connector was unavailable in this session.

## Known Issues Or Blockers
- Written repeat expansion is deferred; the parser follows printed measure order and reports repeat warnings.
- OSMD cursor advancement is event-index based and may not perfectly align with all complex MusicXML constructs.
- Tied stop-only notes are skipped as re-strikes, but tie durations are not merged into extended event durations.
- Real MIDI hardware has not yet been validated with a connected electric piano.
- No `.mid` playback/comparison path is implemented; the `.mxl` score remains the source of truth.

## Important Assumptions
- Desktop Chromium is the initial supported browser target.
- Localhost/127.0.0.1 is sufficient for Web MIDI development because it is treated as a secure context.
- The user will handle remote pushes.
- `Samples/` may contain copyrighted or third-party music and should remain local-only unless explicitly approved for commit.

## Recommended Next Steps
- Manually load `Samples/Mad_world_Piano.mxl` in the browser and confirm OSMD visual rendering and cursor movement.
- Connect the real electric piano and validate Web MIDI permission, device selection, note-on/note-off behavior, and sustain pedal behavior.
- Improve cursor alignment or note highlighting if OSMD cursor behavior is too coarse for the sample score.
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
