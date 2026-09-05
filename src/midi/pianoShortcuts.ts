import type { CapturedMidiMessage } from "../hooks/useMidiInput";

export type PianoShortcutCommand = "primary" | "previous" | "repeat" | "toggle-loop" | "stop";
export type PianoShortcutBindingKey = "modifier" | PianoShortcutCommand;

export interface PianoShortcutSettings {
  version: 2;
  enabled: boolean;
  showHints: boolean;
  modifier: number;
  bindings: Record<PianoShortcutCommand, number>;
}
export type PianoShortcutSettingsUpdate = Omit<Partial<PianoShortcutSettings>, "bindings"> & { bindings?: Partial<PianoShortcutSettings["bindings"]> };

export interface PianoShortcutState { activeActionNotes: number[] }

export interface PianoShortcutResolution {
  state: PianoShortcutState;
  command?: PianoShortcutCommand;
  heldNotesBefore: number[];
  heldNotesAfter: number[];
}

export const PIANO_SHORTCUTS_STORAGE_KEY = "piano.shortcuts";
export const DEFAULT_PIANO_SHORTCUT_SETTINGS: PianoShortcutSettings = {
  version: 2,
  enabled: false,
  showHints: true,
  modifier: 33,
  bindings: { primary: 36, previous: 38, repeat: 40, "toggle-loop": 41, stop: 43 },
};

export function initialPianoShortcutState(): PianoShortcutState { return { activeActionNotes: [] }; }

export function resolvePianoShortcut(event: CapturedMidiMessage, settings: PianoShortcutSettings, state: PianoShortcutState, active: boolean): PianoShortcutResolution {
  if (!active || !settings.enabled) return { state: initialPianoShortcutState(), heldNotesBefore: event.heldNotesBefore, heldNotesAfter: event.heldNotesAfter };
  const nextActive = new Set(state.activeActionNotes);
  const note = event.message.noteNumber;
  let command: PianoShortcutCommand | undefined;
  if (note !== undefined && event.message.kind === "note-on" && event.heldNotesBefore.includes(settings.modifier) && !nextActive.has(note)) {
    command = commandForNote(settings, note);
    if (command) nextActive.add(note);
  }
  if (note !== undefined && event.message.kind === "note-off") nextActive.delete(note);
  const consumed = new Set<number>([settings.modifier, ...nextActive]);
  return {
    state: { activeActionNotes: [...nextActive] },
    command,
    heldNotesBefore: event.heldNotesBefore.filter((item) => !consumed.has(item)),
    heldNotesAfter: event.heldNotesAfter.filter((item) => !consumed.has(item)),
  };
}

export function commandForNote(settings: PianoShortcutSettings, note: number): PianoShortcutCommand | undefined {
  return (Object.entries(settings.bindings) as [PianoShortcutCommand, number][]).find(([, value]) => value === note)?.[0];
}

export function shortcutConflicts(settings: PianoShortcutSettings): string[] {
  const entries: [string, number][] = [["Modifier", settings.modifier], ...Object.entries(settings.bindings)];
  const conflicts = new Set<string>();
  for (let left = 0; left < entries.length; left += 1) for (let right = left + 1; right < entries.length; right += 1) {
    if (entries[left][1] === entries[right][1]) { conflicts.add(entries[left][0]); conflicts.add(entries[right][0]); }
  }
  return [...conflicts];
}

export function readPianoShortcutSettings(storage: Pick<Storage, "getItem"> | undefined): PianoShortcutSettings {
  try {
    const value = JSON.parse(storage?.getItem(PIANO_SHORTCUTS_STORAGE_KEY) ?? "null") as { version?: number; enabled?: boolean; showHints?: boolean; modifier?: number; bindings?: Partial<Record<PianoShortcutCommand, number>> } | null;
    if (!value || (value.version !== 1 && value.version !== 2) || typeof value.bindings !== "object") return DEFAULT_PIANO_SHORTCUT_SETTINGS;
    const note = (candidate: unknown, fallback: number) => typeof candidate === "number" && Number.isInteger(candidate) && candidate >= 0 && candidate <= 127 ? candidate : fallback;
    return { version: 2, enabled: value.enabled === true, showHints: value.showHints !== false, modifier: value.version === 1 && value.modifier === 21 ? 33 : note(value.modifier, 33), bindings: {
      primary: note(value.bindings?.primary, 36), previous: note(value.bindings?.previous, 38), repeat: note(value.bindings?.repeat, 40), "toggle-loop": note(value.bindings?.["toggle-loop"], 41), stop: note(value.bindings?.stop, 43),
    } };
  } catch { return DEFAULT_PIANO_SHORTCUT_SETTINGS; }
}

export function storePianoShortcutSettings(storage: Pick<Storage, "setItem"> | undefined, settings: PianoShortcutSettings): void {
  try { storage?.setItem(PIANO_SHORTCUTS_STORAGE_KEY, JSON.stringify(settings)); } catch { /* Optional preference. */ }
}
