import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { midiNoteToName } from "../music/note";
import type { ScoreSelectionRange } from "../learning/matcher";
import { normalizeSelectionRange } from "../learning/matcher";

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
  eventCount: number;
  selectedRange?: ScoreSelectionRange;
  wrongNotes: number[];
  onSelectedRangeChange: (range: ScoreSelectionRange | undefined) => void;
  onRenderStateChange: (state: { status: "empty" | "loading" | "ready" | "error"; error?: string }) => void;
}

interface OverlayPosition {
  left: number;
  top: number;
}

interface EventPosition extends OverlayPosition {
  index: number;
  height: number;
}

export function ScoreRenderer({
  xmlText,
  currentEventIndex,
  eventCount,
  selectedRange,
  wrongNotes,
  onSelectedRangeChange,
  onRenderStateChange,
}: ScoreRendererProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const dragStartRef = useRef<number | null>(null);
  const currentEventIndexRef = useRef(currentEventIndex);
  const onRenderStateChangeRef = useRef(onRenderStateChange);
  const [wrongNotePosition, setWrongNotePosition] = useState<OverlayPosition>({ left: 24, top: 24 });
  const [eventPositions, setEventPositions] = useState<EventPosition[]>([]);
  const [draftRange, setDraftRange] = useState<ScoreSelectionRange | undefined>();

  useEffect(() => {
    onRenderStateChangeRef.current = onRenderStateChange;
  }, [onRenderStateChange]);

  useEffect(() => {
    currentEventIndexRef.current = currentEventIndex;
  }, [currentEventIndex]);

  const positionCursor = useCallback((index: number) => {
    const cursor = (osmdRef.current as (OpenSheetMusicDisplay & { cursor?: CursorLike }) | null)?.cursor;
    if (!cursor) {
      return;
    }

    cursor.reset();
    cursor.show();
    for (let eventIndex = 0; eventIndex < index; eventIndex += 1) {
      cursor.next();
    }
  }, []);

  const cursorPosition = useCallback((): OverlayPosition | null => {
    const shell = shellRef.current;
    const cursor = (osmdRef.current as (OpenSheetMusicDisplay & { cursor?: CursorLike }) | null)?.cursor;
    const cursorElement = cursor?.cursorElement;

    if (!shell || !cursorElement) {
      return null;
    }

    const shellRect = shell.getBoundingClientRect();
    const cursorRect = cursorElement.getBoundingClientRect();
    return {
      left: Math.max(12, cursorRect.left - shellRect.left + cursorRect.width + 8),
      top: Math.max(12, cursorRect.top - shellRect.top),
    };
  }, []);

  const updateWrongNotePosition = useCallback(() => {
    setWrongNotePosition(cursorPosition() ?? { left: 24, top: 24 });
  }, [cursorPosition]);

  const refreshEventPositions = useCallback(() => {
    const shell = shellRef.current;
    const cursor = (osmdRef.current as (OpenSheetMusicDisplay & { cursor?: CursorLike }) | null)?.cursor;
    const cursorElement = cursor?.cursorElement;

    if (!shell || !cursor || !cursorElement || eventCount <= 0) {
      setEventPositions([]);
      return;
    }

    const shellRect = shell.getBoundingClientRect();
    const positions: EventPosition[] = [];
    cursor.reset();
    cursor.show();

    for (let index = 0; index < eventCount; index += 1) {
      const rect = cursorElement.getBoundingClientRect();
      positions.push({
        index,
        left: Math.max(0, rect.left - shellRect.left),
        top: Math.max(0, rect.top - shellRect.top),
        height: Math.max(42, rect.height || 42),
      });
      cursor.next();
    }

    setEventPositions(positions);
    positionCursor(currentEventIndexRef.current);
    updateWrongNotePosition();
  }, [eventCount, positionCursor, updateWrongNotePosition]);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    const scoreXml = xmlText;
    if (!container) {
      return;
    }

    container.innerHTML = "";
    osmdRef.current = null;
    setEventPositions([]);
    setDraftRange(undefined);
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
        window.requestAnimationFrame(refreshEventPositions);
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
  }, [xmlText, refreshEventPositions]);

  useEffect(() => {
    positionCursor(currentEventIndex);
    updateWrongNotePosition();
  }, [currentEventIndex, positionCursor, updateWrongNotePosition]);

  useEffect(() => {
    if (eventCount === 0) {
      setEventPositions([]);
      return;
    }

    const frame = window.requestAnimationFrame(refreshEventPositions);
    return () => window.cancelAnimationFrame(frame);
  }, [eventCount, refreshEventPositions]);

  useEffect(() => {
    if (wrongNotes.length === 0) {
      return;
    }

    const frame = window.requestAnimationFrame(updateWrongNotePosition);
    return () => window.cancelAnimationFrame(frame);
  }, [wrongNotes, updateWrongNotePosition]);

  useEffect(() => {
    const finishDrag = () => {
      dragStartRef.current = null;
    };

    window.addEventListener("mouseup", finishDrag);
    return () => window.removeEventListener("mouseup", finishDrag);
  }, []);

  const visibleRange = draftRange ?? selectedRange;
  const selectedIndexes = useMemo(() => {
    if (!visibleRange) {
      return new Set<number>();
    }

    const indexes = new Set<number>();
    for (let index = visibleRange.startIndex; index <= visibleRange.endIndex; index += 1) {
      indexes.add(index);
    }
    return indexes;
  }, [visibleRange]);

  const beginSelection = (index: number) => {
    dragStartRef.current = index;
    const nextRange = normalizeSelectionRange(index, index, eventCount);
    setDraftRange(nextRange);
    onSelectedRangeChange(nextRange);
  };

  const updateSelection = (index: number) => {
    if (dragStartRef.current === null) {
      return;
    }

    const nextRange = normalizeSelectionRange(dragStartRef.current, index, eventCount);
    setDraftRange(nextRange);
    onSelectedRangeChange(nextRange);
  };

  const finishSelection = (index: number) => {
    if (dragStartRef.current === null) {
      return;
    }

    const nextRange = normalizeSelectionRange(dragStartRef.current, index, eventCount);
    dragStartRef.current = null;
    setDraftRange(undefined);
    onSelectedRangeChange(nextRange);
  };

  return (
    <div ref={shellRef} className="score-renderer-shell">
      <div ref={containerRef} className="score-renderer" aria-label="Rendered sheet music" />
      <div className="score-selection-layer" aria-label="Score event selection layer">
        {eventPositions.map((position) => (
          <button
            key={position.index}
            type="button"
            className={`score-event-hit-zone${selectedIndexes.has(position.index) ? " selected" : ""}${position.index === currentEventIndex ? " current" : ""}`}
            style={{ left: position.left - 10, top: position.top, height: position.height }}
            aria-label={`Score event ${position.index + 1}`}
            onMouseDown={(event) => {
              event.preventDefault();
              beginSelection(position.index);
            }}
            onMouseEnter={() => updateSelection(position.index)}
            onMouseUp={() => finishSelection(position.index)}
          />
        ))}
      </div>
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
