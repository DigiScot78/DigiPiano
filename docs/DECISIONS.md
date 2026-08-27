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
The first keyboard panel derives every key from MIDI bounds and expresses its horizontal position and width as normalized values over the white-key span. This makes the geometry independent of viewport pixels and reusable by a future falling-note view. The keyboard is visual feedback only for this milestone; pointer input, synthesis, recording, and falling notes remain separate future capabilities.
