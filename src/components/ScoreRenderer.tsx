import { useEffect, useRef } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";

type CursorLike = {
  show: () => void;
  hide: () => void;
  reset: () => void;
  next: () => void;
};

interface ScoreRendererProps {
  xmlText?: string;
  currentEventIndex: number;
  onRenderStateChange: (state: { status: "empty" | "loading" | "ready" | "error"; error?: string }) => void;
}

export function ScoreRenderer({ xmlText, currentEventIndex, onRenderStateChange }: ScoreRendererProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    const scoreXml = xmlText;
    if (!container) {
      return;
    }

    container.innerHTML = "";
    osmdRef.current = null;

    if (!scoreXml) {
      onRenderStateChange({ status: "empty" });
      return;
    }

    async function renderScore(target: HTMLElement, sourceXml: string) {
      try {
        onRenderStateChange({ status: "loading" });
        const osmd = new OpenSheetMusicDisplay(target, {
          autoResize: true,
          backend: "svg",
          drawTitle: true,
        });
        await osmd.load(sourceXml);
        if (cancelled) {
          return;
        }
        await osmd.render();
        const cursor = (osmd as OpenSheetMusicDisplay & { cursor?: CursorLike }).cursor;
        cursor?.show();
        osmdRef.current = osmd;
        onRenderStateChange({ status: "ready" });
      } catch (error) {
        if (!cancelled) {
          onRenderStateChange({ status: "error", error: error instanceof Error ? error.message : "Score rendering failed." });
        }
      }
    }

    void renderScore(container, scoreXml);

    return () => {
      cancelled = true;
    };
  }, [xmlText, onRenderStateChange]);

  useEffect(() => {
    const osmd = osmdRef.current as (OpenSheetMusicDisplay & { cursor?: CursorLike }) | null;
    const cursor = osmd?.cursor;
    if (!cursor) {
      return;
    }

    cursor.reset();
    cursor.show();
    for (let index = 0; index < currentEventIndex; index += 1) {
      cursor.next();
    }
  }, [currentEventIndex]);

  return <div ref={containerRef} className="score-renderer" aria-label="Rendered sheet music" />;
}
