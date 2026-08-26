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
9. The score renderer overlays transparent event hit zones above OSMD cursor positions so visual selection resolves to stable `ScoreEvent` ranges.

## ScoreEvent Model
`ScoreEvent` represents a playable event at a score position:

```ts
interface ScoreEventNote {
  midiNote: number;
  staffNumber: number;
  voiceNumber: string;
  sourceNoteId: string;
}

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
  noteDetails: ScoreEventNote[];
  isRest?: boolean;
}
```

The parser groups notes that begin at the same quarter position in the same part and measure, including chord members, multiple voices, and treble/bass staff notes. Each event keeps per-note staff and voice metadata so hand filtering can operate without reparsing. Rests are parsed for timeline movement but excluded from the playable event sequence.

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

## Renderer Overlay Model
The renderer keeps OSMD as the notation engine and draws app-owned overlays above the rendered SVG. Selection hit targets are transparent. During drag, the selected range is shown as one solid rectangular hull. After release, the same hull becomes an inverted mask: content outside the selected range is dimmed while the selected area remains clear. Committed selections expose left and right resize handles that snap to parsed score events.

Wrong notes are shown as app-owned red ghost noteheads at the current event's horizontal score position. Vertical placement is approximate: it uses the current event staff context and MIDI pitch to choose a treble or bass staff region. This avoids mutating OSMD/VexFlow internals, but it is not yet exact notehead-level engraving.

## MIDI Handling
The app uses Web MIDI with `sysex: false`. It supports multiple listed inputs and subscribes only to the selected input. It handles standard note-on, note-off, velocity-zero note-off, and sustain pedal controller 64.

Web MIDI support is browser-dependent. Chromium-based desktop browsers are the supported target. Secure context is required; local development on `localhost` or `127.0.0.1` is acceptable.

## Learning Mode
The current mode is untimed. A chord is accepted once all expected notes are currently held; the notes do not need to arrive in the same millisecond. Extra held notes are reported as mistakes but do not block advancement. Progress advances on new note-on input or the simulation button, not merely because a previous note remains held. Selected ranges can run once or loop back to the selected start, and hand mode filters expected notes by staff: right hand uses staff 1, left hand uses staff 2.

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
- Selection resizing, inverted dimming, ghost-note placement, device connection/disconnection behavior, and sustain pedal behavior still need focused validation with the real sample score and keyboard.
