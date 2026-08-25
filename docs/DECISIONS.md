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
