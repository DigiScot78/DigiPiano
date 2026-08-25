import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScoreRenderer } from "./ScoreRenderer";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const osmdMocks = vi.hoisted(() => ({
  load: vi.fn(function () {
    return Promise.resolve();
  }),
  render: vi.fn(function () {
    return Promise.resolve();
  }),
  cursorShow: vi.fn(),
  cursorReset: vi.fn(),
  cursorNext: vi.fn(),
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
      },
    };
  }),
}));

describe("ScoreRenderer", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = undefined;
    container?.remove();
    container = undefined;
    vi.clearAllMocks();
  });

  it("does not reload OSMD when only the status callback identity changes", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} onRenderStateChange={vi.fn()} />);
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
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={0} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    await act(async () => {
      root?.render(<ScoreRenderer xmlText="<score-partwise />" currentEventIndex={2} onRenderStateChange={vi.fn()} />);
      await Promise.resolve();
    });

    expect(osmdMocks.load).toHaveBeenCalledTimes(1);
    expect(osmdMocks.cursorReset).toHaveBeenCalled();
    expect(osmdMocks.cursorNext).toHaveBeenCalledTimes(2);
  });
});

