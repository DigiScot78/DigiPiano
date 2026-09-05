# Sight-Reading Implementation Plan

## Goal

Build fluent forward reading with fresh, levelled excerpts and one uninterrupted assessed attempt. Keep generation deterministic and local, with feedback withheld until the end so the activity rewards reading rather than correction-following.

## Milestone 1: First End-To-End Exercise

- [x] Add Sight reading to Learning Home with Beginner, Developing, and Intermediate setup choices.
- [x] Generate a fresh four-measure MusicXML excerpt locally with deterministic seeded output.
- [x] Show a preparation card before playback.
- [x] Run one continuous Play attempt and suppress score/piano correctness feedback during it.
- [x] Show the final percentage only after natural completion and offer a new excerpt.
- [x] Add adjustable 4/8/12-measure length and 60/80/100/120 BPM written tempo.
- [x] Add RH, LH, and both-hand exercise families.
- [x] Add mixed quarter/eighth-note vocabularies above Beginner.
- [ ] Validate all three levels with physical MIDI and refine pitch/rhythm difficulty.

## Next Slices

- [x] Add a brief optional preparation timer (unlimited, 15, 30, or 60 seconds) that starts the clean bar-one attempt when it expires.
- [x] Separate sight-reading continuity feedback from ordinary piece-mastery scoring with a reading score that reports note accuracy and attempted reading moments independently.
- [x] Prevent replay of a completed excerpt except through an explicit Review excerpt action; review runs from bar one without replacing the first-look result.

## Adjacent Learning Strand

Sight reading is intentionally a challenge that applies existing notation knowledge. Add a separate beginner Foundations path later for teaching staff orientation, note names, rhythm values, key signatures, and keyboard mapping before expecting a one-look performance.
