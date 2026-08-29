export type FullscreenEntryResult = "entered" | "already-fullscreen" | "unavailable" | "failed" | "cancelled";

interface FullscreenTarget {
  requestFullscreen?: () => Promise<void>;
}

export interface FullscreenDocument {
  documentElement: FullscreenTarget;
  fullscreenElement: unknown;
  exitFullscreen?: () => Promise<void>;
}

export class PlaybackFullscreenController {
  private requestVersion = 0;
  private ownsFullscreen = false;

  async enter(document: FullscreenDocument): Promise<FullscreenEntryResult> {
    if (document.fullscreenElement) return "already-fullscreen";
    if (typeof document.documentElement.requestFullscreen !== "function") return "unavailable";
    const version = ++this.requestVersion;
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      return version === this.requestVersion ? "failed" : "cancelled";
    }
    if (version !== this.requestVersion) {
      if (document.fullscreenElement === document.documentElement) await document.exitFullscreen?.().catch(() => undefined);
      return "cancelled";
    }
    this.ownsFullscreen = document.fullscreenElement === document.documentElement;
    return this.ownsFullscreen ? "entered" : "failed";
  }

  async exit(document: FullscreenDocument): Promise<void> {
    ++this.requestVersion;
    const shouldExit = this.ownsFullscreen && document.fullscreenElement === document.documentElement;
    this.ownsFullscreen = false;
    if (shouldExit) await document.exitFullscreen?.().catch(() => undefined);
  }

  handleFullscreenChange(document: FullscreenDocument): void {
    if (document.fullscreenElement !== document.documentElement) this.ownsFullscreen = false;
  }
}
