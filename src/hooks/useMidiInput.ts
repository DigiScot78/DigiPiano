import { useCallback, useEffect, useMemo, useState } from "react";
import { applyMidiToHeldNotes, createHeldNoteState, type HeldNoteState } from "../midi/heldNotes";
import { decodeMidiMessage, type DecodedMidiMessage } from "../midi/messages";

export interface MidiInputSummary {
  id: string;
  name: string;
  manufacturer?: string;
  state?: string;
  connection?: string;
}

interface MidiHookState {
  supported: boolean;
  secureContext: boolean;
  permissionStatus: "unknown" | "prompt" | "granted" | "denied";
  accessStatus: "idle" | "requesting" | "ready" | "error";
  error?: string;
  inputs: MidiInputSummary[];
  selectedInputId?: string;
  lastMessage?: DecodedMidiMessage;
  heldState: HeldNoteState;
  messageCounter: number;
}

type NavigatorWithMidi = Navigator & {
  requestMIDIAccess?: (options?: { sysex?: boolean }) => Promise<MIDIAccess>;
};

export function useMidiInput() {
  const [midiAccess, setMidiAccess] = useState<MIDIAccess | null>(null);
  const [state, setState] = useState<MidiHookState>({
    supported: typeof navigator !== "undefined" && "requestMIDIAccess" in navigator,
    secureContext: typeof window !== "undefined" ? window.isSecureContext : false,
    permissionStatus: "unknown",
    accessStatus: "idle",
    inputs: [],
    heldState: createHeldNoteState(),
    messageCounter: 0,
  });

  const refreshInputs = useCallback((access: MIDIAccess) => {
    const inputs = Array.from(access.inputs.values()).map(toInputSummary);
    setState((current) => ({ ...current, inputs }));
  }, []);

  const requestAccess = useCallback(async () => {
    const midiNavigator = navigator as NavigatorWithMidi;
    if (!midiNavigator.requestMIDIAccess) {
      setState((current) => ({ ...current, accessStatus: "error", error: "Web MIDI is not supported in this browser." }));
      return;
    }

    if (!window.isSecureContext) {
      setState((current) => ({ ...current, accessStatus: "error", error: "Web MIDI requires a secure context. Use localhost or HTTPS." }));
      return;
    }

    setState((current) => ({ ...current, accessStatus: "requesting", error: undefined }));
    try {
      const access = await midiNavigator.requestMIDIAccess({ sysex: false });
      setMidiAccess(access);
      const inputs = Array.from(access.inputs.values()).map(toInputSummary);
      access.onstatechange = () => refreshInputs(access);
      setState((current) => ({
        ...current,
        accessStatus: "ready",
        permissionStatus: "granted",
        inputs,
        selectedInputId: current.selectedInputId ?? inputs[0]?.id,
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        accessStatus: "error",
        permissionStatus: "denied",
        error: error instanceof Error ? error.message : "MIDI access was denied or unavailable.",
      }));
    }
  }, [refreshInputs]);

  const selectInput = useCallback((inputId: string) => {
    setState((current) => ({ ...current, selectedInputId: inputId, heldState: createHeldNoteState() }));
  }, []);

  useEffect(() => {
    if (!midiAccess) {
      return;
    }

    const selected = state.selectedInputId ? midiAccess.inputs.get(state.selectedInputId) : undefined;
    if (!selected) {
      return;
    }

    const handler = (event: MIDIMessageEvent) => {
      if (!event.data) {
        return;
      }
      const message = decodeMidiMessage(event.data);
      setState((current) => ({
        ...current,
        lastMessage: message,
        heldState: applyMidiToHeldNotes(current.heldState, message),
        messageCounter: current.messageCounter + 1,
      }));
    };

    selected.onmidimessage = handler;
    return () => {
      selected.onmidimessage = null;
    };
  }, [midiAccess, state.selectedInputId]);

  const heldNotes = useMemo(() => Array.from(state.heldState.heldNotes).sort((a, b) => a - b), [state.heldState]);

  return {
    ...state,
    heldNotes,
    requestAccess,
    selectInput,
  };
}

function toInputSummary(input: MIDIInput): MidiInputSummary {
  return {
    id: input.id,
    name: input.name ?? "Unnamed MIDI input",
    manufacturer: input.manufacturer ?? undefined,
    state: input.state,
    connection: input.connection,
  };
}
