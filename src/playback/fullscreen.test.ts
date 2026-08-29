import { describe, expect, it, vi } from "vitest";
import { PlaybackFullscreenController, type FullscreenDocument } from "./fullscreen";

function fullscreenDocument() {
  const target: { requestFullscreen?: () => Promise<void> } = {};
  const document: FullscreenDocument = { documentElement: target, fullscreenElement: null, exitFullscreen: vi.fn(async () => { document.fullscreenElement = null; }) };
  return { document, target };
}

describe("playback fullscreen", () => {
  it("reports unavailable and preserves pre-existing fullscreen", async () => {
    const controller = new PlaybackFullscreenController();
    const { document } = fullscreenDocument();
    expect(await controller.enter(document)).toBe("unavailable");
    document.fullscreenElement = {};
    expect(await controller.enter(document)).toBe("already-fullscreen");
    await controller.exit(document);
    expect(document.exitFullscreen).not.toHaveBeenCalled();
  });

  it("exits fullscreen only when it owns the session", async () => {
    const controller = new PlaybackFullscreenController();
    const { document, target } = fullscreenDocument();
    target.requestFullscreen = vi.fn(async () => { document.fullscreenElement = target; });
    expect(await controller.enter(document)).toBe("entered");
    await controller.exit(document);
    expect(document.exitFullscreen).toHaveBeenCalledOnce();
  });

  it("does not exit after the user leaves fullscreen", async () => {
    const controller = new PlaybackFullscreenController();
    const { document, target } = fullscreenDocument();
    target.requestFullscreen = vi.fn(async () => { document.fullscreenElement = target; });
    await controller.enter(document);
    document.fullscreenElement = null;
    controller.handleFullscreenChange(document);
    await controller.exit(document);
    expect(document.exitFullscreen).not.toHaveBeenCalled();
  });

  it("cancels and reverses a late fullscreen request", async () => {
    const controller = new PlaybackFullscreenController();
    const { document, target } = fullscreenDocument();
    let resolve!: () => void;
    target.requestFullscreen = vi.fn(() => new Promise<void>((done) => { resolve = () => { document.fullscreenElement = target; done(); }; }));
    const entering = controller.enter(document);
    await controller.exit(document);
    resolve();
    expect(await entering).toBe("cancelled");
    expect(document.exitFullscreen).toHaveBeenCalledOnce();
  });
});
