import type { HandMode } from "../learning/matcher";
import type { GuidedPiecePlan } from "../learning/guidedPractice";
import type { GuidedSessionStep } from "../learning/guidedSession";
import type { GuidedDiagnosis } from "../learning/guidedDiagnosis";

const STEPS: { id: GuidedSessionStep; short: string; title: string; description: string }[] = [
  { id: "listen", short: "Listen", title: "Listen first", description: "Hear the whole lesson once and notice its shape before playing." },
  { id: "right", short: "RH", title: "Right hand", description: "Play the right hand. The score waits at every note or chord." },
  { id: "left", short: "LH", title: "Left hand", description: "Play the left hand. The score waits at every note or chord." },
  { id: "both", short: "Both", title: "Both hands", description: "Bring both hands together. The score still waits for you." },
  { id: "tempo", short: "Tempo", title: "Tempo practice", description: "Play without note pauses, beginning slowly and building toward the written tempo." },
];

export function GuidedSessionCard({ plan, steps, step, stepComplete, stepScore, diagnosis, detour, detourComplete, detourScore, auditioning, playbackActive, awaitingLoopRestart, loopEnabled, tempoHand, shortcutHint, shortcutNotice, onSectionSelect, onStepSelect, onListen, onListenDone, onPractice, onLoopChange, onTempoIncrease, onSkip, onRepeat, onNextLesson, onEditPlan, onStartDetour, onPracticeDetour, onReturnFromDetour, onLeave }: {
  plan: GuidedPiecePlan;
  steps: GuidedSessionStep[];
  step: GuidedSessionStep;
  stepComplete: boolean;
  stepScore?: number;
  diagnosis?: GuidedDiagnosis;
  detour?: { measureNumber: number; handMode: HandMode };
  detourComplete: boolean;
  detourScore?: number;
  auditioning: boolean;
  playbackActive: boolean;
  awaitingLoopRestart: boolean;
  loopEnabled: boolean;
  tempoHand: HandMode;
  shortcutHint?: string;
  shortcutNotice?: string;
  onSectionSelect: (sectionId: string) => void;
  onStepSelect: (step: GuidedSessionStep) => void;
  onListen: () => void;
  onListenDone: () => void;
  onPractice: (hand: HandMode) => void;
  onLoopChange: (enabled: boolean) => void;
  onTempoIncrease: () => void;
  onSkip: () => void;
  onRepeat: () => void;
  onNextLesson: () => void;
  onEditPlan: () => void;
  onStartDetour: (diagnosis: GuidedDiagnosis) => void;
  onPracticeDetour: () => void;
  onReturnFromDetour: () => void;
  onLeave: () => void;
}) {
  const sectionIndex = Math.max(0, plan.sections.findIndex((section) => section.id === plan.activeSectionId));
  const section = plan.sections[sectionIndex] ?? plan.sections[0];
  const visibleSteps = STEPS.filter((item) => steps.includes(item.id));
  const stepIndex = visibleSteps.findIndex((item) => item.id === step);
  const detail = visibleSteps[stepIndex];
  const finalStep = visibleSteps.at(-1)?.id === step;
  const practiceHand: HandMode = step === "right" ? "right" : step === "left" ? "left" : step === "tempo" ? tempoHand : "both";
  const tempoQualified = (section?.lastTempoScore ?? 0) >= 90;
  if (!section || !detail) return null;

  return <section className="guided-session-card" aria-label="Guided practice">
    <header>
      <div><span>Guided piece practice</span><h2>Lesson {sectionIndex + 1} of {plan.sections.length}</h2></div>
      <button type="button" disabled={Boolean(detour)} onClick={onEditPlan}>Edit plan</button>
    </header>
    <label className="guided-lesson-picker">Lesson
      <select value={section.id} disabled={Boolean(detour)} onChange={(event) => onSectionSelect(event.target.value)}>
        {plan.sections.map((item, index) => <option key={item.id} value={item.id}>Lesson {index + 1} · measures {item.startMeasure}–{item.endMeasure}</option>)}
      </select>
    </label>
    <ol className="guided-step-rail" style={{ "--guided-step-count": visibleSteps.length } as React.CSSProperties} aria-label="Lesson steps">
      {visibleSteps.map((item, index) => {
        const done = index < stepIndex || item.id === "tempo" && section.status === "complete";
        return <li key={item.id} className={`${done ? "done" : ""}${index === stepIndex ? " active" : ""}`}>
        <button type="button" aria-label={`Go to ${item.title}`} aria-current={index === stepIndex ? "step" : undefined} disabled={index > stepIndex || playbackActive} onClick={() => onStepSelect(item.id)}><span>{index < stepIndex ? "✓" : index + 1}</span>{item.short}</button>
      </li>;})}
    </ol>
    {detour ? <div className="guided-focus-card guided-detour-card">
      <span>Focused practice · Measure {detour.measureNumber}</span>
      <h3>{detourComplete ? detourScore !== undefined && detourScore >= 90 ? "Focused pass passed" : "Another focused pass recommended" : `${detour.handMode === "right" ? "Right hand" : detour.handMode === "left" ? "Left hand" : "Both hands"} spotlight`}</h3>
      {detourComplete && detourScore !== undefined ? <GuidedScoreResult score={detourScore} /> : null}
      <p>The score waits at every note in this measure. This temporary detour does not change the lesson boundary or its completed tempo progress.</p>
      <div className="button-row">
        {!detourComplete ? <button type="button" className="primary" disabled={playbackActive} onClick={onPracticeDetour}>{playbackActive ? "Practice in progress…" : "Start focused pass"}</button> : <button type="button" onClick={onPracticeDetour}>Repeat focused pass</button>}
        <button type="button" disabled={playbackActive} onClick={onReturnFromDetour}>Return to lesson</button>
      </div>
    </div> : <div className="guided-focus-card">
      <span>Measures {section.startMeasure}–{section.endMeasure}</span>
      <h3>{stepComplete ? stepScore === undefined || step === "listen" ? "Step complete" : stepScore >= 90 ? "Step passed" : "Another pass recommended" : detail.title}</h3>
      {stepComplete && step !== "listen" && stepScore !== undefined ? <GuidedScoreResult score={stepScore} /> : null}
      {step === "tempo" ? <div className="guided-tempo-status"><strong>{section.tempoPercent}%</strong><span>Target {section.targetTempoPercent}%</span><span>Target runs {section.qualifyingTargetRuns}/2</span></div> : null}
      <p>{stepComplete ? (step === "tempo" ? section.status === "complete" ? "Comfortable at the written tempo—two qualifying target runs complete." : tempoQualified && section.tempoPercent < section.targetTempoPercent ? `Score ${section.lastTempoScore}. Ready to increase when you choose.` : `Score ${section.lastTempoScore ?? 0}. Repeat at ${section.tempoPercent}% before progressing.` : loopEnabled && awaitingLoopRestart ? "Pass complete. Repeat this step now, or continue when you are satisfied." : finalStep ? "Lesson complete. Repeat it or continue to the next lesson." : "Good work. Continue when you are ready.") : detail.description}</p>
      {step !== "listen" ? <label className="guided-loop-option"><input type="checkbox" checked={loopEnabled} disabled={playbackActive && !awaitingLoopRestart} onChange={(event) => onLoopChange(event.target.checked)} /> Loop this step</label> : null}
      <div className="button-row">
        {step === "listen" && !stepComplete ? <><button type="button" className="primary" onClick={onListen}>{auditioning ? "Stop listening" : "▶ Listen"}</button><button type="button" onClick={onListenDone}>Done listening</button></> : null}
        {step !== "listen" && !stepComplete ? <button type="button" className="primary" disabled={playbackActive} onClick={() => onPractice(practiceHand)}>{playbackActive ? "Practice in progress…" : "Start this step"}</button> : null}
        {stepComplete && step === "tempo" && section.status === "complete" ? <button type="button" className="primary" onClick={onNextLesson}>{sectionIndex < plan.sections.length - 1 ? "Next lesson" : "Finish guided practice"}</button> : null}
        {stepComplete && step === "tempo" && section.status !== "complete" && tempoQualified && section.tempoPercent < section.targetTempoPercent ? <button type="button" className="primary" onClick={onTempoIncrease}>Increase to {Math.min(section.targetTempoPercent, section.tempoPercent + 10)}%</button> : null}
        {stepComplete && step !== "tempo" ? <button type="button" className="primary" onClick={finalStep ? onNextLesson : onSkip}>{finalStep ? (sectionIndex < plan.sections.length - 1 ? "Next lesson" : "Finish guided practice") : "Continue"}</button> : null}
        {step !== "listen" && !finalStep && !stepComplete ? <button type="button" onClick={onSkip}>Skip step</button> : null}
        {stepComplete && (step !== "tempo" || section.status !== "complete") ? <button type="button" onClick={onRepeat}>{awaitingLoopRestart ? "Repeat now" : step === "tempo" ? `Repeat ${section.tempoPercent}%` : "Repeat step"}</button> : null}
      </div>
      {shortcutHint ? <p className="guided-shortcut-hint">Piano shortcut: {shortcutHint}</p> : null}
      {shortcutNotice ? <p className="guided-shortcut-notice" role="status">{shortcutNotice}</p> : null}
    </div>}
    {diagnosis ? <section className="guided-diagnosis-card" aria-label="Practice insight">
      <span>Practice insight</span>
      <h3>{diagnosis.title} needs the most attention</h3>
      <p>{diagnosis.summary}</p>
      <details><summary>Why this was selected</summary><p>Across the recorded attempts in this lesson: {diagnosis.correctNotes} correct, {diagnosis.missedNotes} missed, {diagnosis.wrongNotes} wrong pitch, and {diagnosis.mistimedNotes} mistimed.{diagnosis.averageTimingErrorMs !== undefined ? ` Correct notes averaged ${diagnosis.averageTimingErrorMs} ms from their expected time.` : ""}</p></details>
      <div className="guided-detour-confirm">
        <p>Temporarily practise measure {diagnosis.measureNumber}{diagnosis.hand ? ` with the ${diagnosis.hand} hand` : " with both hands"}. Your completed lesson and boundaries will stay unchanged.</p>
        <div className="button-row"><button type="button" className="primary" onClick={() => onStartDetour(diagnosis)}>Start focused practice</button></div>
      </div>
    </section> : null}
    <button type="button" className="guided-leave" onClick={onLeave}>Leave guided practice</button>
  </section>;
}

function GuidedScoreResult({ score }: { score: number }) {
  const passed = score >= 90;
  return <div className={`guided-step-score ${passed ? "passed" : "retry"}`} role="status" aria-label={`Score ${score} percent, ${passed ? "passed" : "try again"}`}>
    <strong>{score}%</strong><span>{passed ? "Passed" : "Try again"}</span>
  </div>;
}
