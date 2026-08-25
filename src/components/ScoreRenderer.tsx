import { useCallback, useEffect, useRef, useState } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { midiNoteToName } from "../music/note";

type CursorLike = {
  show: () => void;
  hide: () => void;
  reset: () => void;
  next: () => void;
  cursorElement?: HTMLElement;
};

interface ScoreRendererProps {
  xmlText?: string;
  currentEventIndex: number;
  wrongNotes: number[];
  onRenderStateChange: (state: { status: "empty" | "loading" | "ready" | "error"; error?: string }) => void;
}

interface OverlayPosition {
  left: number;
  top: number;
}

export function ScoreRenderer({ xmlText, currentEventIndex, wrongNotes, onRenderStateChange }: ScoreRendererProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const onRenderStateChangeRef = useRef(onRenderStateChange);
  const [wrongNotePosition, setWrongNotePosition] = useState<OverlayPosition>({ left: 24, top: 24 });

  useEffect(() => {
    onRenderStateChangeRef.current = onRenderStateChange;
  }, [onRenderStateChange]);

  const updateWrongNotePosition = useCallback(() => {
    const shell = shellRef.current;
    const cursor = (osmdRef.current as (OpenSheetMusicDisplay & { cursor?: CursorLike }) | null)?.cursor;
    const cursorElement = cursor?.cursorElement;

    if (!shell || !cursorElement) {
      setWrongNotePosition({ left: 24, top: 24 });
      return;
    }

    const shellRect = shell.getBoundingClientRect();
    const cursorRect = cursorElement.getBoundingClientRect();
    setWrongNotePosition({
      left: Math.max(12, cursorRect.left - shellRect.left + cursorRect.width + 8),
      top: Math.max(12, cursorRect.top - shellRect.top),
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    const scoreXml = xmlText;
    if (!container) {
      return;
    }

    container.innerHTML = "";
    osmdRef.current = null;
    setWrongNotePosition({ left: 24, top: 24 });

    if (!scoreXml) {
      onRenderStateChangeRef.current({ status: "empty" });
      return;
    }

    async function renderScore(target: HTMLElement, sourceXml: string) {
      try {
        onRenderStateChangeRef.current({ status: "loading" });
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
        updateWrongNotePosition();
        onRenderStateChangeRef.current({ status: "ready" });
      } catch (error) {
        if (!cancelled) {
          onRenderStateChangeRef.current({ status: "error", error: error instanceof Error ? error.message : "Score rendering failed." });
        }
      }
    }

    void renderScore(container, scoreXml);

    return () => {
      cancelled = true;
    };
  }, [xmlText, updateWrongNotePosition]);

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
    updateWrongNotePosition();
  }, [currentEventIndex, updateWrongNotePosition]);

  useEffect(() => {
    if (wrongNotes.length === 0) {
      return;
    }

    const frame = window.requestAnimationFrame(updateWrongNotePosition);
    return () => window.cancelAnimationFrame(frame);
  }, [wrongNotes, updateWrongNotePosition]);

  return (
    <div ref={shellRef} className="score-renderer-shell">
      <div ref={containerRef} className="score-renderer" aria-label="Rendered sheet music" />
      {wrongNotes.length > 0 ? (
        <div className="wrong-note-overlay" style={{ left: wrongNotePosition.left, top: wrongNotePosition.top }} aria-live="polite">
          <div className="wrong-note-marker" aria-hidden="true">!</div>
          <div className="wrong-note-labels">
            {wrongNotes.map((note) => (
              <span key={note}>{midiNoteToName(note)}</span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
