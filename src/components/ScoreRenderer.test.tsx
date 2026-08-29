import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScoreRenderer } from "./ScoreRenderer";
import type { ScoreEvent } from "../music/scoreTypes";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let cursorStep = 0;
let cursorRects: Array<{ left: number; top: number; width: number; height: number }> = [];
const defaultCursorRect = { left: 100, top: 120, width: 4, height: 48 };
const cursorElement = document.createElement("div");
cursorElement.getBoundingClientRect = vi.fn(() => {
  const configured = cursorRects[cursorStep];
  const rect = configured ?? { ...defaultCursorRect, left: defaultCursorRect.left + cursorStep * 32 };
  return {
    ...rect,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => undefined,
  };
});

const osmdState = vi.hoisted(() => ({
  graphicSheet: undefined as unknown,
}));

const osmdMocks = vi.hoisted(() => ({
  constructorOptions: [] as Array<Record<string, unknown>>,
  load: vi.fn(function () {
    return Promise.resolve();
  }),
  render: vi.fn(function () {
    return Promise.resolve();
  }),
  cursorShow: vi.fn(),
  cursorReset: vi.fn(() => {
    cursorStep = 0;
  }),
  cursorNext: vi.fn(() => {
    cursorStep += 1;
  }),
}));

vi.mock("opensheetmusicdisplay", () => ({
  Fraction: class Fraction {
    numerator: number;
    denominator: number;

    constructor(numerator: number, denominator: number) {
      this.numerator = numerator;
      this.denominator = denominator;
    }

    get RealValue() {
      return this.numerator / this.denominator;
    }
  },
  PointF2D: class PointF2D {
    x: number;
    y: number;

    constructor(x: number, y: number) {
      this.x = x;
      this.y = y;
    }
  },
  OpenSheetMusicDisplay: vi.fn().mockImplementation(function (_target: unknown, options: Record<string, unknown>) {
    osmdMocks.constructorOptions.push(options);
    return {
      load: osmdMocks.load,
      render: osmdMocks.render,
      GraphicSheet: osmdState.graphicSheet,
      cursor: {
        show: osmdMocks.cursorShow,
        hide: vi.fn(),
        reset: osmdMocks.cursorReset,
        next: osmdMocks.cursorNext,
        cursorElement,
      },
    };
  }),
}));

const currentEvent: ScoreEvent = {
  id: "event-1",
  partId: "P1",
  measureNumber: 1,
  startQuarter: 0,
  durationQuarters: 1,
  midiNotes: [60],
  staffNumbers: [1, 2],
  voiceNumbers: ["1"],
  sourceNoteIds: ["note-1"],
  noteDetails: [{ midiNote: 60, staffNumber: 1, voiceNumber: "1", sourceNoteId: "note-1" }],
};

describe("ScoreRenderer", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    cursorRects = [];
    osmdMocks.constructorOptions.length = 0;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = undefined;
    container?.remove();
    container = undefined;
    cursorStep = 0;
    cursorRects = [];
    osmdState.graphicSheet = undefined;
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("does not reload OSMD when only the status callback identity changes", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} eventCount={1} feedbackMarkers={[]} showCorrectNoteNames={true} showWrongNoteNames={true} onSelectedRangeChange={vi.fn()} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} eventCount={1} feedbackMarkers={[]} showCorrectNoteNames={true} showWrongNoteNames={true} onSelectedRangeChange={vi.fn()} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    expect(osmdMocks.load).toHaveBeenCalledTimes(1);
    expect(osmdMocks.render).toHaveBeenCalledTimes(1);
  });

  it("moves the cursor without reloading the score when the event index advances", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} eventCount={3} feedbackMarkers={[]} showCorrectNoteNames={true} showWrongNoteNames={true} onSelectedRangeChange={vi.fn()} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={2} eventCount={3} feedbackMarkers={[]} showCorrectNoteNames={true} showWrongNoteNames={true} onSelectedRangeChange={vi.fn()} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    expect(osmdMocks.load).toHaveBeenCalledTimes(1);
    expect(osmdMocks.cursorReset).toHaveBeenCalled();
    expect(osmdMocks.cursorNext).toHaveBeenCalled();
  });

  it("shows wrong-note ghosts without reloading the score", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} currentEvent={currentEvent} eventCount={1} feedbackMarkers={[]} showCorrectNoteNames={true} showWrongNoteNames={true} onSelectedRangeChange={vi.fn()} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} currentEvent={currentEvent} eventCount={1} feedbackMarkers={[61].map((note) => ({ note, kind: "wrong" as const }))} showCorrectNoteNames={true} showWrongNoteNames={true} onSelectedRangeChange={vi.fn()} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    expect(osmdMocks.load).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("C#4");
    expect(container.querySelector(".note-feedback.wrong")).not.toBeNull();
  });


  it("shows correct-note feedback in green without reloading the score", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} currentEvent={currentEvent} eventCount={1} feedbackMarkers={[]} showCorrectNoteNames={true} showWrongNoteNames={true} onSelectedRangeChange={vi.fn()} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} currentEvent={currentEvent} eventCount={1} feedbackMarkers={[{ note: 60, kind: "correct" }]} showCorrectNoteNames={true} showWrongNoteNames={true} onSelectedRangeChange={vi.fn()} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    expect(osmdMocks.load).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("C4");
    expect(container.querySelector(".note-feedback.correct")).not.toBeNull();
  });

  it("keeps completed correct feedback anchored to the previous event", async () => {
    const events = [
      { ...currentEvent, id: "event-1", midiNotes: [60] },
      { ...currentEvent, id: "event-2", startQuarter: 1, midiNotes: [64] },
    ];
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={1} currentEvent={events[1]} eventCount={2} events={events} feedbackMarkers={[]} completedFeedback={{ id: 1, eventIndex: 0, event: events[0], markers: [{ note: 60, kind: "correct", staffNumber: 1 }] }} showCorrectNoteNames={true} showWrongNoteNames={true} onSelectedRangeChange={vi.fn()} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    const completedMarker = container.querySelector<HTMLElement>(".note-feedback.correct.completed");
    const currentMarker = container.querySelector<HTMLElement>(".score-current-event-marker");
    expect(completedMarker).not.toBeNull();
    expect(parseFloat(completedMarker?.style.left ?? "0")).toBeLessThan(parseFloat(currentMarker?.style.left ?? "0"));
    expect(osmdMocks.load).toHaveBeenCalledTimes(1);
  });

  it("hides correct and wrong note names independently", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} currentEvent={currentEvent} eventCount={1} feedbackMarkers={[{ note: 60, kind: "correct" }, { note: 61, kind: "wrong" }]} showCorrectNoteNames={false} showWrongNoteNames={true} onSelectedRangeChange={vi.fn()} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    expect(container.querySelector(".note-feedback.correct")).not.toBeNull();
    expect(container.querySelector(".note-feedback.wrong")).not.toBeNull();
    expect(container.textContent).not.toContain("C4");
    expect(container.textContent).toContain("C#4");

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} currentEvent={currentEvent} eventCount={1} feedbackMarkers={[{ note: 60, kind: "correct" }, { note: 61, kind: "wrong" }]} showCorrectNoteNames={true} showWrongNoteNames={false} onSelectedRangeChange={vi.fn()} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    expect(container.textContent).toContain("C4");
    expect(container.textContent).not.toContain("C#4");
  });
  it("places wrong-note ghosts by diatonic staff position", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} currentEvent={currentEvent} eventCount={1} feedbackMarkers={[60, 61, 62, 64, 65, 67, 69].map((note) => ({ note, kind: "wrong" as const }))} showCorrectNoteNames={true} showWrongNoteNames={true} onSelectedRangeChange={vi.fn()} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    const markers = Array.from(container.querySelectorAll<HTMLElement>(".note-feedback"));
    const tops = markers.map((marker) => parseFloat(marker.style.top));
    const [c, cSharp, d, e, f, g, a] = tops;
    const staffStep = d - c;

    expect(cSharp).toBeCloseTo(c);
    expect(e - c).toBeCloseTo(staffStep * 2);
    expect(f - c).toBeCloseTo(staffStep * 3);
    expect(g - c).toBeCloseTo(staffStep * 4);
    expect(a - c).toBeCloseTo(staffStep * 5);
  });
  it("anchors middle C to the first ledger line below the rendered treble staff", async () => {
    const event = { ...currentEvent, staffNumbers: [1] };
    const staffEntry = {
      relInMeasureTimestamp: { RealValue: 0 },
      PositionAndShape: { AbsolutePosition: { x: 10, y: 12 } },
    };
    const measure = {
      staffEntries: [staffEntry],
      ParentStaffLine: {
        PositionAndShape: { AbsolutePosition: { x: 0, y: 8 } },
        StaffLines: [0, 1.2, 2.4, 3.6, 4.8].map((y) => ({ Start: { x: 0, y }, End: { x: 20, y } })),
      },
    };
    osmdState.graphicSheet = {
      findGraphicalMeasureByMeasureNumber: vi.fn(() => measure),
    };
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} currentEvent={event} eventCount={1} events={[event]} feedbackMarkers={[59, 60, 62].map((note) => ({ note, kind: "wrong" as const }))} showCorrectNoteNames={true} showWrongNoteNames={true} onSelectedRangeChange={vi.fn()} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    const [b3, c4, d4] = Array.from(container.querySelectorAll<HTMLElement>(".note-feedback")).map((marker) => parseFloat(marker.style.top));
    expect(c4).toBeCloseTo(140);
    expect(b3 - c4).toBeCloseTo(6);
    expect(c4 - d4).toBeCloseTo(6);
  });
  it("keeps adjacent feedback notes on the score-contextual staff", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    const twoStaffEvent: ScoreEvent = {
      ...currentEvent,
      midiNotes: [48, 60],
      staffNumbers: [1, 2],
      noteDetails: [
        { midiNote: 48, staffNumber: 2, voiceNumber: "1", sourceNoteId: "bass-c" },
        { midiNote: 60, staffNumber: 1, voiceNumber: "1", sourceNoteId: "treble-c" },
      ],
    };

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} currentEvent={twoStaffEvent} eventCount={1} feedbackMarkers={[{ note: 60, kind: "correct" }, { note: 59, kind: "wrong" }]} showCorrectNoteNames={true} showWrongNoteNames={true} onSelectedRangeChange={vi.fn()} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    const correctMarker = container.querySelector<HTMLElement>(".note-feedback.correct");
    const wrongMarker = container.querySelector<HTMLElement>(".note-feedback.wrong");
    const correctTop = parseFloat(correctMarker?.style.top ?? "0");
    const wrongTop = parseFloat(wrongMarker?.style.top ?? "0");

    expect(wrongTop).toBeGreaterThan(correctTop);
    expect(wrongTop - correctTop).toBeLessThan(8);
  });
  it("uses contextual treble and bass geometry for a split chord", async () => {
    const event: ScoreEvent = {
      ...currentEvent,
      midiNotes: [57, 64, 69],
      staffNumbers: [1, 2],
      noteDetails: [
        { midiNote: 57, staffNumber: 2, voiceNumber: "2", sourceNoteId: "a3" },
        { midiNote: 64, staffNumber: 1, voiceNumber: "1", sourceNoteId: "e4" },
        { midiNote: 69, staffNumber: 1, voiceNumber: "1", sourceNoteId: "a4" },
      ],
    };
    const staffEntry = {
      relInMeasureTimestamp: { RealValue: 0 },
      PositionAndShape: { AbsolutePosition: { x: 10, y: 12 } },
    };
    const measureForStaff = (staffNumber: number) => ({
      staffEntries: [staffEntry],
      ParentStaffLine: {
        PositionAndShape: { AbsolutePosition: { x: 0, y: staffNumber === 1 ? 8 : 24 } },
        StaffLines: [0, 1.2, 2.4, 3.6, 4.8].map((y) => ({ Start: { x: 0, y }, End: { x: 20, y } })),
      },
    });
    osmdState.graphicSheet = {
      findGraphicalMeasureByMeasureNumber: vi.fn((_measureNumber: number, staffIndex: number) => measureForStaff(staffIndex + 1)),
    };
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} currentEvent={event} eventCount={1} events={[event]} feedbackMarkers={[{ note: 57, kind: "correct", staffNumber: 2 }, { note: 60, kind: "wrong", staffNumber: 2 }, { note: 62, kind: "wrong", staffNumber: 1 }, { note: 64, kind: "correct", staffNumber: 1 }]} showCorrectNoteNames={true} showWrongNoteNames={true} onSelectedRangeChange={vi.fn()} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    const markers = Array.from(container.querySelectorAll<HTMLElement>(".note-feedback"));
    const [a3, c4, d4, e4] = markers.map((marker) => parseFloat(marker.style.top));
    expect(a3).toBeCloseTo(240);
    expect(c4).toBeCloseTo(228);
    expect(d4).toBeCloseTo(134);
    expect(e4).toBeCloseTo(128);
  });
  it("places lower-staff notes from that staff's active treble clef", async () => {
    const event: ScoreEvent = {
      ...currentEvent,
      midiNotes: [74, 76, 78],
      staffNumbers: [1, 2],
      noteDetails: [
        { midiNote: 74, staffNumber: 2, voiceNumber: "2", sourceNoteId: "d5", pitchStep: "D", pitchOctave: 5, clef: { sign: "G", line: 2, octaveChange: 0 } },
        { midiNote: 76, staffNumber: 1, voiceNumber: "1", sourceNoteId: "e5", pitchStep: "E", pitchOctave: 5, clef: { sign: "G", line: 2, octaveChange: 0 } },
        { midiNote: 78, staffNumber: 1, voiceNumber: "1", sourceNoteId: "fs5", pitchStep: "F", pitchAlter: 1, pitchOctave: 5, clef: { sign: "G", line: 2, octaveChange: 0 } },
      ],
    };
    const staffEntry = { relInMeasureTimestamp: { RealValue: 0 }, PositionAndShape: { AbsolutePosition: { x: 10, y: 12 } } };
    osmdState.graphicSheet = {
      findGraphicalMeasureByMeasureNumber: vi.fn((_measureNumber: number, staffIndex: number) => ({
        staffEntries: [staffEntry],
        ParentStaffLine: {
          PositionAndShape: { AbsolutePosition: { x: 0, y: staffIndex === 0 ? 8 : 24 } },
          StaffLines: [0, 1.2, 2.4, 3.6, 4.8].map((y) => ({ Start: { x: 0, y }, End: { x: 20, y } })),
        },
      })),
    };
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => { root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} currentEvent={event} eventCount={1} events={[event]} feedbackMarkers={[{ note: 74, kind: "correct", staffNumber: 2 }, { note: 76, kind: "correct", staffNumber: 1 }]} showCorrectNoteNames={true} showWrongNoteNames={true} onSelectedRangeChange={vi.fn()} onRenderStateChange={vi.fn()} />); await Promise.resolve(); });
    const [lowerD5, upperE5] = Array.from(container.querySelectorAll<HTMLElement>(".note-feedback")).map((marker) => parseFloat(marker.style.top));
    expect(lowerD5).toBeCloseTo(252);
    expect(upperE5).toBeCloseTo(86);
  });
  it("uses flat-key spelling for black-key wrong-note ghosts", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} currentEvent={{ ...currentEvent, keyFifths: -4 }} eventCount={1} feedbackMarkers={[68, 69, 73, 74].map((note) => ({ note, kind: "wrong" as const }))} showCorrectNoteNames={true} showWrongNoteNames={true} onSelectedRangeChange={vi.fn()} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    const markers = Array.from(container.querySelectorAll<HTMLElement>(".note-feedback"));
    const tops = markers.map((marker) => parseFloat(marker.style.top));
    const [aFlat, aNatural, dFlat, dNatural] = tops;

    expect(container.textContent).toContain("Ab4");
    expect(container.textContent).toContain("Db5");
    expect(container.textContent).not.toContain("G#4");
    expect(aFlat).toBeCloseTo(aNatural);
    expect(dFlat).toBeCloseTo(dNatural);
  });
  it("uses narrow graphical anchors instead of broad staff-entry spans", async () => {
    const events: ScoreEvent[] = [
      { ...currentEvent, id: "event-1", measureNumber: 1, startQuarter: 0, measureStartQuarter: 0 },
      { ...currentEvent, id: "event-2", measureNumber: 1, startQuarter: 1, measureStartQuarter: 0 },
    ];
    const staffEntries = [0, 0.25].map((timestamp, index) => ({
      relInMeasureTimestamp: { RealValue: timestamp },
      PositionAndShape: {
        AbsolutePosition: { x: 10 + index * 10, y: 12 },
        Size: { width: 12, height: 4.2 },
      },
      getAbsoluteStartAndEnd: () => [10 + index * 10, 80 + index * 10],
    }));
    osmdState.graphicSheet = {
      findGraphicalMeasureByMeasureNumber: vi.fn(() => ({ staffEntries })),
    };
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} currentEvent={events[0]} eventCount={events.length} events={events} selectedRange={{ startIndex: 0, endIndex: 0 }} feedbackMarkers={[]} showCorrectNoteNames={true} showWrongNoteNames={true} onSelectedRangeChange={vi.fn()} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    const currentMarker = container.querySelector<HTMLElement>(".score-current-event-marker");
    const selectedRect = container.querySelector<HTMLElement>(".score-selection-rect.committed");

    expect(currentMarker).not.toBeNull();
    expect(parseFloat(currentMarker?.style.width ?? "0")).toBe(24);
    expect(parseFloat(currentMarker?.style.height ?? "0")).toBe(192);
    expect(parseFloat(selectedRect?.style.width ?? "0")).toBeLessThan(80);
  });
  it("anchors the current marker to graphical event positions after skipped hand events", async () => {
    const events: ScoreEvent[] = [
      { ...currentEvent, id: "left-1", measureNumber: 1, startQuarter: 0, measureStartQuarter: 0, midiNotes: [58], staffNumbers: [2], noteDetails: [{ midiNote: 58, staffNumber: 2, voiceNumber: "1", sourceNoteId: "left-1" }] },
      { ...currentEvent, id: "right-1", measureNumber: 1, startQuarter: 1, measureStartQuarter: 0, midiNotes: [68], staffNumbers: [1], noteDetails: [{ midiNote: 68, staffNumber: 1, voiceNumber: "1", sourceNoteId: "right-1" }] },
      { ...currentEvent, id: "left-2", measureNumber: 1, startQuarter: 2, measureStartQuarter: 0, midiNotes: [62, 65], staffNumbers: [2], noteDetails: [{ midiNote: 62, staffNumber: 2, voiceNumber: "1", sourceNoteId: "left-2a" }, { midiNote: 65, staffNumber: 2, voiceNumber: "1", sourceNoteId: "left-2b" }] },
    ];
    const staffEntries = [0, 0.25, 0.5].map((timestamp, index) => ({
      relInMeasureTimestamp: { RealValue: timestamp },
      PositionAndShape: {
        AbsolutePosition: { x: 10 + index * 10, y: 12 },
        Size: { width: 2.8, height: 4.2 },
      },
      getAbsoluteStartAndEnd: () => [10 + index * 10, 12 + index * 10],
    }));
    osmdState.graphicSheet = {
      findGraphicalMeasureByMeasureNumber: vi.fn(() => ({ staffEntries })),
    };
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={2} currentEvent={events[2]} eventCount={events.length} events={events} feedbackMarkers={[59].map((note) => ({ note, kind: "wrong" as const }))} showCorrectNoteNames={true} showWrongNoteNames={true} onSelectedRangeChange={vi.fn()} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    const currentMarker = container.querySelector<HTMLElement>(".score-current-event-marker");
    const wrongMarker = container.querySelector<HTMLElement>(".note-feedback.wrong");

    expect(currentMarker).not.toBeNull();
    expect(parseFloat(currentMarker?.style.left ?? "0")).toBeGreaterThan(250);
    expect(parseFloat(wrongMarker?.style.left ?? "0")).toBeGreaterThan(250);
  });

  it("bounds a selected event halfway to its unselected neighbours", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={1} eventCount={3} selectedRange={{ startIndex: 1, endIndex: 1 }} feedbackMarkers={[]} showCorrectNoteNames={true} showWrongNoteNames={true} onSelectedRangeChange={vi.fn()} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    const selectedRect = container.querySelector<HTMLElement>(".score-selection-rect.committed");
    expect(parseFloat(selectedRect?.style.left ?? "0")).toBeCloseTo(118);
    expect(parseFloat(selectedRect?.style.width ?? "0")).toBeCloseTo(32);
  });

  it("dims the inactive hand across the score and clips it to a selected range", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} eventCount={3} handMode="right" feedbackMarkers={[]} showCorrectNoteNames={true} showWrongNoteNames={true} onSelectedRangeChange={vi.fn()} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    const fullScoreHandDim = container.querySelector<HTMLElement>(".score-selection-dim.inactive-hand");
    expect(fullScoreHandDim).not.toBeNull();
    const fullWidth = parseFloat(fullScoreHandDim?.style.width ?? "0");

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} eventCount={3} selectedRange={{ startIndex: 1, endIndex: 1 }} handMode="right" feedbackMarkers={[]} showCorrectNoteNames={true} showWrongNoteNames={true} onSelectedRangeChange={vi.fn()} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    const selectedHandDim = container.querySelector<HTMLElement>(".score-selection-dim.inactive-hand");
    expect(selectedHandDim).not.toBeNull();
    expect(parseFloat(selectedHandDim?.style.width ?? "0")).toBeLessThan(fullWidth);
    expect(container.querySelectorAll(".score-selection-dim.range").length).toBeGreaterThan(0);
  });
  it("selects a normalized range by dragging across the full score surface", async () => {
    const onSelectedRangeChange = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} eventCount={3} feedbackMarkers={[]} showCorrectNoteNames={true} showWrongNoteNames={true} onSelectedRangeChange={onSelectedRangeChange} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    const layer = container.querySelector<HTMLElement>(".score-selection-layer");
    expect(layer).not.toBeNull();

    await act(async () => {
      layer?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 90, clientY: 140 }));
      layer?.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 180, clientY: 140 }));
    });

    expect(onSelectedRangeChange).not.toHaveBeenCalled();
    const previewRect = container.querySelector<HTMLElement>(".score-selection-rect.dragging");
    expect(previewRect).not.toBeNull();
    expect(container.querySelectorAll(".score-selection-dim.range").length).toBeGreaterThan(0);
    expect(parseFloat(previewRect?.style.left ?? "0")).toBeCloseTo(90);
    expect(parseFloat(previewRect?.style.width ?? "0")).toBeCloseTo(90);

    await act(async () => {
      layer?.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 180, clientY: 140 }));
    });

    expect(onSelectedRangeChange).toHaveBeenLastCalledWith({ startIndex: 0, endIndex: 2 });

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} eventCount={3} selectedRange={{ startIndex: 0, endIndex: 2 }} feedbackMarkers={[]} showCorrectNoteNames={true} showWrongNoteNames={true} onSelectedRangeChange={onSelectedRangeChange} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });
    expect(container.querySelector<HTMLElement>(".score-selection-rect.committed")).not.toBeNull();
  });

  it("includes an event only after the smooth drag boundary crosses its center", async () => {
    const onSelectedRangeChange = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} eventCount={3} feedbackMarkers={[]} showCorrectNoteNames={true} showWrongNoteNames={true} onSelectedRangeChange={onSelectedRangeChange} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    const layer = container.querySelector<HTMLElement>(".score-selection-layer");
    await act(async () => {
      layer?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 90, clientY: 140 }));
      layer?.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 133, clientY: 140 }));
    });

    const beforeCrossingDims = Array.from(container.querySelectorAll<HTMLElement>(".score-selection-dim.range"))
      .map((rect) => rect.getAttribute("style"));
    const beforeCrossingGuideWidth = parseFloat(container.querySelector<HTMLElement>(".score-selection-rect.dragging")?.style.width ?? "0");

    await act(async () => {
      layer?.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 135, clientY: 140 }));
    });

    const afterCrossingDims = Array.from(container.querySelectorAll<HTMLElement>(".score-selection-dim.range"))
      .map((rect) => rect.getAttribute("style"));
    const afterCrossingGuideWidth = parseFloat(container.querySelector<HTMLElement>(".score-selection-rect.dragging")?.style.width ?? "0");
    expect(afterCrossingGuideWidth).toBeGreaterThan(beforeCrossingGuideWidth);
    expect(afterCrossingDims).not.toEqual(beforeCrossingDims);
    expect(onSelectedRangeChange).not.toHaveBeenCalled();

    await act(async () => {
      layer?.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 135, clientY: 140 }));
    });
    expect(onSelectedRangeChange).toHaveBeenLastCalledWith({ startIndex: 0, endIndex: 1 });
  });

  it("keeps treble and bass anchors in one selection segment for the same system", async () => {
    cursorRects = [
      { left: 100, top: 120, width: 4, height: 48 },
      { left: 132, top: 180, width: 4, height: 48 },
      { left: 164, top: 120, width: 4, height: 48 },
      { left: 196, top: 180, width: 4, height: 48 },
    ];
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} eventCount={4} selectedRange={{ startIndex: 0, endIndex: 3 }} feedbackMarkers={[]} showCorrectNoteNames={true} showWrongNoteNames={true} onSelectedRangeChange={vi.fn()} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    const selectedRects = Array.from(container.querySelectorAll<HTMLElement>(".score-selection-rect.committed"));
    expect(selectedRects).toHaveLength(1);
    expect(parseFloat(selectedRects[0].style.height)).toBeGreaterThan(100);
  });
  it("renders separate selection segments across systems", async () => {
    cursorRects = [
      { left: 100, top: 120, width: 4, height: 48 },
      { left: 132, top: 120, width: 4, height: 48 },
      { left: 164, top: 120, width: 4, height: 48 },
      { left: 92, top: 220, width: 4, height: 48 },
      { left: 124, top: 220, width: 4, height: 48 },
      { left: 156, top: 220, width: 4, height: 48 },
    ];
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} eventCount={6} selectedRange={{ startIndex: 1, endIndex: 4 }} feedbackMarkers={[]} showCorrectNoteNames={true} showWrongNoteNames={true} onSelectedRangeChange={vi.fn()} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    const selectedRects = Array.from(container.querySelectorAll<HTMLElement>(".score-selection-rect.committed"));
    expect(selectedRects).toHaveLength(2);

    const firstBottom = parseFloat(selectedRects[0].style.top) + parseFloat(selectedRects[0].style.height);
    const secondTop = parseFloat(selectedRects[1].style.top);
    expect(firstBottom).toBeCloseTo(secondTop);
  });

  it("resizes a committed selection from the right edge", async () => {
    const onSelectedRangeChange = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} eventCount={3} selectedRange={{ startIndex: 0, endIndex: 1 }} feedbackMarkers={[]} showCorrectNoteNames={true} showWrongNoteNames={true} onSelectedRangeChange={onSelectedRangeChange} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    const rightHandle = container.querySelector<HTMLButtonElement>(".score-selection-handle.end");
    const layer = container.querySelector<HTMLElement>(".score-selection-layer");
    expect(rightHandle).not.toBeNull();
    expect(layer).not.toBeNull();

    await act(async () => {
      rightHandle?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 160, clientY: 140 }));
      layer?.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 180, clientY: 140 }));
    });

    expect(onSelectedRangeChange).not.toHaveBeenCalled();
    expect(container.querySelector(".score-selection-rect.dragging")).not.toBeNull();
    expect(container.querySelectorAll(".score-selection-dim.range").length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".score-selection-handle")).toHaveLength(0);

    await act(async () => {
      layer?.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 180, clientY: 140 }));
    });

    expect(onSelectedRangeChange).toHaveBeenLastCalledWith({ startIndex: 0, endIndex: 2 });
  });

  it("uses a click to seek while preserving and respecting an existing selection", async () => {
    const onEventSeek = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={1} eventCount={3} selectedRange={{ startIndex: 1, endIndex: 2 }} feedbackMarkers={[]} showCorrectNoteNames={true} showWrongNoteNames={true} onSelectedRangeChange={vi.fn()} onEventSeek={onEventSeek} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });
    const layer = container.querySelector<HTMLElement>(".score-selection-layer");
    await act(async () => {
      layer?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 90, clientY: 140 }));
      layer?.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, button: 0, clientX: 90, clientY: 140 }));
    });
    expect(onEventSeek).not.toHaveBeenCalled();
    await act(async () => {
      layer?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 140, clientY: 140 }));
      layer?.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, button: 0, clientX: 140, clientY: 140 }));
    });
    expect(onEventSeek).toHaveBeenCalledWith(1);
  });

  it("rerenders OSMD and refreshes anchors when the score width changes", async () => {
    let resizeCallback: ResizeObserverCallback | undefined;
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: ResizeObserverCallback) { resizeCallback = callback; }
      observe() { /* driven explicitly by this test */ }
      disconnect() { /* no-op */ }
      unobserve() { /* no-op */ }
    });
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} eventCount={2} feedbackMarkers={[]} showCorrectNoteNames={true} showWrongNoteNames={true} onSelectedRangeChange={vi.fn()} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });
    const resizeEntry = (width: number) => ({ contentRect: { width } }) as ResizeObserverEntry;
    await act(async () => {
      resizeCallback?.([resizeEntry(800)], {} as ResizeObserver);
      resizeCallback?.([resizeEntry(1000)], {} as ResizeObserver);
      await vi.advanceTimersByTimeAsync(80);
      await Promise.resolve();
    });
    expect(osmdMocks.load).toHaveBeenCalledTimes(1);
    expect(osmdMocks.render).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("renders score practice controls and keeps at least one hand enabled", async () => {
    const onHandModeChange = vi.fn();
    const onRunModeChange = vi.fn();
    const onPlayModeChange = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} eventCount={3} handMode="right" runMode="once" playMode="play" feedbackMarkers={[]} showCorrectNoteNames={true} showWrongNoteNames={true} onSelectedRangeChange={vi.fn()} onHandModeChange={onHandModeChange} onRunModeChange={onRunModeChange} onPlayModeChange={onPlayModeChange} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    const rightHand = container.querySelector<HTMLButtonElement>('[aria-label="Toggle right hand"]');
    const leftHand = container.querySelector<HTMLButtonElement>('[aria-label="Toggle left hand"]');
    const loop = container.querySelector<HTMLButtonElement>('[aria-label="Loop selected range"]');
    const playOptions = container.querySelector<HTMLButtonElement>('[aria-label="Choose play mode"]');
    expect(playOptions?.querySelector("path")).not.toBeNull();
    expect(playOptions?.querySelector("circle")).toBeNull();
    expect(rightHand?.getAttribute("aria-pressed")).toBe("true");
    expect(rightHand?.getAttribute("aria-disabled")).toBe("true");
    expect(leftHand?.getAttribute("aria-pressed")).toBe("false");

    await act(async () => {
      rightHand?.click();
      leftHand?.click();
      loop?.click();
      playOptions?.click();
    });

    expect(onHandModeChange).toHaveBeenCalledTimes(1);
    expect(onHandModeChange).toHaveBeenCalledWith("both");
    expect(onRunModeChange).toHaveBeenCalledWith("loop");
    const practice = container.querySelector<HTMLInputElement>('input[value="practice"]');
    await act(async () => practice?.click());
    expect(onPlayModeChange).toHaveBeenCalledWith("practice");
  });

  it("shows the remaining notes while playback is waiting", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} eventCount={1} playbackPhase="waiting-note" waitingForNotes={[60, 64]} feedbackMarkers={[]} showCorrectNoteNames={true} showWrongNoteNames={true} onSelectedRangeChange={vi.fn()} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });
    expect(container.querySelector(".playback-overlay.note-wait")?.textContent).toContain("Waiting forC4 + E4");
  });

  it("configures OSMD with the selected score page colours", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} eventCount={1} scoreTheme="night" feedbackMarkers={[]} showCorrectNoteNames={true} showWrongNoteNames={true} onSelectedRangeChange={vi.fn()} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    expect(osmdMocks.constructorOptions.at(-1)).toMatchObject({
      defaultColorMusic: "#e8edf2",
      defaultColorLabel: "#e8edf2",
      defaultColorTitle: "#e8edf2",
      pageBackgroundColor: "#00000000",
    });
  });
});
