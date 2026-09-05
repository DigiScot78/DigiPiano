# Piano Shortcuts Plan

## Implementation Status

The settings, persisted bindings, pure resolver, contextual Guided Practice and Sight Reading actions, consumed-note filtering, hints, conflict checks, and automated coverage are implemented. In Sight Reading, Primary starts the prepared attempt or generates the next excerpt, Previous returns to Learning outside an active attempt, and Stop stops the transport; unsupported commands remain inert. Initial physical-keyboard use was positive; the modifier default moved from A0 to A1 so the default command layout is reachable with the left hand. Shortcuts remain disabled until explicitly enabled and will receive further validation alongside Tempo progression.

## Product Goal

Let learners control Guided Practice from their MIDI instrument without removing their hands from the piano, while keeping ordinary playing reliable and the interface uncluttered.

## Recommended Interaction

Use a configurable piano-key modifier plus action keys. A command fires only when the modifier was already held and a mapped action key receives a fresh note-on. Raw single-note shortcuts are not safe during musical practice because the same pitch may be part of the lesson.

The first semantic commands should be:

- **Primary** — performs the prominent action currently shown: Listen/Stop listening, Done listening/Continue, Start step, Repeat now, or Next lesson.
- **Previous** — returns to the preceding available step.
- **Repeat** — restarts the current listen/practice step.
- **Toggle loop** — changes the existing shared lesson/transport loop state.
- **Stop** — stops audition or playback without leaving Guided Practice.

Leave Guided Practice should not receive a default piano binding because an accidental exit is disproportionately disruptive.

## Settings UX

Add **Controls** to app Settings, with a **Piano shortcuts** section:

1. Enable piano shortcuts.
2. Choose **Set modifier**, then press the desired piano key.
3. Choose an action's **Set key**, then press its action key.
4. Show musical note names and MIDI numbers, conflict messages, Restore defaults, and a small live “Shortcut recognised” confirmation.

The capture flow must pause command recognition and must not feed captured notes into practice. Defaults should prefer very low notes but should not be silently activated until the learner enables the feature, because keyboard ranges vary.

The guide should keep its existing buttons. At most, show one subdued contextual hint such as “Piano shortcut: hold A0 + C2” near the primary action, with an option to hide hints.

## Input And Safety Rules

- Modifier must be down before the action note-on; simultaneous lesson chords must not accidentally qualify.
- Fire once per action-key press and require release before retriggering.
- Modifier and action notes are consumed while a shortcut is recognised and never reach assessment, feedback, score audio, simulated held notes, or carry-over logic.
- Bindings must be unique and the modifier cannot be used as an action.
- Only commands valid for the current state execute; unsupported commands are quietly ignored.
- Disable command execution during binding capture, blocking dialogs, and editable-control focus.
- Keep mouse, computer-keyboard, touch, and accessible button operation fully available.

## Technical Shape

Create a pure command resolver independent of React and Guided Practice. It should accept MIDI note transitions, configured bindings, and an explicit command context, then return consumed note numbers plus at most one semantic command. Route MIDI through it before `advanceWithNotes` and playback gate handling. Keep persistence versioned beside the other local settings hooks.

Do not encode lesson-specific callbacks in the resolver. `App.tsx` should map semantic commands to the current guided-session action. This makes the same layer reusable for ordinary playback, score navigation, metronome control, and future MIDI CC/foot-pedal input.

## Validation

- Pure tests for ordering, fresh presses, releases, conflicts, context gating, and consumed notes.
- Integration coverage proving command notes cannot satisfy or spoil an expected chord.
- Browser checks for capture UX, settings persistence, contextual hints, and toolbar synchronization.
- Real-keyboard testing across full-size and shorter-range instruments before choosing any suggested defaults.
