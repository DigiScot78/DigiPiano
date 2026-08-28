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
Play mode owns its own cursor, countdown, loop waiting, and performance attempts. MIDI input during Play is recorded but never advances the normal wait-for-correct-note learning state. Stopping therefore restores the user's previous untimed position while retaining the completed performance overlay.

## 11. Separate Correct Completions From Mistake Attempts
Timed marking deduplicates valid green hits to one completion per expected event/pitch and centers them over the written note. Wrong-pitch and mistimed hits remain individual red attempts at their played pitch and score-time position instead of consuming an expected slot. This keeps successful-note feedback clean while preserving the timing and pitch pattern of mistakes; exact rendered notehead bounds remain deferred in favor of the existing event/pitch overlay geometry.

## 12. Make Go The Exact Playback Boundary
The countdown retains its final number until playback time zero. Go appears only at that boundary and shares the same monotonic timestamp used for MIDI scoring, accompanied by a brief first-event pulse. Loop-waiting prompts do not fade the score so completed results remain reviewable.

## 13. Freeze And Rebase The Clock For Note-Gated Playback
Pause-at-each-note remains part of the timed transport instead of invoking untimed learning progression. At each gated onset, musical time freezes until fresh MIDI note-ons complete the hand-filtered pitch set; the playback epoch is then rebased so later rhythm and tempo remain intact. Pre-held keys do not satisfy gates, which makes repeated notes deliberate and gives the falling-note view a stable shared transport state.

## 14. Share Piano Geometry And Musical Time With Synthesia
The initial falling-note view uses the existing normalized piano-key x coordinates and the active hand-filtered playback plan rather than maintaining a separate roll timeline. Vertical motion uses a user-selectable persisted pixel speed and the transport's precise countdown/playing/gated playhead, so resizing changes lookahead while strike timing remains exact. The initial presets are 70, 100, and 140px per second. Short written notes keep their key strike colour for at least 140ms for readability, without extending the written falling block or altering the transport. The overlay is pointer-transparent over the score; sound and held-duration validation remain later concerns.

## 15. Treat Score Audio As A Playback Consumer
Score sound uses the existing hand-filtered `PlaybackPlan` and transport clock instead of reacting to raw MIDI input or creating an independent timeline. The first engine is a dependency-free Web Audio synth for quick local playback, isolated behind an engine contract so a sampled piano can replace it later. Pause gates remain silent until correct fresh MIDI input completes the onset, after which the written chord sounds and transport resumes. Mute and volume are shared persisted output settings and do not alter musical time.

## 16. Make Pause And Seeking Transport States
Manual Pause freezes elapsed musical time, audio, Synthesia, scoring, and any active note gate without discarding the run. Resume always approaches that frozen origin through the configured countdown, and audio ignores events earlier than the origin. Timeline seeking snaps to a playable event and creates a clean paused attempt; Reset remains the explicit action that returns timed and untimed practice to the active plan start.

## 17. Treat Workspace Geometry As Persisted Responsive State
The timeline is a general navigation surface rather than a Synthesia-only control. Sidebar visibility/width and score margins are persisted workspace preferences, while narrow-window margin clamping is presentation-only and does not overwrite the chosen value. OSMD is rerendered from its existing loaded model after observed size changes, then app-owned anchors are rebuilt; this keeps future docked tools independent from score parsing and transport state.

Playback auto-hide is transient state layered over the persisted sidebar preference, so stopping restores only a panel that the run itself hid. Open and docked layouts own separate persisted score margins, with the legacy margin copied to both during loading. Sidebar height follows measured bottom-panel geometry rather than duplicating piano, timeline, or Synthesia height rules. Settings use accessible category tabs so future controls can grow without returning to one long modal column.
