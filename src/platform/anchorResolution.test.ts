import { describe, expect, it } from "vitest";
import type { ScoreEvent } from "../music/scoreTypes";
import { SCORE_ANCHOR_SCHEMA_VERSION, type ScoreAnchorDto } from "./domain";
import { resolveScoreAnchor } from "./anchorResolution";

const event = (id: string, quarter: number, sourceNoteId: string, voice = "1"): ScoreEvent => ({ id, partId: "P1", measureNumber: 2, startQuarter: quarter, durationQuarters: 1, midiNotes: [60], staffNumbers: [1], voiceNumbers: [voice], sourceNoteIds: [sourceNoteId], noteDetails: [{ midiNote: 60, staffNumber: 1, voiceNumber: voice, sourceNoteId }] });
const anchor = (overrides: Partial<ScoreAnchorDto> = {}): ScoreAnchorDto => ({ schemaVersion: SCORE_ANCHOR_SCHEMA_VERSION, scoreVersionId: "sv1", partId: "P1", measureNumber: 2, absoluteQuarter: 4, staffNumber: 1, sourceNoteId: "note-b", cachedEventIndex: 999, ...overrides });

describe("resolveScoreAnchor", () => {
  it("uses durable musical identity and ignores a stale cached event index", () => {
    expect(resolveScoreAnchor(anchor(), "sv1", [event("a", 4, "note-a"), event("b", 4, "note-b")])).toEqual({ status: "resolved", eventIndex: 1, noteIndex: 0 });
  });

  it("rejects a different immutable score version", () => {
    expect(resolveScoreAnchor(anchor(), "sv2", [event("b", 4, "note-b")])).toEqual({ status: "needs-repair", reason: "score-version-mismatch" });
  });

  it("reports ambiguous and missing positions instead of jumping", () => {
    const withoutSource = anchor({ sourceNoteId: undefined });
    expect(resolveScoreAnchor(withoutSource, "sv1", [event("a", 4, "note-a"), event("b", 4, "note-b")])).toEqual({ status: "needs-repair", reason: "ambiguous" });
    expect(resolveScoreAnchor(anchor({ absoluteQuarter: 8 }), "sv1", [event("b", 4, "note-b")])).toEqual({ status: "needs-repair", reason: "not-found" });
  });

  it("can resolve an event-level chord anchor without inventing a note", () => {
    const chord = { ...event("chord", 4, "n1"), midiNotes: [60, 64], sourceNoteIds: ["n1", "n2"], noteDetails: [event("x", 4, "n1").noteDetails[0], { ...event("x", 4, "n2").noteDetails[0], midiNote: 64 }] };
    expect(resolveScoreAnchor(anchor({ sourceNoteId: undefined }), "sv1", [chord])).toEqual({ status: "resolved", eventIndex: 0 });
  });
});
