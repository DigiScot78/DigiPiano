import { midiNoteToName } from "../music/note";

export type MidiMessageKind = "note-on" | "note-off" | "control-change" | "other";

export interface DecodedMidiMessage {
  kind: MidiMessageKind;
  command: number;
  channel: number;
  noteNumber?: number;
  noteName?: string;
  velocity?: number;
  controller?: number;
  value?: number;
  sustainOn?: boolean;
  raw: number[];
}

export function decodeMidiMessage(data: ArrayLike<number>): DecodedMidiMessage {
  const status = data[0] ?? 0;
  const command = status & 0xf0;
  const channel = (status & 0x0f) + 1;
  const raw = Array.from({ length: data.length }, (_, index) => data[index]);

  if (command === 0x90 || command === 0x80) {
    const noteNumber = data[1] ?? 0;
    const velocity = data[2] ?? 0;
    const kind = command === 0x90 && velocity > 0 ? "note-on" : "note-off";
    return {
      kind,
      command,
      channel,
      noteNumber,
      noteName: midiNoteToName(noteNumber),
      velocity,
      raw,
    };
  }

  if (command === 0xb0) {
    const controller = data[1] ?? 0;
    const value = data[2] ?? 0;
    return {
      kind: "control-change",
      command,
      channel,
      controller,
      value,
      sustainOn: controller === 64 ? value >= 64 : undefined,
      raw,
    };
  }

  return {
    kind: "other",
    command,
    channel,
    raw,
  };
}
