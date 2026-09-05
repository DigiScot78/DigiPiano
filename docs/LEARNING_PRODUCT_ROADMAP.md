# Learning Product Roadmap

## Purpose

This document records the recommended path from the current interactive piano-practice core to a rounded learning product. It focuses on the learning experience that should exist before account, cloud-library, and saved-progress work begins.

The proposed information architecture, user journeys, guided-session UX, and shared model are expanded in [`LEARNING_EXPERIENCE_BLUEPRINT.md`](LEARNING_EXPERIENCE_BLUEPRINT.md).

The application already provides a strong practice engine:

- MusicXML/MXL import and conventional notation.
- Web MIDI note recognition and immediate score feedback.
- Full-score and selected-range practice.
- RH, LH, and both-hand filtering.
- Timed Play, Pause at each note, and untimed Practice.
- Looping, tempo control, count-in, metronome, score audio, and Synthesia.
- Performance scoring, timing feedback, and session history.
- Interactive chord and scale references with generated practice scores.

The largest remaining opportunity is not another playback control. It is joining these tools into a teaching loop that tells the learner what to do next.

## Product Principles

- Teach rather than merely score. Every result should lead to an understandable next action.
- Keep imported scores first-class. Guided learning should work with a user's own MusicXML, not only curated content.
- Support several learning styles: notation, guided repetition, visual falling notes, listening, theory, and technical drills.
- Help learners become independent of the application rather than rewarding only app-following behaviour.
- Keep the real-time MIDI, rendering, feedback, and audio path local in the browser.
- Treat posture, tension, movement, and acoustic tone as limitations of MIDI assessment; provide guidance without claiming to measure what the application cannot observe.
- Add persistence after the learning loop produces information worth saving.

## Priority 1: Guided Piece Practice

Create an optional guided workflow that coordinates the tools already present:

1. Listen to the selected passage.
2. Practise RH slowly.
3. Practise LH slowly.
4. Combine both hands in Pause at each note.
5. Play at a reduced tempo.
6. Increase toward the written tempo.
7. Complete an uninterrupted final performance.

The workflow should work with a full imported score, a user-selected range, or a generated Learning exercise. It should remain optional so experienced users can continue using the existing direct controls.

### Automatic tempo progression

- Let the learner choose a starting tempo percentage and target tempo.
- Define a mastery threshold, initially around 90%.
- Raise tempo by a small step after a successful attempt.
- Hold or reduce tempo after repeated difficulty.
- Make the current step, reason for the next step, and target visible.
- Keep the first version session-only; persistence can follow accounts.

## Priority 2: Diagnosis And Targeted Practice

Turn completed attempts into practical recommendations rather than only a percentage.

Useful analysis includes:

- Weakest measures or selected passages.
- Repeatedly missed pitches.
- Notes consistently played early or late.
- Locations where Pause/Practice waits were longest.
- RH versus LH performance.
- Concentrations of wrong notes or unresolved misses.
- Improvement or regression across attempts in the current session.

The primary action should be **Practise this section**. It should select the diagnosed passage and prepare an appropriate hand, tempo, and practice mode. A useful recommendation is concrete—for example: "Measures 12–14 caused most errors; practise RH at 70%."

Avoid overstating confidence. Recommendations should explain which recorded evidence produced them, and sparse attempts should be labelled accordingly.

## Priority 3: Sight-Reading Mode

Add a learning mode whose purpose is reading unfamiliar music rather than mastering a known piece.

Initial behaviour:

- Present a short, levelled excerpt the learner has not just practised.
- Allow a brief preparation period.
- Permit one uninterrupted attempt.
- Hide live correctness feedback during the attempt.
- Score pitch accuracy, timing, and continuity afterward.
- Move to a different excerpt instead of encouraging memorisation.
- Offer manually selected difficulty levels before adaptive progression exists.

The first content can be deterministically generated from constrained pitch ranges, rhythms, metres, key signatures, hands, and chord density. Account-backed history can later estimate a sight-reading level and select suitable excerpts automatically.

## Priority 4: Onboarding And Practice Readiness

Before a learner begins, provide a short preflight experience:

- Confirm MIDI access and selected device.
- Verify the expected keyboard range.
- Let the learner press test notes and confirm octave mapping.
- Explain sustain-pedal detection when available.
- Offer a basic timing/latency calibration if evidence shows it is needed.
- Recommend an initial learning route based on experience and goals without requiring an account.

This should be concise and skippable. Its purpose is confidence that the application and instrument agree, not a lengthy registration funnel.

## Learning Expansion After The Core Loop

### Technique exercises

Extend the catalogue-driven generator beyond root-position chords and one-octave scales:

- Chord inversions.
- Broken chords and arpeggios.
- Contrary-motion scales.
- Common chord progressions and cadences.
- Five-finger patterns.
- Repeated-note, independence, and coordination drills.

Generated material should continue through the ordinary MusicXML, notation, Practice, Synthesia, and scoring pipeline. Fingering and spelling must remain explicitly reviewable musical data.

### Ear training

Use synthesis and MIDI input for exercises that do not depend on reading notation:

- Hear and reproduce a note.
- Recognise or reproduce intervals.
- Distinguish chord qualities.
- Reproduce short melodic phrases.
- Identify upward/downward movement and scale degrees.

### Interactive theory and reference

Grow Learning into connected, playable reference material:

- Notes, intervals, and scale degrees.
- Key signatures and the circle of fifths.
- Chord construction and inversions.
- Chord progressions and cadences.
- Rhythm values, rests, and time signatures.
- Common notation and articulation symbols.

References should link directly to sound, keyboard visualization, notation, and a short generated exercise.

### Expressive MIDI feedback

Explore separate observations for:

- Velocity consistency.
- Unexpected accents.
- Balance between hands.
- Sustain-pedal timing.
- Legato gaps and unintended overlaps.

Do not silently fold these into the main score until their interpretation is trustworthy. Present them as evidence-based coaching observations first.

## Technique Guidance Beyond MIDI

MIDI cannot reliably observe posture, wrist and arm movement, tension, finger choice when none is encoded, or acoustic tone production. Add short illustrated or written guidance where relevant, covering topics such as:

- Relaxed posture and hand position.
- Curved fingers and economical movement.
- Thumb crossings and hand shifts.
- Slow, accurate practice.
- Separate-hand preparation.
- Basic sustain-pedal technique.

The application should clearly distinguish educational guidance from measured feedback.

## Account And Persistence Value

Accounts should be introduced after the guided and diagnostic loops establish useful progress data. Valuable persisted information will then include:

- Current piece and guided-workflow stage.
- Mastered and weak sections.
- Comfortable and target tempos.
- RH/LH mastery.
- Sight-reading level and history.
- Recurring pitch, rhythm, and timing difficulties.
- Exercise and curriculum progress.
- Saved ranges, bookmarks, and completed-attempt summaries.

Platform architecture and storage boundaries remain documented separately in [`PLATFORM_ROADMAP.md`](PLATFORM_ROADMAP.md).

## Deliberately Deferred

Do not delay the core learning loop for:

- Social sharing and competitive leaderboards.
- Large badge or achievement systems.
- Teacher, family, or marketplace features.
- Elaborate backing-track production.
- A large licensed song catalogue.
- AI-generated coaching prose without reliable underlying diagnosis.
- Video performances for every lesson.

These may become valuable later, but they should not substitute for clear instruction and effective practice.

## Recommended Delivery Order

1. Guided piece-practice workflow and automatic tempo progression.
2. Measure-level diagnosis with one-click targeted practice.
3. Basic levelled sight-reading mode.
4. MIDI/range onboarding and readiness checks.
5. Technique and theory guidance tied to generated Learning exercises.
6. Account-backed saving, progress, and adaptive recommendations.
7. Broader technique generation, ear training, and expressive feedback.

## Next Product Decision

Define the first guided-practice version. The next design pass should decide:

- Whether the guide starts from the full score or asks for a passage first.
- The default sequence of hand, mode, and tempo steps.
- Mastery thresholds and tempo increments.
- How learners skip, repeat, or leave the guide.
- Which existing performance evidence is sufficient for an automatic recommendation.
- How the guide remains helpful without blocking direct manual practice.

This is the recommended next step because it converts the existing collection of strong practice tools into one coherent learning experience.
