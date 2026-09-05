# Beginner Foundations Plan

## Goal

Give a completely new pianist a calm, playable path into keyboard geography and written music before asking them to perform a scored challenge.

## Teaching principles

- Explain one idea, then let the learner find it on their own MIDI keyboard.
- Use immediate, specific guidance without percentages, pass/fail labels, or penalties. Rhythm teaching may use a visible pulse and an optional count-in, with forgiving attack/release feedback.
- Treat wrong notes as navigation evidence rather than failure.
- Ignore MIDI input that happened before a lesson opened or restarted.
- Keep lessons short, repeatable, and skippable; progress is session-only until profiles exist.
- Every completed lesson offers **Practise again** and, whenever another lesson exists, **Next lesson** as the standard forward-navigation pattern.
- Reuse the existing score, playback, and assessment systems only when a lesson genuinely needs them.
- Pair every playable lesson with a **Hear this in action** demonstration that animates its piano/notation; rhythm-bearing lessons also use a metronome and continuous beat-position marker.

## Slices

- [x] **Keyboard landmark:** find middle C from the two-black-key group, then step to D and E with fresh-note MIDI guidance. A reusable compact two-octave piano labels every key, highlights the target, and shows currently held MIDI keys in red so the learner can orient themselves spatially.
- [x] **Five-note home position:** extend to F and G, introduce right-hand finger numbers 1–5, and guide a C–D–E–F–G ascending and descending pattern without scoring or timing.
- [x] **Notes on the staff:** connect middle C, D, and E on the keyboard to their treble-staff positions, then reinforce them in a short C–D–E–E–D–C reading pattern. The staff keeps stable geometry between prompts and mirrors currently held keys as red labelled markers beside the written target.
- [x] **Pulse and rhythm:** introduce quarter notes as one beat and half notes as two beats in 4/4, keeping every pitch on middle C and guiding spoken counting without timing grades.
- [x] **First reading phrase:** combine C, D, and E with quarter and half notes in a guided two-measure phrase, then offer a direct transition into the ordinary sight-reading setup.
- [x] **Bass clef and the left hand:** establish bass C as a second keyboard landmark, connect C3, D3, and E3 to the bass staff, and guide an ascending/descending left-hand pattern with fingers 5, 4, and 3.
- [x] **First notes with both hands:** alternate familiar C, D, and E notes between the left and right hands, then finish with a forgiving two-note C octave that accepts the notes in either order while both are held.
- [x] **Bars and rests:** introduce quarter and half rests inside two complete 4/4 bars. The demonstration keeps the metronome and marker moving through silent beats; live guidance asks the learner to keep counting without grading rest timing.
- [x] **Sharps and flats:** teach each accidental as a one-key direction from a familiar natural note, pair the sign with treble notation, and label the target black key using the spelling currently being learned—including C-sharp and D-flat sharing one physical key.
- [x] **First complete piece:** combine four bars across treble and bass staves with both hands, quarter and half notes, C-sharp, a two-note ending, and a final half rest. Keep the guided performance ungraded, but demonstrate the whole piece with continuous metronome and score marker before handing off to Sight Reading.

## Current integration

Beginner Foundations is available from Learning Home and is the default route-finder recommendation for a learner who selects “I’m just starting.” Keyboard Check remains a separate setup tool rather than a compulsory gate. The course shell uses a compact, unit-aware header: it identifies Unit 1 and the active lesson, keeps ten small numbered navigation targets visible, turns completed numbers into checks, and shows overall 0–10 progress without locking navigation. The large duplicate course introduction has been removed so the active lesson stays prominent on a 1080p display, while progression actions dock to the bottom of the lesson surface. Future groups of lessons should reuse this strip as separate units rather than widening the current ten-item row. Durable progress remains deferred until profiles exist.

## Lesson 4 teaching prototype

Lesson 4 now offers demonstration, guided one-beat notes, guided two-beat holds, and an optional combined play-through. Guided practice starts with a fresh middle C and keeps counting through the complete bar, including the final release. At 60 BPM, a 250ms allowance applies to attacks and releases; feedback explains early release, holding too long, missed attacks, and extra presses rather than presenting a score. Both guided stages unlock Next lesson; the combined play-through is optional.

Physical-piano feedback validated the approach and exposed one Lesson 8 notation/marker alignment issue, now corrected. Lessons 5, 8, and 10 have all been converted. Sustain-pedal interpretation and global timed-score duration assessment remain outside this Foundations course.

Lesson 5 is now the first extension of the prototype. Its complete C–D–E | D–C–E phrase runs at the same 60 BPM teaching pulse, starts on the learner's first fresh C, checks both pitch and duration across all six notes, and places the same On time/Early/Late/Missed feedback beneath each written note.

Lesson 8 extends the model to silence. It plays two continuous 4/4 bars at 60 BPM, checks the durations of its three notes, and assesses whether the quarter and half rests remained silent—including notes held across a rest. The notation labels notes On time/Early/Late/Missed and rests Quiet/Sound.

Lesson 10 applies the same model to the complete four-bar piece. It checks right- and left-hand pitches, the C-sharp, each written duration, both pitches and releases of the ending chord, and the final two-beat rest. Compact per-event badges sit under the full score, with a legend preserving the meaning of the smaller success mark.
