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
  OpenSheetMusicDisplay: vi.fn().mockImplementation(function () {
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
    expect(container.querySelector(".score-selection-rect.dragging")).not.toBeNull();

    await act(async () => {
      layer?.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 180, clientY: 140 }));
    });

    expect(onSelectedRangeChange).toHaveBeenLastCalledWith({ startIndex: 0, endIndex: 2 });
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

    await act(async () => {
      layer?.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 180, clientY: 140 }));
    });

    expect(onSelectedRangeChange).toHaveBeenLastCalledWith({ startIndex: 0, endIndex: 2 });
  });
});
