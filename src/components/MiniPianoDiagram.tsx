import { generatePianoLayout } from "../piano/piano";
import type { LearningItem } from "../learning/catalog";

const MINI_PIANO_LOW = 60;
const MINI_PIANO_HIGH = 84;
const MINI_KEYS = generatePianoLayout(MINI_PIANO_LOW, MINI_PIANO_HIGH);

export function MiniPianoDiagram({ item }: { item: LearningItem }) {
  const highlighted = new Set(item.midiNotes);
  const rightFingerByNote = new Map(item.midiNotes.map((note, index) => [note, item.rightFingering?.[index]]));
  const leftFingerByNote = new Map(item.midiNotes.map((note, index) => [note, item.leftFingering?.[index]]));
  const fingeringDescription = `. Left hand ${item.leftFingering?.join("-")}. Right hand ${item.rightFingering?.join("-")}.`;
  const description = `${item.label}: ${item.writtenNotes.join(", ")}${item.kind === "scale" ? fingeringDescription : "."}`;

  return <figure className={`mini-piano-diagram ${item.kind}`} role="img" aria-label={description}>
    <div className="mini-piano-keyboard" aria-hidden="true">
      {MINI_KEYS.map((key) => {
        const rightFinger = rightFingerByNote.get(key.midiNote);
        const leftFinger = leftFingerByNote.get(key.midiNote);
        return <span key={key.midiNote} className={`mini-piano-key ${key.isBlack ? "black" : "white"}${highlighted.has(key.midiNote) ? " highlighted" : ""}`} style={{ left: `${key.x * 100}%`, width: `${key.width * 100}%` }}>
          {item.kind === "scale" && leftFinger ? <span className="mini-piano-finger-number hand-left">{leftFinger}</span> : null}
          {item.kind === "scale" && rightFinger ? <span className="mini-piano-finger-number hand-right">{rightFinger}</span> : null}
        </span>;
      })}
    </div>
  </figure>;
}
