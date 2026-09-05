const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function midiNoteToName(noteNumber: number): string {
  if (!Number.isInteger(noteNumber) || noteNumber < 0 || noteNumber > 127) {
    return `Invalid(${noteNumber})`;
  }

  const name = NOTE_NAMES[noteNumber % 12];
  const octave = Math.floor(noteNumber / 12) - 1;
  return `${name}${octave}`;
}

export function pitchToMidi(step: string, alter: number, octave: number): number {
  const base: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };
  const normalizedStep = step.toUpperCase();
  if (!(normalizedStep in base)) {
    throw new Error(`Unsupported pitch step: ${step}`);
  }
  return (octave + 1) * 12 + base[normalizedStep] + alter;
}
