interface ImportMetaEnv {
  readonly VITE_APP_ENV?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface MIDIPort {
  readonly id: string;
  readonly manufacturer: string | null;
  readonly name: string | null;
  readonly state: "connected" | "disconnected";
  readonly connection: "open" | "closed" | "pending";
}

interface MIDIInput extends MIDIPort {
  onmidimessage: ((event: MIDIMessageEvent) => void) | null;
}

interface MIDIMessageEvent extends Event {
  readonly data: Uint8Array;
}
