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
- Held notes are compared with the current expected event; user-confirmed real-keyboard progress works after the renderer lifecycle fix.
- Chords advance only when every expected filtered note is held; extra notes are shown in the status panel and as red ghost noteheads near the current score event, but do not block progress.
- Visual score selection supports drag-to-select, segmented cross-system highlights, inverted dimming after selection, and left/right resize handles that snap to score events.
- Selected ranges can play once or loop, and practice can be filtered to both hands, right hand staff 1, or left hand staff 2.
- A simulation button can advance events without hardware.
- Debug panel shows loaded file, selected MIDI device, last MIDI message, held notes, expected event, event index, parser warnings, and comparison results.

## Recently Completed
- Implemented the first browser-only PoC architecture.
- Added deterministic unit tests for core MIDI, note, parser, matcher, progress logic, and renderer overlay behavior.
- Added architecture and decision documentation.
- Added `Samples/` to `.gitignore`; local sample files remain available for manual testing but are not committed.
- Verified through a temporary local-only test that `Samples/Mad_world_Piano.mxl` decompresses and produces playable score events.
- Fixed a renderer lifecycle bug where MIDI/debug rerenders could reload OpenSheetMusicDisplay and cause severe memory growth per keypress.
- Added interactive score selection, once/loop range practice, staff-based hand filtering, segmented cross-system selection, inverted selection dimming, resize handles, and red ghost-note feedback for wrong held notes.

## Work In Progress
- Interactive score foundation is implemented and awaiting focused manual validation against `Samples/Mad_world_Piano.mxl` with the real MIDI keyboard.

## Known Issues Or Blockers
- Written repeat expansion is deferred; the parser follows printed measure order and reports repeat warnings.
- OSMD cursor advancement, selection hit zones, selection hulls, and wrong-note ghost placement are event-index/cursor based and may not perfectly align with all complex MusicXML constructs.
- Wrong-note ghost y-position is approximate and staff/pitch based; exact notehead-level placement is deferred until renderer integration is evaluated further.
- Cross-system selections use one enclosing rectangular hull, which can include whitespace between systems by design.
- Tied stop-only notes are skipped as re-strikes, but tie durations are not merged into extended event durations.
- Real MIDI hardware has been partially validated by the user: device detection, keypress display, and correct-event score/progress advancement work. Device connection/disconnection behavior, sustain pedal behavior, selection resizing, and ghost-note placement still need focused validation.
- No `.mid` playback/comparison path is implemented; the `.mxl` score remains the source of truth.

## Important Assumptions
- Desktop Chromium is the initial supported browser target.
- Localhost/127.0.0.1 is sufficient for Web MIDI development because it is treated as a secure context.
- The user will handle remote pushes.
- `Samples/` may contain copyrighted or third-party music and should remain local-only unless explicitly approved for commit.

## Recommended Next Steps
- Load `Samples/Mad_world_Piano.mxl` and manually validate segmented cross-system selection, inverted dimming, and left/right resize handles.
- Confirm once/loop practice uses resized ranges correctly.
- Test wrong-note ghost placement with the real keyboard and note where pitch/staff alignment is too rough.
- Decide whether OSMD cursor-derived overlays are acceptable for the next milestone or whether deeper OSMD graphical-note mapping is required.
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
