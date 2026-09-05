import type { GuidedPiecePlan } from "../learning/guidedPractice";

export function GuidedPlannerCard({ plan, addingBoundary, onAddingBoundaryChange, onSectionSelect, onBoundaryMove, onBoundaryDelete, onDone }: {
  plan: GuidedPiecePlan;
  addingBoundary: boolean;
  onAddingBoundaryChange: (active: boolean) => void;
  onSectionSelect: (sectionId: string) => void;
  onBoundaryMove: (rightSectionId: string, eventIndex: number) => void;
  onBoundaryDelete: (rightSectionId: string) => void;
  onDone: () => void;
}) {
  const activeIndex = Math.max(0, plan.sections.findIndex((section) => section.id === plan.activeSectionId));
  return <section className="guided-planner-card" aria-label="Guided lesson planner">
    <header><div><span>Guided piece practice</span><h2>Review lesson sections</h2></div><strong>{plan.sections.length}</strong></header>
    <p>Sections start at four measures. Select one on the score or below, then adjust its boundary. Changed sections restart their progress.</p>
    <button type="button" className={addingBoundary ? "active" : ""} aria-pressed={addingBoundary} onClick={() => onAddingBoundaryChange(!addingBoundary)}>{addingBoundary ? "Click the score to add a boundary" : "Add boundary"}</button>
    <ol className="guided-section-list">
      {plan.sections.map((section, index) => <li key={section.id} className={index === activeIndex ? "active" : ""}>
        <button type="button" className="guided-section-select" onClick={() => onSectionSelect(section.id)}><strong>Lesson {index + 1}</strong><span>Measures {section.startMeasure}–{section.endMeasure}</span></button>
        {index > 0 ? <div className="guided-boundary-controls" aria-label={`Boundary before lesson ${index + 1}`}>
          <button type="button" aria-label={`Move lesson ${index + 1} start earlier`} onClick={() => onBoundaryMove(section.id, section.startIndex - 1)}>←</button>
          <button type="button" aria-label={`Move lesson ${index + 1} start later`} onClick={() => onBoundaryMove(section.id, section.startIndex + 1)}>→</button>
          <button type="button" aria-label={`Remove boundary before lesson ${index + 1}`} title="Merge with previous lesson" onClick={() => onBoundaryDelete(section.id)}>×</button>
        </div> : null}
      </li>)}
    </ol>
    <div className="button-row"><button type="button" className="primary" onClick={onDone}>Done planning</button></div>
  </section>;
}
