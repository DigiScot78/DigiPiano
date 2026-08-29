# Architecture

## Scope
The current application is a browser-only TypeScript/React proof of concept. It intentionally avoids a backend, database, accounts, analytics, telemetry, microphone input, MIDI monitoring, and mobile support. Score playback includes a lightweight Web Audio synthesizer behind a replaceable engine boundary.

## Runtime Path
1. The user selects a local `.mxl`, `.musicxml`, or `.xml` score file.
2. `src/music/musicXmlLoader.ts` reads the file in the browser. `.mxl` files are decompressed locally with `fflate`; no score data is uploaded. Header metadata prefers MusicXML work, movement, and typed credits, can infer centred first-page title/subtitle credits used by common exporters, and falls back to the clean filename.
3. `src/components/ScoreRenderer.tsx` renders the MusicXML string with OpenSheetMusicDisplay, asks OSMD to honor MusicXML system/page breaks when present, maps parsed `ScoreEvent` objects back to OSMD graphical measure/timestamp positions where available, and draws app-owned overlays for the visible score position and interaction.
4. `src/music/musicXmlParser.ts` parses the MusicXML into ordered playable `ScoreEvent` objects.
5. `src/hooks/useMidiInput.ts` requests Web MIDI access, lists inputs, subscribes to the selected input, and passes messages through the decoder.
6. `src/midi/messages.ts` decodes note-on, note-off, velocity-zero note-off, control change, and sustain pedal state.
7. `src/midi/heldNotes.ts` tracks currently held physical keys.
8. `src/learning/matcher.ts` compares held notes against the current score event and advances when all expected notes are present.
9. The score renderer treats the full rendered score as a pointer surface; selection and resize gestures preview from raw pointer positions and resolve to stable `ScoreEvent` ranges only on release.
10. `src/audio/` converts the active `PlaybackPlan` into deduplicated score notes and schedules a piano-like Web Audio voice with a short lookahead. The scheduler follows the transport clock, stops at note gates, and shares persisted mute/volume state across both transport surfaces.

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

The parser groups notes that begin at the same quarter position in the same part and measure, including chord members, multiple voices, and multi-staff notes. Each event keeps absolute quarter time plus the measure-start quarter so the renderer can resolve the event back to an in-measure timestamp. Each event also keeps per-note staff, voice, MusicXML pitch spelling, and active staff clef metadata so hand filtering and notation-aware overlay placement can operate without reparsing. Clefs are tracked independently by staff in document order, including changes within a measure. Rests are parsed for timeline movement but excluded from the playable event sequence. If a rest and pitched note share the same event timestamp across voices, the pitched event remains playable.

## MusicXML Handling
Currently handled:
- `.mxl` decompression using `META-INF/container.xml` when present.
- Uncompressed `.musicxml` and `.xml` input.
- Measures, divisions, durations, voices, staves, rests, chords, arpeggiate direction/group metadata, backup, forward, key fifths, pitch spelling/alter, G/F/C clefs with line and octave changes, MusicXML print/system-break diagnostics, and basic tie continuation skipping.
- Detection and warning for written repeats.

Partially handled or deferred:
- Repeat expansion is deferred; the PoC follows printed measure order only.
- Tie durations are not merged into one extended duration; tied stop-only notes are skipped as re-strikes.
- Complex navigation such as segno/coda, endings, alternate repeat endings, tuplets, grace notes, ornaments, transposing instruments, and playback-specific MusicXML semantics are not fully modeled.
- Renderer overlays prefer OSMD graphical measure/timestamp lookup, with cursor sampling only as a fallback when graphical data is unavailable. Complex scores may still expose alignment gaps that need manual validation.

## Renderer Overlay Model
The renderer keeps OSMD as the notation engine and draws app-owned overlays above the rendered SVG. It first tries to map every parsed `ScoreEvent` to the matching OSMD graphical measure/staff entry by measure number, staff, and in-measure timestamp. When that succeeds, the native OSMD cursor is hidden and the app-owned current-event marker is used instead; this keeps one-hand practice aligned when the learning state skips events from the inactive hand. Cursor sampling remains as a fallback for tests or renderer states where graphical lookup is unavailable.

The full score surface accepts pointer selection and event seeking. Pointer movement must cross a small threshold before a freeform selection begins; a true click instead snaps the learning or timed transport cursor to the nearest active-hand playable event. An existing range limits click navigation without being cleared. During drag and handle resizing, a freeform pointer outline follows the pointer smoothly while a separate event-backed draft controls the clear and faded score regions. An event enters the draft when the moving boundary crosses its true horizontal anchor, independent of the visual cursor width. Clear-range edges sit midway between selected edge events and their nearest unselected neighbours, preventing generous overlay padding from exposing notes outside the range. Cross-system selections preserve event-backed start and end points, and selected row segments expand vertically to the midpoint between neighboring systems so adjacent selected systems visually meet.

In one-hand modes, the renderer uses per-system treble/bass staff geometry to apply a lighter white wash to the inactive half of each system. With no range, this covers the full rendered score; with a committed or live event-backed preview range, inactive-hand fade rectangles are clipped to the clear range so they do not stack with outside-range fading. Selection borders, handles, current-position markers, and note feedback render above these overlays.

Score-owned practice controls share the renderer's event and staff geometry. RH/LH toggle buttons anchor immediately left of the first active range event, aligned to their respective staff centres, and the final enabled hand cannot be turned off. An extensible floating toolbar anchors above the active selection or the first score system and currently contains the once/loop toggle.

Correct and wrong held notes are shown as app-owned green/red marker heads near the current event's mapped graphical score position. Note-name labels can be toggled independently for correct and wrong feedback. Vertical placement reads the rendered staff lines from the event's OSMD graphical measures and uses the active MusicXML clef's sign, line, and octave change as the pitch reference for diatonic half-space mapping. Placement therefore follows written notation rather than assuming staff 1 is treble and staff 2 is bass. Correct notes use their MusicXML staff, while wrong notes use the staff and clef of the nearest active expected pitch. The former treble/bass calibration remains only as a compatibility fallback when clef metadata is absent, and fixed geometry remains when staff lines are unavailable. For black-key MIDI notes, exact MusicXML spelling is preferred when present; otherwise the key signature selects sharp or flat spelling.

On successful advancement, the app snapshots the completed event, its index, and its correct feedback markers. The renderer keeps that snapshot anchored to the completed score position for 450ms and fades it during the final portion of that interval. A newer completion replaces the previous snapshot. Wrong markers remain tied only to currently held notes, and practice-context resets clear transient feedback.

## MIDI Handling
The app uses Web MIDI with `sysex: false`. MIDI configuration lives in a modal opened from the page settings button. It supports multiple listed inputs, persists the selected input ID locally, and subscribes only to that input. On startup it checks the browser's MIDI permission and reconnects automatically only when access is already granted, avoiding unsolicited permission prompts. It handles standard note-on, note-off, velocity-zero note-off, and sustain pedal controller 64. The raw callback captures every decoded message into a bounded ordered buffer with its monotonic timestamp and held-note snapshots before and after application. App orchestration drains every unseen event by sequence ID rather than observing only a render's final `lastMessage`, so automatic React batching cannot collapse a fast chord into one processed note.

The score is the dominant page surface beneath a fixed application header that displays app identity, imported score identity, and globally available compact Open Score and Settings controls. A right workspace reserves its persisted width in the score grid while its opaque viewport-fixed surface is bounded below that header and above the screen margin, layering above the bottom instruments only within that column. Its persisted Practice/Debug tabs leave one scroll owner in the active tab body, avoiding document-scroll coupling, height coupling, and nested scrolling when Synthesia expands. The same tab shell can later host chapters, score browsing, and progress without changing workspace geometry.

Workspace layout preferences persist the right-docked sidebar's open state and 240–640px width plus separate symmetric 8–300px paper margins for open and docked layouts. Legacy single-margin storage migrates into both values. A playback-only hidden flag leaves the saved open preference untouched: every fresh run hides an open panel until the transport returns to idle, while manual restoration cancels that run's transient hide. The persisted Play-fullscreen preference is independent of panel hiding. A fresh run requests the browser Fullscreen API directly from its activating Play click or Space key, tracks whether the app owns that fullscreen session, and exits it on return to idle; pre-existing fullscreen and user Escape remain browser-owned. Rejected requests do not block audio or transport. The fixed workspace shell is bounded by the application header and viewport bottom margin, and its content owns an internal scroll region. The active margin narrows the centred score frame rather than padding notation, exposing the app background and causing OSMD to reflow systems. A `ResizeObserver` watches OSMD's actual target width, while window resize coverage handles viewport, fullscreen, zoom/display, and device-pixel changes; resize work is throttled, rerenders the existing OSMD instance, and rebuilds graphical anchors without reparsing or reloading the score.

A permanent full-width practice toolbar is fixed to the bottom of the viewport, while height-aware page clearance follows the independently visible piano and timeline. The toolbar uses left view controls, centred transport controls, and right score-audio controls; Piano and Synthesia presentation settings live in attached popovers. `src/piano/piano.ts` owns persisted preference validation, including migration from the former expanded panel flag to piano visibility, standard/custom MIDI bounds, normalized white-key geometry, and separate Play/Synthesia RH/LH colour pairs. `PianoPanel` receives event-backed expectations containing pitch, hand, and preview/active strength instead of inferring ownership by searching matching pitches. Untimed and timed requests therefore fully fill the exact complete event or coincident gate, independent of Synthesia visibility. Correct held notes remain green only through their written duration; an accepted note still held afterward resolves to the neutral carried state before wrong-note checks. Clicking a visible key auditions it through a panel-owned synth engine that is isolated from scheduled score audio, so pointer notes can sound at any transport phase without cancelling or rescheduling the score. It follows the shared mute/volume state; raw MIDI remains silent. Geometry is expressed from 0 to 1 across the white-key span; pixel sizing and Auto/Fit/Scroll overflow policy remain presentation concerns.

The optional Synthesia layer reuses normalized key geometry for subtle lanes and staff-coloured note blocks derived from the active `PlaybackPlan`. It is independent of piano visibility: with keys shown it mirrors their content width, scroll offset, and strike line; with keys hidden it uses the permanent toolbar as its strike edge and the available toolbar width. Its drag height is capped against the measured fixed-header bottom plus a 6px gap. The persisted presentation can be transparent or opaque, can label blocks, and retains 70/100/140px-per-second presets in an attached options popover. Very short notes retain strike-key colour for a 140ms readable minimum without extending their written blocks. A full-width timeline below the permanent toolbar maps the same plan to a normalized playhead and event marks, snapping seek requests to playable event onsets.

Timed Play mode is isolated in `src/playback/`. The MusicXML parser emits quarter-positioned tempo changes from sound/metronome directions; pure timing utilities integrate milliseconds across those changes and build a hand-filtered plan for the full score or selected event range. A monotonic-clock transport owns countdown, playing, note-waiting, loop-waiting, and idle phases. It derives cursor position from elapsed time rather than accumulating timer intervals, so delayed frames catch up instead of drifting. Normal untimed learning state is not mutated during playback.

Manual pause adds a frozen transport phase without ending the run. Stop uses a separate frozen phase: it preserves the exact elapsed position and performance results, terminates audio/fullscreen presentation, and starts again through a fresh countdown; stopped gates discard partial satisfaction before resuming. Fresh Play, resume, and timed seeking establish an elapsed-time origin at the displayed position and audio scheduling rejects notes before that origin. A manually paused note gate retains its satisfied-note state but ignores MIDI until the resume countdown completes. Reset remains the explicit destructive transport action: it stops sound, clears results, and returns timed and untimed state to the first playable event in the active plan. The renderer groups event positions into notation systems and scrolls only when the displayed event enters a different system, using scroll margin to retain the floating toolbar and additional breathing room above the notation.

Score audio consumes that plan rather than maintaining a second musical timeline. A small lookahead schedules Web Audio oscillator voices near each written onset, including during the final part of countdown, while a run identifier prevents events from leaking across stops or loop restarts. The transport exposes its exact next unopened Pause-at-each-note gate, and that onset caps audio scheduling even if an animation frame arrives fractionally late; the gated chord becomes eligible only after correct fresh MIDI input completes the gate. Audio follows the selected hand filter, but MIDI input itself does not trigger app sound. A shared master gain implements persisted mute and volume without stopping transport time. The initial engine uses synthesized harmonic voices and can later be replaced by a licensed sample-backed piano without changing playback planning or transport controls.

Pause-at-each-note mode groups hand-filtered events with the same onset into a gate of unique MIDI pitches. The transport detects crossed onsets even after a delayed animation frame, freezes musical elapsed time at the earliest gate, and requires fresh note-ons rather than accepting keys that were already held. Gate progress is intersected with the live held-note set, so releasing any partial chord member removes it and every required pitch must be down concurrently before playback rebases around the frozen onset. Pauses therefore extend wall-clock duration without compressing later timing. Between gates, the piano stays clear until one quarter-note beat before the next unopened gate, then previews that complete gate at reduced strength using the local tempo map; arrival promotes the same complete set to full strength. The option can be changed live: enabling applies to the next future onset, while disabling an active gate resumes immediately. Gated input bypasses recorded performance results and missed-note generation; the renderer instead derives temporary green/red feedback directly from currently held notes and clears it on release.

Arpeggiated notes are the exception to chord concurrency. Marked notes form an ascending sequence by default or descending when requested by MusicXML. Untimed learning and note gates advance that sequence from fresh ordered note-ons, retain progress across releases, and reset it after a 750ms inter-note gap or an out-of-order marked pitch. Any unmarked notes at the same onset retain normal chord-held behavior. The audio plan offsets arpeggiated pitches by 70ms in written order without changing the score event or transport timeline. The waiting overlay exposes only the next rolled pitch, while the sidebar follows the displayed playback/seek event and labels its expected direction.

The countdown never presents Go early. At the exact monotonic playback-start boundary, the transport exposes a 300ms onset cue that flashes a compact Go message, pulses the first score marker, and coincides with expected piano activation and scoring time zero. Loop waiting retains a small restart prompt without applying the countdown's score fade, keeping the completed performance readable.

MIDI messages capture `performance.now()` inside the raw Web MIDI handler. During timed playback, the temporally nearest event region determines what was expected. Each expected event/pitch retains at most one valid in-tolerance green completion centered on its written note. Wrong-pitch and mistimed note-ons remain separate red attempts rendered at the played pitch and an x-position interpolated from their score time when surrounding anchors share a system. Repeated valid hits for an already completed expected slot are ignored, while mistakes remain available for rhythm diagnostics. Natural completion turns every expected slot without a green completion into a compact X marker. Results default to hidden during active playback, can be enabled live through persisted Play settings, and remain visible after Stop/completion until cleared or a new run begins.

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
