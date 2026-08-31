import { useEffect, type CSSProperties } from "react";
import { CHORD_CATALOG, LEARNING_ROOTS, SCALE_CATALOG, type LearningItem } from "../learning/catalog";
import { canGenerateLearningScore } from "../learning/generatedScore";
import { MiniPianoDiagram } from "./MiniPianoDiagram";

export type LearningTab = "chords" | "scales";

export function LearningPanel({ tab, bottomOffset, rightColor, onTabChange, onItemActivate, onClose }: { tab: LearningTab; bottomOffset: number; rightColor: string; onTabChange: (tab: LearningTab) => void; onItemActivate: (item: LearningItem) => void; onClose: () => void }) {
  useEffect(() => {
    const closeFromEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeFromEscape);
    return () => window.removeEventListener("keydown", closeFromEscape);
  }, [onClose]);
  const selectTabFromKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next: LearningTab = event.key === "ArrowLeft" || event.key === "Home" ? "chords" : "scales";
    onTabChange(next);
    document.getElementById(`learning-tab-${next}`)?.focus();
  };

  const style = { bottom: bottomOffset, "--learning-right": rightColor } as CSSProperties;
  return <section className="learning-panel" aria-label="Learning reference" style={style}>
    <header className="learning-panel-header">
      <div className="learning-tabs" role="tablist" aria-label="Learning topics">
        {(["chords", "scales"] as const).map((name) => <button key={name} type="button" id={`learning-tab-${name}`} role="tab" aria-selected={tab === name} aria-controls={`learning-panel-${name}`} tabIndex={tab === name ? 0 : -1} onClick={() => onTabChange(name)} onKeyDown={selectTabFromKey}>{name === "chords" ? "Chords" : "Scales"}</button>)}
      </div>
      <p>{tab === "chords" ? "Root-position triads" : "One octave ascending; melodic minor descends as natural minor"}</p>
    </header>
    <div className="learning-chart-scroll">
      {tab === "chords"
        ? <LearningChart id="learning-panel-chords" tab="chords" headings={["Major", "Minor", "Augmented", "Diminished"]} items={CHORD_CATALOG} onItemActivate={onItemActivate} />
        : <LearningChart id="learning-panel-scales" tab="scales" headings={["Major", "Natural minor", "Harmonic minor", "Melodic minor ↑"]} items={SCALE_CATALOG} onItemActivate={onItemActivate} />}
    </div>
  </section>;
}

function LearningChart({ id, tab, headings, items, onItemActivate }: { id: string; tab: LearningTab; headings: string[]; items: LearningItem[]; onItemActivate: (item: LearningItem) => void }) {
  return <div id={id} role="tabpanel" aria-labelledby={`learning-tab-${tab}`}>
    <table className="learning-chart">
      <thead><tr><th scope="col">Key</th>{headings.map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr></thead>
      <tbody>{LEARNING_ROOTS.map((root) => {
        const rootItems = items.filter((item) => item.root.id === root.id);
        return <tr key={root.id}><th scope="row">{root.label}</th>{rootItems.map((item) => <td key={item.id}>{canGenerateLearningScore(item) ? <button type="button" className="learning-score-button" aria-label={`Open ${item.label} practice score`} onClick={() => onItemActivate(item)}><MiniPianoDiagram item={item} /></button> : <MiniPianoDiagram item={item} />}</td>)}</tr>;
      })}</tbody>
    </table>
  </div>;
}
