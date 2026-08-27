export interface ScoreEventNote {
  midiNote: number;
  staffNumber: number;
  voiceNumber: string;
  sourceNoteId: string;
  pitchStep?: string;
  pitchAlter?: number;
  pitchOctave?: number;
}

export interface ScoreEvent {
  id: string;
  partId: string;
  measureNumber: number;
  startQuarter: number;
  measureStartQuarter?: number;
  durationQuarters: number;
  midiNotes: number[];
  staffNumbers: number[];
  voiceNumbers: string[];
  sourceNoteIds: string[];
  noteDetails: ScoreEventNote[];
  keyFifths?: number;
  isRest?: boolean;
}

export interface TempoChange {
  quarter: number;
  bpm: number;
  source: "sound" | "metronome";
}

export interface ScoreMeasureDiagnostic {
  measureNumber: number;
  pitchedByStaff: Record<string, number>;
  restsByStaff: Record<string, number>;
  pitchedByStaffVoice: Record<string, number>;
  printNewSystem: boolean;
  printNewPage: boolean;
  hasSystemLayout: boolean;
  width?: number;
}

export interface ScoreDiagnostics {
  measures: ScoreMeasureDiagnostic[];
  firstPitchedMeasureByStaff: Record<string, number>;
}

export interface ParsedScore {
  events: ScoreEvent[];
  tempoChanges: TempoChange[];
  warnings: string[];
  diagnostics?: ScoreDiagnostics;
}

export interface LoadedScore {
  fileName: string;
  fileType: "mxl" | "xml" | "musicxml";
  xmlText: string;
  info: ScoreInfo;
}

export interface ScoreInfo {
  title?: string;
  composer?: string;
  movementTitle?: string;
  partCount: number;
}
