# Learning Experience Blueprint

## Status And Purpose

This document is a product and UX proposal for bringing guided piece practice, sight-reading, diagnosis, technique, theory, and ear training together as one coherent Learning area.

It is intentionally written for review before implementation. Defaults and progression rules are recommendations, not final decisions. The existing direct score workspace remains valuable and should not be replaced.

The central idea is simple:

> The player remains the place where a user practises. The Learning area decides what a learner should practise, why, and what should happen next.

## The Product Shape

The application should have two complementary ways to use it.

### Practise

The current score-first workspace remains the flexible expert surface:

- Open any supported score.
- Select any passage.
- Choose hands, mode, tempo, loop, piano, or Synthesia.
- Practise without following a prescribed sequence.
- Inspect results and make manual decisions.

This is ideal for experienced learners, teachers, experimentation, and quick focused work.

### Learn

Learning becomes a top-level destination rather than only a reference overlay. It provides structure around the same practice engine:

- Continue an active lesson or piece plan.
- Follow a guided session.
- Build skills through sight-reading, ear training, theory, and technique.
- Revisit diagnosed weak areas.
- Browse the existing chord and scale reference.
- Understand progress and the reason for each recommendation.

Learn should never feel like a separate application. When an activity begins, it opens the familiar score player with a lightweight lesson layer around it.

## Recommended Information Architecture

The Learning area should initially contain five clear destinations.

### Home

The learner's starting point. It answers:

- What was I doing?
- What should I do next?
- Why is that recommended?
- What can I choose instead?

### My Pieces

Imported scores and generated exercises that the learner is actively learning. Before accounts, this can contain only the current session and local-file entry points. After accounts, it becomes the durable piece library and progress view.

### Skills

Focused learning activities grouped by purpose:

- Sight-reading.
- Ear training.
- Chords and harmony.
- Scales, arpeggios, and technique.
- Rhythm.
- Note reading and keyboard geography.
- Theory and notation.

### Practice Review

A learner-friendly history and diagnosis surface:

- Recent attempts.
- Weak passages.
- Recurring note or timing problems.
- Suggested targeted exercises.
- Improvements achieved during the current session.

This can begin as session-only and become historical after accounts.

### Reference

The current Chords and Scales material evolves into a permanent interactive reference. Later it can include intervals, key signatures, circle of fifths, chord inversions, progressions, rhythm, and notation symbols.

Reference entries should continue offering **Hear**, **See**, and **Practise** actions rather than becoming static articles.

## Learning Home Experience

The Home screen should be calm and selective. It should not resemble a catalogue of hundreds of exercises.

### Primary card: Continue

The most prominent action resumes the learner's current context:

- "Continue Interstellar — RH, measures 41–48, 70%."
- "Continue C harmonic minor — both hands."
- "Continue Sight-reading Level 3."

The card should show the next step and its reason, not only the previous score.

### Recommended next action

One recommendation appears beneath Continue:

> Measures 44–46 caused most of the waits in your last attempt. Practise LH at 60%.

It offers a direct **Practise now** action and a secondary **Why this?** explanation. The learner may dismiss or replace it.

### Choose another activity

A compact row provides voluntary alternatives:

- Learn a piece.
- Sight-read.
- Train your ear.
- Technique.
- Explore theory.

The platform guides without trapping the learner in a compulsory course.

### Session summary

At the end of a learning session, Home may show:

- Time actively practised.
- Passages improved.
- Highest comfortable tempo reached.
- Skills touched.
- A simple suggestion for next time.

Avoid streak pressure or guilt-oriented messaging. Consistency can be encouraged later without treating a missed day as failure.

## The Shared Learning Model

Every type of learning should use a common hierarchy:

1. **Path** — a broad outcome, such as Beginner Foundations or Learn a Piece.
2. **Unit** — a meaningful topic or section.
3. **Lesson** — a short intended learning outcome.
4. **Activity** — something the learner does in the player or an interactive explanation.
5. **Attempt** — one measurable performance of an activity.

A piece-specific plan can use the same model:

- Path: Learn Interstellar.
- Unit: Measures 41–48.
- Lesson: Coordinate repeated C5 with the LH pattern.
- Activity: LH slowly, then both hands in Pause mode.
- Attempt: the resulting performance and diagnosis.

This shared model lets sight-reading, generated technique work, and imported pieces appear consistently without forcing them to use identical scoring rules.

## Guided Piece Practice: Entry Points

The guided workflow should be available from several natural places:

- **Learn this piece** after opening a score.
- **Learn this selection** after selecting a range.
- **Guided practice** from a generated Learning exercise.
- **Practise this section** from diagnosis.
- **Continue** from Learning Home.

The existing Play and Practice buttons remain unchanged for direct practice.

## Starting A Guided Piece

Starting guidance should take only one lightweight setup screen.

### Step 1: Choose the material

Offer:

- Whole piece.
- Current selection.
- Suggested sections, if safe measure boundaries can be identified.

For long scores, recommend beginning with a short passage rather than silently creating an enormous plan.

### Step 2: Choose the goal

Suggested goals:

- Learn the notes.
- Build both-hand coordination.
- Reach written tempo.
- Prepare a confident performance.

The goal changes emphasis but does not create unrelated modes. A beginner may focus on note correctness; a performance goal includes uninterrupted final runs.

### Step 3: Choose a starting point

Offer a recommended setup with an expandable custom option:

- Starting tempo.
- Target tempo.
- Hands to include.
- Whether to begin with a listen-through.

The first version should not require a placement test. Default to a conservative starting tempo and allow immediate adjustment.

## Guided Piece Session Layout

When guidance begins, reuse the existing score workspace. Add only a focused guide layer.

### Session header

Show:

- Current lesson and passage.
- Current step, such as "Step 2 of 6 — LH slowly."
- Current tempo and final target.
- A clear **Leave guide** action.

### Guide card

Use the existing right workspace for a concise card:

- **Do this:** "Play LH through measures 41–44."
- **Focus on:** "Keep the repeated notes even."
- **Success:** "At least 90% with no unresolved misses."
- Primary action: Start/try again.
- Secondary actions: Skip, adjust, or practise freely.

The card should never cover the notation, piano, transport, or Synthesia.

### Step rail

A compact progress rail shows the learning sequence:

- Listen.
- RH.
- LH.
- Both hands with pauses.
- Both hands slowly.
- Tempo build.
- Final performance.

Completed steps show evidence such as "92% at 60%" rather than an unexplained tick. Future steps are visible so the learner understands the journey.

### Existing player controls

The guide configures hand, mode, range, loop, and tempo for the current activity, but the values remain visible. If the learner changes one, the guide should adapt or say that the learner has entered a temporary custom attempt.

Guidance must coordinate the player, not create a hidden second transport system.

## Recommended Guided Sequence

The default sequence should adapt to the material while remaining understandable.

### 1. Listen and orient

- Play score audio for the passage.
- Follow the notation and Synthesia if enabled.
- Show the key signature, tempo, time signature, and expected keyboard range.
- Do not score the learner.

The learner may skip this step.

### 2. Right hand slowly

- Select RH.
- Use untimed Practice or Pause at each note depending on difficulty.
- Begin below target tempo if rhythm is active.
- Advance after a clear accuracy threshold.

Skip automatically when the passage has no RH material.

### 3. Left hand slowly

Mirror the RH step and skip when no LH material exists.

### 4. Both hands with support

- Enable both hands.
- Use Pause at each note.
- Emphasise coordination without demanding exact tempo.
- Preserve the existing early-hit tolerance and chord/arpeggio behaviour.

### 5. Both hands at reduced tempo

- Use uninterrupted tempo Play.
- Start from the chosen or recommended percentage.
- Assess accuracy and timing without stopping the performance.

### 6. Build tempo

- Increase tempo after demonstrated success.
- Repeat only the current passage.
- Offer targeted detours when one location repeatedly prevents progress.

### 7. Final performance

- Use the target tempo.
- Hide live result markers by default.
- Do not pause for errors.
- Present diagnosis afterward.

Completion should mean "ready to continue or revisit later," not permanent mastery after one successful run.

## Automatic Tempo Progression

### Proposed first defaults

These should remain easy to adjust after hands-on testing:

- Suggested starting tempo: 60%.
- User-selectable target: written tempo by default.
- Successful attempt: at least 90% with no severe concentration of errors.
- Increase after success: 10 percentage points.
- Hold tempo after one unsuccessful attempt.
- After two similar failures, recommend a targeted passage or reduce by 5–10 points.
- Require more than one convincing attempt before marking the target tempo comfortable.

### What the learner sees

Never change tempo silently. After each attempt, explain the decision:

- "92% — moving from 60% to 70%."
- "Accuracy was good, but measures 44–45 were unstable — stay at 70%."
- "Two difficult attempts — practise LH in measures 44–45 at 60%."

Allow **Accept**, **Try again**, and **Choose tempo**. Automatic progression is assistance, not authority.

### Avoiding score chasing

One percentage should not control every decision. The guide should consider:

- Correct notes and unresolved misses.
- Wrong-note concentration.
- Timing consistency.
- Pauses or gate-wait duration.
- Whether errors are scattered or concentrated.
- Whether the learner improved over the preceding attempt.

Velocity, pedal, articulation, and note-release analysis should not block progression until those measurements are deliberately introduced and validated.

## Passage Planning And Chunking

The guide works best on short musical sections.

### First version

- Respect the user's explicit selection.
- For a whole piece, divide at measure boundaries into small fixed-size sections.
- Prefer existing MusicXML system, repeat, rehearsal, or section information when reliably available.
- Let the learner resize or replace every suggested section.
- Keep section overlap optional for joining transitions.

### Later refinement

Diagnosis may propose smaller focus regions based on errors, but it should not create impractically tiny one-note exercises. A difficult note usually needs musical context before and after it.

## Diagnosis Inside The Learning Loop

Diagnosis should appear at three levels.

### Immediate attempt result

Answer only:

- Did this attempt meet the step's goal?
- What was the most important issue?
- What should happen next?

### Passage review

Show measure-level evidence and allow one-click targeted practice. Avoid overwhelming beginners with every captured metric.

### Longer-term skill pattern

After persistence exists, identify recurring themes across pieces:

- LH coordination.
- Reading accidentals.
- Large intervals.
- Dotted rhythm.
- Chord recognition.

These patterns can recommend a Skills activity without pretending that one mistake proves a general weakness.

## How The Other Learning Areas Connect

### Sight-reading

Sight-reading is a separate activity type with one-attempt rules, hidden live feedback, and fresh excerpts. Results return to Learning Home and may recommend note-reading or rhythm work, but sight-reading attempts should not be converted into ordinary repeat-until-perfect piece lessons.

### Ear training

Ear activities use the same session shell but replace notation-first instruction with listen-and-answer interactions. Where useful, a completed ear exercise can reveal the notation and keyboard afterward.

### Technique

Generated scales, chords, inversions, arpeggios, and patterns use the existing player. The guide supplies goals such as evenness, target tempo, hands, and repetition count. Technique activities may support piece learning: a passage in E-flat major can link to a short E-flat scale or chord exercise.

### Theory

Theory lessons should be short explanations followed by interaction:

- Hear the concept.
- See it on notation and keyboard.
- Answer or play a small example.
- Apply it in a piece or generated exercise.

### Reference

Reference is non-linear and always available. It should link into lessons without claiming the learner has completed a course merely by viewing an entry.

## Learning Paths

The platform can eventually offer curated paths without making them the only entrance.

Possible initial paths:

- First Notes And Keyboard Geography.
- Reading Treble And Bass Clefs.
- Rhythm Foundations.
- Chords And Harmony.
- Scales And Technique.
- Sight-Reading Development.
- Learn Your First Piece.

Each path mixes explanations, generated exercises, and real musical application. Paths should have explicit outcomes rather than arbitrary point totals.

## Guest And Account Experience

### Before accounts

- Learning Home reflects the current browser session.
- Guided plans can operate on the currently loaded score.
- Recommendations and tempo progression survive within the active session.
- Users can experience the complete learning loop without registering.

### After accounts

- Continue works across devices.
- Piece plans, sections, comfortable tempos, and completed steps persist.
- Diagnosis can identify patterns across time.
- Sight-reading difficulty can adapt.
- Curated paths can track mastery and prerequisites.

Authentication should add continuity, not unlock the basic ability to learn from a local score.

## Tone And Motivation

The interface should feel like a calm, observant teacher.

Prefer:

- "That passage improved at 70%."
- "The same two measures are still slowing you down."
- "Try the left hand alone before increasing tempo."

Avoid:

- Punishment for stopping.
- False certainty from limited evidence.
- Childish celebration as the only motivation.
- Progress bars that reward clicking rather than learning.
- Language implying musical failure from one difficult attempt.

Celebration can remain warm and proportional: completing a first both-hand run deserves more emphasis than opening a reference card.

## Accessibility And Control

- Every guide action must be keyboard accessible.
- Instructions, current step, changed tempo, and result decisions need screen-reader announcements.
- Colour must not be the only indication of correctness or progress.
- Reduced-motion preferences must cover transitions and celebrations.
- Learners must be able to pause, leave, skip, repeat, or switch to free practice without losing the current session context.
- The score and keyboard remain the visual priority; guidance should not reduce usable notation space unnecessarily.

## Recommended First Release Boundary

The first guided-practice release should include:

- **Learn this selection/piece** entry points.
- One session-only guided plan.
- Listen, RH, LH, both-hand Pause, reduced-tempo Play, tempo build, and final performance steps.
- A compact step rail and guide card in the existing workspace.
- Transparent progression decisions after each attempt.
- Manual skip, repeat, tempo adjustment, and leave-guide controls.
- Simple measure-level identification of the highest error concentration.
- One-click targeted detour using the existing selection and practice controls.

It should not initially include:

- Account persistence.
- Adaptive curriculum placement.
- Cross-piece skill diagnosis.
- AI-authored advice.
- Teacher dashboards.
- Full sight-reading or ear-training content.

Those features should fit the shared model, but they do not need to be built to prove guided piece practice.

## Decisions To Review Before Planning Implementation

1. Should Learning become a top-level application destination immediately, or should guided practice first launch from the current workspace?
	- Yes, but options to simply load/select(when saved scores are in) a score is available from here too
2. Should a whole-piece guide automatically divide the score, or require the learner to choose the first passage?
	- I would like to see if we can divide the score but it's customisable by the user so he can change it, think say you can see the whole score broken up, each section visible, user can simply use drag handles to adjust any point, or drop in a new point at any spot which creates a new "lesson", each section will be scored and follow learning rules, if an old section is altered, it's score resets, if a section is split to make 2, both sides are reset and should be completed.
3. Are 60% starting tempo, 90% success, and 10-point tempo increases appropriate defaults?
	- this sounds good to me.
4. Should RH/LH steps always appear when material exists, or be optional based on an initial attempt?
	- Not sure what you mean by this one?
5. How much diagnosis should a beginner see after each attempt?
	- As much as is possible and useful, even if it's not beginner useful we could maybe hide some to be less promonent but there for interest ect.
6. Should the guide automatically apply its next recommendation or wait for confirmation?
	- Wait for conf
7. What evidence should be required before calling a passage "comfortable" or "complete"?
	- Not sure at this stage, just use your best judgement for now and we can adjust later.
8. Should Learning Home exist before accounts as a session-only surface, or arrive alongside persistence?
	- The idea was to add this now prior to persistence/accounts was it not?

## Recommended Direction

Build the wider Learning area around a shared activity model, but prove it first through guided piece practice launched from the existing score workspace. Reuse the player rather than creating a second lesson renderer or transport. Once the guided loop can prescribe, observe, explain, and adjust a real practice session, expose it through Learning Home and connect sight-reading, technique, ear training, theory, and reference as sibling activity types.

This sequence keeps the first implementation grounded while ensuring it belongs to a coherent future platform.
