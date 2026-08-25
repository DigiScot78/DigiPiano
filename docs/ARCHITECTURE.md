# Architecture

## Scope
The current application is a browser-only TypeScript/React proof of concept. It intentionally avoids a backend, database, accounts, analytics, telemetry, microphone input, audio synthesis, and mobile support.

## Runtime Path
1. The user selects a local `.mxl`, `.musicxml`, or `.xml` score file.
2. `src/music/musicXmlLoader.ts` reads the file in the browser. `.mxl` files are decompressed locally with `fflate`; no score data is uploaded.
3. `src/components/ScoreRenderer.tsx` renders the MusicXML string with OpenSheetMusicDisplay and uses its cursor as the visible score position.
4. `src/music/musicXmlParser.ts` parses the MusicXML into ordered playable `ScoreEvent` objects.
5. `src/hooks/useMidiInput.ts` requests Web MIDI access, lists inputs, subscribes to the selected input, and passes messages through the decoder.
6. `src/midi/messages.ts` decodes note-on, note-off, velocity-zero note-off, control change, and sustain pedal state.
7. `src/midi/heldNotes.ts` tracks currently held physical keys.
8. `src/learning/matcher.ts` compares held notes against the current score event and advances when all expected notes are present.

## ScoreEvent Model
`ScoreEvent` represents a playable event at a score position:

```ts
interface ScoreEvent {
  id: string;
  partId: string;
  measureNumber: number;
  startQuarter: number;
  durationQuarters: number;
  midiNotes: number[];
  staffNumbers: number[];
  voiceNumbers: string[];
  sourceNoteIds: string[];
  isRest?: boolean;
}
```

The parser groups notes that begin at the same quarter position in the same part and measure, including chord members, multiple voices, and treble/bass staff notes. Rests are parsed for timeline movement but excluded from the playable event sequence.

## MusicXML Handling
Currently handled:
- `.mxl` decompression using `META-INF/container.xml` when present.
- Uncompressed `.musicxml` and `.xml` input.
- Measures, divisions, durations, voices, staves, rests, chords, backup, forward, pitch alter, and basic tie continuation skipping.
- Detection and warning for written repeats.

Partially handled or deferred:
- Repeat expansion is deferred; the PoC follows printed measure order only.
- Tie durations are not merged into one extended duration; tied stop-only notes are skipped as re-strikes.
- Complex navigation such as segno/coda, endings, alternate repeat endings, tuplets, grace notes, ornaments, transposing instruments, and playback-specific MusicXML semantics are not fully modeled.
- OSMD cursor advancement is event-index based and may not perfectly align with every parsed event in complex scores.

## MIDI Handling
The app uses Web MIDI with `sysex: false`. It supports multiple listed inputs and subscribes only to the selected input. It handles standard note-on, note-off, velocity-zero note-off, and sustain pedal controller 64.

Web MIDI support is browser-dependent. Chromium-based desktop browsers are the supported target. Secure context is required; local development on `localhost` or `127.0.0.1` is acceptable.

## Learning Mode
The current mode is untimed. A chord is accepted once all expected notes are currently held; the notes do not need to arrive in the same millisecond. Extra held notes are reported as mistakes but do not block advancement. They are also rendered as red labels near the current OSMD cursor position. This is intentionally an overlay rather than direct OSMD notehead recoloring, because mutating renderer internals would be fragile. Progress advances on new note-on input or the simulation button, not merely because a previous note remains held.

## Testing Without Hardware
Use the `Simulate Current Event` button to advance through parsed score events without a MIDI keyboard. Unit tests cover MIDI decoding, held-note state, matching, event advancement, note naming, and a small MusicXML timeline fixture.

## Validation Status
Validated by automation:
- Unit tests for deterministic logic.
- Type checking.
- Linting.
- Production build.

Real-hardware validation:
- User has confirmed browser MIDI keyboard detection, real keypress display, and correct-event score/progress advancement.
- Device connection/disconnection behavior and sustain pedal behavior still need focused validation.
