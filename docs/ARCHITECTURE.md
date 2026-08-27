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

The full score surface accepts pointer selection. During drag, the selected range is previewed as one or more rectangular segments grouped by rendered system row. On release, raw pointer positions resolve to nearest event anchors and the committed selection dims outside regions while selected segments remain clear. Cross-system selections preserve mid-system start and end points, and selected row segments expand vertically to the midpoint between neighboring systems so adjacent selected systems visually meet. Committed selections expose left and right resize handles that preview smoothly and snap to parsed score events on release.

Correct and wrong held notes are shown as app-owned green/red marker heads near the current event's mapped graphical score position. Note-name labels can be toggled independently for correct and wrong feedback. Vertical placement is approximate: it uses the current event staff context, chooses a treble or bass staff region, and maps MIDI pitch to diatonic staff steps. For black-key MIDI notes, it prefers the exact MusicXML spelling when the note exists in the current event, otherwise it uses the current key signature to choose sharp or flat spelling. This avoids mutating OSMD/VexFlow internals, but it is not yet exact notehead-level engraving.

## MIDI Handling
The app uses Web MIDI with `sysex: false`. It supports multiple listed inputs and subscribes only to the selected input. It handles standard note-on, note-off, velocity-zero note-off, and sustain pedal controller 64.

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
