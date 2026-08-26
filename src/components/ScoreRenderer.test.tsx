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
  OpenSheetMusicDisplay: vi.fn().mockImplementation(function () {
    return {
      load: osmdMocks.load,
      render: osmdMocks.render,
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
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("does not reload OSMD when only the status callback identity changes", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} eventCount={1} wrongNotes={[]} onSelectedRangeChange={vi.fn()} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} eventCount={1} wrongNotes={[]} onSelectedRangeChange={vi.fn()} onRenderStateChange={vi.fn()} />);
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
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} eventCount={3} wrongNotes={[]} onSelectedRangeChange={vi.fn()} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={2} eventCount={3} wrongNotes={[]} onSelectedRangeChange={vi.fn()} onRenderStateChange={vi.fn()} />);
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
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} currentEvent={currentEvent} eventCount={1} wrongNotes={[]} onSelectedRangeChange={vi.fn()} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} currentEvent={currentEvent} eventCount={1} wrongNotes={[61]} onSelectedRangeChange={vi.fn()} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    expect(osmdMocks.load).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("C#4");
    expect(container.querySelector(".wrong-note-ghost")).not.toBeNull();
  });

  it("places wrong-note ghosts by diatonic staff position", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} currentEvent={currentEvent} eventCount={1} wrongNotes={[60, 61, 62, 64, 65, 67, 69]} onSelectedRangeChange={vi.fn()} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    const markers = Array.from(container.querySelectorAll<HTMLElement>(".wrong-note-ghost"));
    const tops = markers.map((marker) => parseFloat(marker.style.top));
    const [c, cSharp, d, e, f, g, a] = tops;
    const staffStep = d - c;

    expect(cSharp).toBeCloseTo(c);
    expect(e - c).toBeCloseTo(staffStep * 2);
    expect(f - c).toBeCloseTo(staffStep * 3);
    expect(g - c).toBeCloseTo(staffStep * 4);
    expect(a - c).toBeCloseTo(staffStep * 5);
  });
  it("selects a normalized range by dragging over transparent event targets", async () => {
    const onSelectedRangeChange = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} eventCount={3} wrongNotes={[]} onSelectedRangeChange={onSelectedRangeChange} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    const targets = Array.from(container.querySelectorAll<HTMLButtonElement>(".score-event-hit-zone"));
    expect(targets).toHaveLength(3);

    await act(async () => {
      targets[0].dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      targets[2].dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
      targets[2].dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });

    expect(onSelectedRangeChange).toHaveBeenLastCalledWith({ startIndex: 0, endIndex: 2 });
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
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} eventCount={6} selectedRange={{ startIndex: 1, endIndex: 4 }} wrongNotes={[]} onSelectedRangeChange={vi.fn()} onRenderStateChange={vi.fn()} />);
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
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} eventCount={3} selectedRange={{ startIndex: 0, endIndex: 1 }} wrongNotes={[]} onSelectedRangeChange={onSelectedRangeChange} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    const rightHandle = container.querySelector<HTMLButtonElement>(".score-selection-handle.end");
    const targets = Array.from(container.querySelectorAll<HTMLButtonElement>(".score-event-hit-zone"));
    expect(rightHandle).not.toBeNull();

    await act(async () => {
      rightHandle?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      targets[2].dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
      targets[2].dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });

    expect(onSelectedRangeChange).toHaveBeenLastCalledWith({ startIndex: 0, endIndex: 2 });
  });
});
