# Architecture

## Scope
The current application is a browser-only TypeScript/React proof of concept. It intentionally avoids a backend, database, accounts, analytics, telemetry, microphone input, audio synthesis, and mobile support.

## Runtime Path
1. The user selects a local `.mxl`, `.musicxml`, or `.xml` score file.
2. `src/music/musicXmlLoader.ts` reads the file in the browser. `.mxl` files are decompressed locally with `fflate`; no score data is uploaded.
3. `src/components/ScoreRenderer.tsx` renders the MusicXML string with OpenSheetMusicDisplay, asks OSMD to honor MusicXML system/page breaks when present, maps parsed `ScoreEvent` objects back to OSMD graphical measure/timestamp positions where available, and draws app-owned overlays for the visible score position and interaction.
4. `src/music/musicXmlParser.ts` parses the MusicXML into ordered playable `ScoreEvent` objects.
5. `src/hooks/useMidiInput.ts` requests Web MIDI access, lists inputs, subscribes to the selected input, and passes messages through the decoder.
6. `src/midi/messages.ts` decodes note-on, note-off, velocity-zero note-off, control change, and sustain pedal state.
7. `src/midi/heldNotes.ts` tracks currently held physical keys.
8. `src/learning/matcher.ts` compares held notes against the current score event and advances when all expected notes are present.
9. The score renderer treats the full rendered score as a pointer surface; selection and resize gestures preview from raw pointer positions and resolve to stable `ScoreEvent` ranges only on release.

## ScoreEvent Model
`ScoreEvent` represents a playable event at a score position:

```ts
interface ScoreEventNote {
  midiNote: number;
  staffNumber: number;
  voiceNumber: string;
  sourceNoteId: string;
  pitchStep?: string;
  pitchAlter?: number;
  pitchOctave?: number;
}

interface ScoreEvent {
  id: string;
  partId: string;
  measureNumber: number;
  startQuarter: number;
  measureStartQuarter?: number;
  durationQuarters: number;
  midiNotes: number[];
  staffNumbers: number[];
  voiceNumbers: string[];
  sourceNoteIds: string[];
  noteDetails: ScoreEventNote[];
  keyFifths?: number;
  isRest?: boolean;
}
```

The parser groups notes that begin at the same quarter position in the same part and measure, including chord members, multiple voices, and treble/bass staff notes. Each event keeps absolute quarter time plus the measure-start quarter so the renderer can resolve the event back to an in-measure timestamp. Each event also keeps per-note staff, voice, and MusicXML pitch spelling metadata so hand filtering and enharmonic overlay placement can operate without reparsing. Rests are parsed for timeline movement but excluded from the playable event sequence. If a rest and pitched note share the same event timestamp across voices, the pitched event remains playable.

## MusicXML Handling
Currently handled:
- `.mxl` decompression using `META-INF/container.xml` when present.
- Uncompressed `.musicxml` and `.xml` input.
- Measures, divisions, durations, voices, staves, rests, chords, backup, forward, key fifths, pitch spelling/alter, MusicXML print/system-break diagnostics, and basic tie continuation skipping.
- Detection and warning for written repeats.

Partially handled or deferred:
- Repeat expansion is deferred; the PoC follows printed measure order only.
- Tie durations are not merged into one extended duration; tied stop-only notes are skipped as re-strikes.
- Complex navigation such as segno/coda, endings, alternate repeat endings, tuplets, grace notes, ornaments, transposing instruments, and playback-specific MusicXML semantics are not fully modeled.
- Renderer overlays prefer OSMD graphical measure/timestamp lookup, with cursor sampling only as a fallback when graphical data is unavailable. Complex scores may still expose alignment gaps that need manual validation.

## Renderer Overlay Model
The renderer keeps OSMD as the notation engine and draws app-owned overlays above the rendered SVG. It first tries to map every parsed `ScoreEvent` to the matching OSMD graphical measure/staff entry by measure number, staff, and in-measure timestamp. When that succeeds, the native OSMD cursor is hidden and the app-owned current-event marker is used instead; this keeps one-hand practice aligned when the learning state skips events from the inactive hand. Cursor sampling remains as a fallback for tests or renderer states where graphical lookup is unavailable.

The full score surface accepts pointer selection. During drag and handle resizing, a freeform pointer outline follows the pointer smoothly while a separate event-backed draft controls the clear and faded score regions. An event enters the draft when the moving boundary crosses its true horizontal anchor, independent of the visual cursor width. Clear-range edges sit midway between selected edge events and their nearest unselected neighbours, preventing generous overlay padding from exposing notes outside the range. The fading is therefore the authoritative live preview of the range that release will commit; the freeform outline is only a positioning guide and settles onto event boundaries after release. Cross-system selections preserve event-backed start and end points, and selected row segments expand vertically to the midpoint between neighboring systems so adjacent selected systems visually meet.

In one-hand modes, the renderer uses per-system treble/bass staff geometry to apply a lighter white wash to the inactive half of each system. With no range, this covers the full rendered score; with a committed or live event-backed preview range, inactive-hand fade rectangles are clipped to the clear range so they do not stack with outside-range fading. Selection borders, handles, current-position markers, and note feedback render above these overlays.

Score-owned practice controls share the renderer's event and staff geometry. RH/LH toggle buttons anchor immediately left of the first active range event, aligned to their respective staff centres, and the final enabled hand cannot be turned off. An extensible floating toolbar anchors above the active selection or the first score system and currently contains the once/loop toggle.

Correct and wrong held notes are shown as app-owned green/red marker heads near the current event's mapped graphical score position. Note-name labels can be toggled independently for correct and wrong feedback. Vertical placement reads the rendered staff lines for both staves from the event's OSMD graphical measures and maps pitches in diatonic half-space steps. Treble calibration places middle C on the first ledger line below the staff; bass calibration places it on the first ledger line above the staff. Correct notes use their MusicXML staff, while wrong notes use the staff of the nearest active expected pitch, with a conventional C4/D4 boundary for ties and missing context. A fixed fallback is retained when staff-line geometry is unavailable. For black-key MIDI notes, it prefers the exact MusicXML spelling when the note exists in the current event, otherwise it uses the current key signature to choose sharp or flat spelling. This avoids mutating OSMD/VexFlow internals, but it is not yet exact notehead-level engraving.

On successful advancement, the app snapshots the completed event, its index, and its correct feedback markers. The renderer keeps that snapshot anchored to the completed score position for 450ms and fades it during the final portion of that interval. A newer completion replaces the previous snapshot. Wrong markers remain tied only to currently held notes, and practice-context resets clear transient feedback.

## MIDI Handling
The app uses Web MIDI with `sysex: false`. MIDI configuration lives in a modal opened from the page settings button. It supports multiple listed inputs, persists the selected input ID locally, and subscribes only to that input. On startup it checks the browser's MIDI permission and reconnects automatically only when access is already granted, avoiding unsolicited permission prompts. It handles standard note-on, note-off, velocity-zero note-off, and sustain pedal controller 64.

The score is the dominant page surface. A compact right sidebar contains the temporary file picker, practice status/actions, and debug diagnostics; the earlier full-width control panels have been removed in preparation for a future dedicated play/practice view.

Appearance is split into independent application and score themes. The application follows the operating-system light/dark preference by default with explicit overrides, while the score defaults to a warm Paper preset and can independently use a Night preset. Score presets provide OSMD notation colours plus CSS page, wash, control, outline, and feedback-surface tokens; this avoids image inversion and provides an extension point for future page styles. Preferences are stored locally.

Web MIDI support is browser-dependent. Chromium-based desktop browsers are the supported target. Secure context is required; local development on `localhost` or `127.0.0.1` is acceptable.

## Learning Mode
The current mode is untimed. A chord is accepted once all expected notes are currently held; the notes do not need to arrive in the same millisecond. Extra held notes are reported as mistakes but do not block advancement. Notes that completed the previous event are suppressed from wrong-note feedback until released, preventing a held correct note from immediately appearing as wrong against the next event. Progress advances on new note-on input or the simulation button, not merely because a previous note remains held. Selected ranges can run once or loop back to the selected start. Hand mode filters expected notes by staff: right hand uses staff 1, left hand uses staff 2. In one-hand modes, practice navigation skips score events that have no playable notes for the selected hand so the raw event index and app-owned score marker stay on the next relevant hand event.

## Testing Without Hardware
Use the `Simulate Current Event` button to advance through parsed score events without a MIDI keyboard. Unit tests cover MIDI decoding, held-note state, matching, event advancement, note naming, MusicXML timeline fixtures, and renderer overlay behavior.

## Validation Status
Validated by automation:
- Unit tests for deterministic logic and renderer overlay behavior.
- Type checking.
- Linting.
- Production build.

Real-hardware validation:
- User has confirmed browser MIDI keyboard detection, real keypress display, and correct-event score/progress advancement.
- Broader score coverage, feedback marker placement, device connection/disconnection behavior, and sustain pedal behavior still need focused validation with the real sample score and keyboard.
