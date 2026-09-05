# Practice Readiness Plan

## Goal

Give learners confidence that the browser and physical instrument agree before a lesson starts. Keep the experience concise, optional, local, and reusable from Learning Home.

## Milestone 1: Keyboard Check

- [x] Add a skippable Keyboard check entry to Learning Home.
- [x] Reuse the existing Web MIDI connection and selected input.
- [x] Show the last detected note using the app's octave convention.
- [x] Track the lowest and highest notes observed during the current check.
- [x] Show currently held notes and a resettable test-press count.
- [x] Explain how to resolve octave/transpose disagreement without claiming automatic calibration.

## Next Slices

- [x] Add a guided three-point low/middle/high range confirmation rather than relying only on free exploration. Ignore MIDI events that occurred before the check opened, validate physical middle C as C4, and report an out-of-order range clearly.
- [x] Detect sustain-pedal input and explain its current state when hardware provides it. Confirm both pedal-down and pedal-up messages, keep the check optional, and state clearly that sustain is evidence rather than part of current performance scoring.
- Add latency calibration only if real-device evidence shows a consistent need.
- [x] Offer a short, skippable experience/goals chooser that recommends an initial Learning route without requiring an account. Recommendations launch only existing Keyboard Check, Guided Piece Practice, Reference, or Sight Reading activities and do not persist a profile or lock navigation.

## Boundaries

- Do not persist calibration claims until their semantics are reliable.
- Do not block direct practice or require onboarding completion.
- Do not infer posture, acoustic tone, or physical technique from MIDI note messages.
