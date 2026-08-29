# Decision Record

## 1. Use Vite, React, and TypeScript
Chosen for the first PoC because the milestone is entirely client-side and needs fast local development, browser APIs, and lightweight testing. A full-stack framework would add routing/server/deployment conventions that are not needed yet.

## 2. Use OpenSheetMusicDisplay For Notation
OpenSheetMusicDisplay is used for conventional browser sheet-music rendering so the project does not build a custom engraving engine. Its BSD-3-Clause license is compatible with this PoC. The trade-off is a relatively large client bundle and some cursor/model alignment limits for complex scores.

## 3. Parse MusicXML Into A Separate ScoreEvent Model
The expected-note model is parsed independently from OSMD renderer internals. This keeps comparison logic testable and makes future MIDI/performance logic less coupled to a rendering library. The trade-off is that advanced MusicXML playback semantics must be implemented deliberately instead of assumed.

## 4. Use fflate For MXL Decompression
Compressed `.mxl` files are ZIP archives. `fflate` is small, browser-compatible, MIT licensed, and sufficient for local decompression without a backend.

## 5. Defer Repeat Expansion
The first implementation follows printed measure order and reports repeat markings as warnings. This is honest and keeps the first milestone focused on proving score loading, rendering, MIDI input, event normalization, and advancement. Future work should either expand repeats explicitly or use a proven iterator that models performed order.

## 6. Keep Sample Music Local-Only For Now
`Samples/` is ignored by Git. The provided `.mxl` and `.mid` files are useful for local testing, but committing third-party music files should be an explicit licensing decision.

## 7. Trust MusicXML Staff Assignments For Hand Mode
Hand mode uses explicit MusicXML staff numbers: staff 1 is treated as right hand and staff 2 as left hand. The app does not infer hand ownership from pitch because that would guess incorrectly for cross-staff notation, overlapping hands, and unusual arrangements. Import diagnostics are used to identify source files whose exported staff assignments do not match the expected visual/musical layout.

## 8. Keep Piano Geometry Normalized And Read-Only
The first keyboard panel derives every key from MIDI bounds and expresses its horizontal position and width as normalized values over the white-key span. This makes the geometry independent of viewport pixels and reusable by the later falling-note view. The keyboard itself remains visual feedback only; pointer input, sound synthesis, and recording are separate future capabilities.

## 9. Use A Monotonic Tempo-Aware Playback Clock
Soundless playback converts MusicXML quarter positions through an explicit tempo map and derives state from `performance.now()` rather than chained timeouts. MIDI note arrival is timestamped at the input handler so React rendering latency does not affect onset scoring. This provides a deterministic base for later audio and piano-roll work without coupling musical time to UI frames.

## 10. Keep Timed Playback Separate From Untimed Learning
Play mode owns its own cursor, countdown, loop waiting, and performance attempts. MIDI input during Play is recorded but never advances the normal wait-for-correct-note learning state. Natural completion returns to the previous untimed position; explicit Stop ends the attempt and aligns that position with the active plan start while preserving recorded results, as refined in Decision 21.

## 11. Separate Correct Completions From Mistake Attempts
Timed marking deduplicates valid green hits to one completion per expected event/pitch and centers them over the written note. Wrong-pitch and mistimed hits remain individual red attempts at their played pitch and score-time position instead of consuming an expected slot. This keeps successful-note feedback clean while preserving the timing and pitch pattern of mistakes; exact rendered notehead bounds remain deferred in favor of the existing event/pitch overlay geometry.

## 12. Make Go The Exact Playback Boundary
The countdown retains its final number until playback time zero. Go appears only at that boundary and shares the same monotonic timestamp used for MIDI scoring, accompanied by a brief first-event pulse. Loop-waiting prompts do not fade the score so completed results remain reviewable.

## 13. Freeze And Rebase The Clock For Note-Gated Playback
Pause-at-each-note remains part of the timed transport instead of invoking untimed learning progression. At each gated onset, musical time freezes until fresh MIDI note-ons complete the hand-filtered pitch set while every required pitch remains concurrently held; released pitches are removed rather than accumulated across separate taps. The playback epoch is then rebased so later rhythm and tempo remain intact. Pre-held keys do not satisfy gates. Immediate gate feedback remains held-state-driven, while every fresh gated note-on also enters timed performance scoring at the frozen onset so wrong pitches are retained in red and accepted pitches receive deduplicated green completions. These recorded markers use the same deferred/live visibility preference as ordinary Play.

## 14. Share Piano Geometry And Musical Time With Synthesia
The initial falling-note view uses the existing normalized piano-key x coordinates and the active hand-filtered playback plan rather than maintaining a separate roll timeline. Vertical motion uses a user-selectable persisted pixel speed and the transport's precise countdown/playing/gated playhead, so resizing changes lookahead while strike timing remains exact. The initial presets are 70, 100, and 140px per second. Short written notes keep their key strike colour for at least 140ms for readability, without extending the written falling block or altering the transport. The overlay is pointer-transparent over the score; sound and held-duration validation remain later concerns.

## 15. Treat Score Audio As A Playback Consumer
Score sound uses the existing hand-filtered `PlaybackPlan` and transport clock instead of reacting to raw MIDI input or creating an independent timeline. The first engine is a dependency-free Web Audio synth for quick local playback, isolated behind an engine contract so a sampled piano can replace it later. The transport—not elapsed-time inference in the audio consumer—owns the next unopened pause gate. That exact onset caps audio lookahead until correct fresh MIDI input completes it, after which the written chord sounds and transport resumes. Mute and volume are shared persisted output settings and do not alter musical time.

## 16. Make Pause And Seeking Transport States
Manual Pause freezes elapsed musical time, audio, Synthesia, scoring, and any active note gate without discarding the run. Resume always approaches that frozen origin through the configured countdown, and audio ignores events earlier than the origin. Timeline seeking snaps to a playable event and creates a clean paused attempt; Reset remains the explicit action that returns timed and untimed practice to the active plan start.

## 17. Treat Workspace Geometry As Persisted Responsive State
The timeline is a general navigation surface rather than a Synthesia-only control. Sidebar visibility/width and score margins are persisted workspace preferences, while narrow-window margin clamping is presentation-only and does not overwrite the chosen value. OSMD is rerendered from its existing loaded model after observed size changes, then app-owned anchors are rebuilt; this keeps future docked tools independent from score parsing and transport state.

Playback panel hiding is transient state layered over the persisted sidebar preference and applies to every fresh run, so stopping restores only a panel that the run itself hid and manual restoration is respected for the remainder of the run. Optional Play fullscreen is a separate persisted preference. It uses the browser Fullscreen API, tracks app ownership so pre-existing/user-controlled fullscreen is not exited, and never blocks playback when denied. Open and docked layouts own separate persisted score margins, with the legacy margin copied to both during loading. The workspace reserves score width and remains an opaque layer above bottom surfaces in its own column. A fixed workspace header and persisted accessible Practice/Debug tabs give the active workspace one scrolling body and leave room for future chapters, score browsing, and progress views. Settings likewise use accessible category tabs so future controls can grow without returning to one long modal column.

The application header and right workspace are viewport-fixed independently of the scrolling score. The workspace is bounded below the header and its active tab body is the sole panel scroll owner. Settings lives in the application header so it remains available when playback hides the workspace. Imported score identity prefers explicit MusicXML metadata, permits narrowly filtered centred-credit inference for exporters that omit semantic credit types, and uses the filename only as a final title fallback.

The bottom surface is a permanent application toolbar rather than a collapsible piano shell. Piano visibility is independent from toolbar and Synthesia visibility, transport remains centred between view controls and score audio, and presentation options use attached popovers to leave room for future controls. Synthesia uses either the visible keyboard or toolbar as its strike edge and may not resize above the fixed application header. Score system following derives its clearance from that header and the notation toolbar rather than an unrelated fixed margin.

## 18. Place Feedback From The Written Clef, Not The Staff Number
Staff number describes ownership and hand filtering, not pitch geometry: either piano staff may use treble, bass, C, or octave-shifted clefs and may change clef during the score. The normalized note detail therefore carries the active MusicXML clef, and feedback maps written pitch from that clef's reference line onto OSMD's measured staff lines. The former staff-1/treble and staff-2/bass rule is retained only for metadata compatibility fallback.

## 19. Treat MIDI Messages As An Event Stream, Not Render State
Held-note state may safely collapse to its latest value, but scoring and note gates must observe every note-on and note-off. The Web MIDI boundary therefore retains a short sequence-numbered event buffer with per-message held snapshots, and the app drains all unseen records in order. This keeps large chords deterministic when React batches several hardware callbacks into one render while retaining `lastMessage` only for diagnostics.

## 20. Preserve Arpeggios As Ordered Gestures
An arpeggio shares a written onset but is neither a simultaneous chord nor several independently timed score events. Per-note MusicXML arpeggiate metadata remains on the normalized event; practice and gates recognize its pitch-ordered note-on sequence with a 750ms inter-note allowance, while audio applies a 70ms presentation spread. This preserves score navigation and tempo timing while matching the intended physical gesture. Sidebar diagnostics follow the displayed event so timeline and score seeking reveal the active expectation immediately.

## 21. Separate Stop, Reset, And Hand-Colour Ownership
Pause owns exact-position continuation. Stop cancels scheduled audio, exits playback presentation, clears partial gate progress, returns to the active plan start, and preserves recorded results for review; the next Play begins a fresh attempt. Reset returns to the same start and clears results immediately. Timed piano expectations derive RH/LH ownership from playback-plan staff details and use their own persisted colour pair; Synthesia retains a separate configurable pair. Correct held notes are duration-aware and become neutral-carried after their written end rather than being reclassified as wrong.

## 22. Make Piano Expectations Event-Backed And Musically Timed
Keyboard expectations carry their exact source event/gate, staff-derived hand, and preview/active strength. This prevents repeated or sustained pitches elsewhere in the plan from producing partial chord fills and gives untimed practice the same full RH/LH presentation as Play. Pause-at-each-note reveals the complete next gate one quarter-note beat early using the local tempo map, dimming that preview until the gate becomes active; transport, cursor, audio, and Synthesia timing remain unchanged.

## 23. Model Untimed Scored Practice As A Playback Mode
The Play control owns three persisted, mutually exclusive modes: tempo Play, Pause at each note, and untimed scored Practice. Practice reuses the playback plan, note gates, result model, and presentation lifecycle, but advances directly between satisfied gates instead of running the tempo clock. This keeps scoring, chords, arpeggios, ranges, hand filters, loops, and Stop/Reset consistent while leaving the older unscored idle-learning path independent. Both transport toolbars open the same radio-card mode selector from an attached chevron control. A different mode can be selected at any transport phase and applies Reset before changing it, avoiding a separate close/Stop/reopen workflow. The selector footer owns live progress visibility because that preference directly affects all three modes while leaving result recording unchanged.

## 24. Score Only Explicitly Completed Play Runs
The first percentage uses a balanced note score: `2 × hits / (2 × hits + misses + bad attempts)`. A correct pitch outside tolerance remains a bad attempt and its slot remains missed unless later completed correctly. The transport emits a dedicated immutable natural-completion snapshot so Stop, Pause, Reset, Clear, seeking, and ordinary idle learning cannot accidentally create scores; each completed loop pass is a run. Bests and aggregates are session-only and keyed by score content, range, hands, and mode. Scoring and aggregation remain pure and storage-independent so later user persistence does not require changing the scoring contract.
