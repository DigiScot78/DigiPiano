export interface ScoreEvent {
  id: string;
  partId: string;
  measureNumber: number;
  startQuarter: number;
  durationQuarters: number;
  midiNotes: number[];
  staffNumbers: number[];
  voiceNumbers: string[];
  sourceNoteIds: string[];
  isRest?: boolean;
}

export interface ParsedScore {
  events: ScoreEvent[];
  warnings: string[];
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
