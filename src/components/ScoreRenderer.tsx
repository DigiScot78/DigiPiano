import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { midiNoteToName } from "../music/note";
import type { ScoreSelectionRange } from "../learning/matcher";
import { normalizeSelectionRange } from "../learning/matcher";
import type { ScoreEvent } from "../music/scoreTypes";

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
  currentEvent?: ScoreEvent;
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
  width: number;
  height: number;
}

interface OverlayRect extends OverlayPosition {
  width: number;
  height: number;
}

type ResizeEdge = "start" | "end";
type InteractionMode = "idle" | "selecting" | "resizing-start" | "resizing-end";

export function ScoreRenderer({
  xmlText,
  currentEventIndex,
  currentEvent,
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
  const resizeEdgeRef = useRef<ResizeEdge | null>(null);
  const currentEventIndexRef = useRef(currentEventIndex);
  const onRenderStateChangeRef = useRef(onRenderStateChange);
  const [eventPositions, setEventPositions] = useState<EventPosition[]>([]);
  const [draftRange, setDraftRange] = useState<ScoreSelectionRange | undefined>();
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("idle");

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
        width: Math.max(24, rect.width || 24),
        height: Math.max(42, rect.height || 42),
      });
      cursor.next();
    }

    setEventPositions(positions);
    positionCursor(currentEventIndexRef.current);
  }, [eventCount, positionCursor]);

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
    setInteractionMode("idle");

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
  }, [currentEventIndex, positionCursor]);

  useEffect(() => {
    if (eventCount === 0) {
      setEventPositions([]);
      return;
    }

    const frame = window.requestAnimationFrame(refreshEventPositions);
    return () => window.cancelAnimationFrame(frame);
  }, [eventCount, refreshEventPositions]);

  useEffect(() => {
    const finishPointerAction = () => {
      dragStartRef.current = null;
      resizeEdgeRef.current = null;
      setDraftRange(undefined);
      setInteractionMode("idle");
    };

    window.addEventListener("mouseup", finishPointerAction);
    return () => window.removeEventListener("mouseup", finishPointerAction);
  }, []);

  const visibleRange = draftRange ?? selectedRange;
  const selectionRect = useMemo(() => rectForRange(visibleRange, eventPositions), [eventPositions, visibleRange]);
  const isDragging = draftRange !== undefined && interactionMode === "selecting";
  const currentPosition = eventPositions.find((position) => position.index === currentEventIndex);
  const wrongNoteMarkers = useMemo(
    () => wrongNotes.map((note) => markerForWrongNote(note, currentPosition, currentEvent)),
    [currentEvent, currentPosition, wrongNotes],
  );

  const beginSelection = (index: number) => {
    resizeEdgeRef.current = null;
    setInteractionMode("selecting");
    dragStartRef.current = index;
    const nextRange = normalizeSelectionRange(index, index, eventCount);
    setDraftRange(nextRange);
    onSelectedRangeChange(nextRange);
  };

  const updateSelection = (index: number) => {
    if (resizeEdgeRef.current && selectedRange) {
      const nextRange = resizeEdgeRef.current === "start"
        ? normalizeSelectionRange(index, selectedRange.endIndex, eventCount)
        : normalizeSelectionRange(selectedRange.startIndex, index, eventCount);
      setDraftRange(nextRange);
      onSelectedRangeChange(nextRange);
      return;
    }

    if (dragStartRef.current === null) {
      return;
    }

    const nextRange = normalizeSelectionRange(dragStartRef.current, index, eventCount);
    setDraftRange(nextRange);
    onSelectedRangeChange(nextRange);
  };

  const finishSelection = (index: number) => {
    if (resizeEdgeRef.current && selectedRange) {
      const nextRange = resizeEdgeRef.current === "start"
        ? normalizeSelectionRange(index, selectedRange.endIndex, eventCount)
        : normalizeSelectionRange(selectedRange.startIndex, index, eventCount);
      resizeEdgeRef.current = null;
      setInteractionMode("idle");
      setDraftRange(undefined);
      onSelectedRangeChange(nextRange);
      return;
    }

    if (dragStartRef.current === null) {
      return;
    }

    const nextRange = normalizeSelectionRange(dragStartRef.current, index, eventCount);
    dragStartRef.current = null;
    setInteractionMode("idle");
    setDraftRange(undefined);
    onSelectedRangeChange(nextRange);
  };

  const beginResize = (edge: ResizeEdge) => {
    resizeEdgeRef.current = edge;
    setInteractionMode(edge === "start" ? "resizing-start" : "resizing-end");
    dragStartRef.current = null;
    setDraftRange(selectedRange);
  };

  return (
    <div ref={shellRef} className="score-renderer-shell">
      <div ref={containerRef} className="score-renderer" aria-label="Rendered sheet music" />
      <div className="score-selection-visual-layer" aria-hidden="true">
        {selectionRect ? (
          <div
            className={`score-selection-rect${isDragging ? " dragging" : ""}${selectedRange && !isDragging ? " committed" : ""}`}
            style={rectStyle(selectionRect)}
          />
        ) : null}
      </div>
      <div className="score-selection-layer" aria-label="Score event selection layer">
        {eventPositions.map((position) => (
          <button
            key={position.index}
            type="button"
            className="score-event-hit-zone"
            style={{ left: position.left - 12, top: position.top, height: position.height }}
            aria-label={`Score event ${position.index + 1}`}
            onMouseDown={(event) => {
              event.preventDefault();
              beginSelection(position.index);
            }}
            onMouseEnter={() => updateSelection(position.index)}
            onMouseUp={() => finishSelection(position.index)}
          />
        ))}
        {selectionRect && selectedRange && !isDragging ? (
          <>
            <button
              type="button"
              className="score-selection-handle start"
              style={{ left: selectionRect.left, top: selectionRect.top, height: selectionRect.height }}
              aria-label="Resize selected range start"
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                beginResize("start");
              }}
            />
            <button
              type="button"
              className="score-selection-handle end"
              style={{ left: selectionRect.left + selectionRect.width, top: selectionRect.top, height: selectionRect.height }}
              aria-label="Resize selected range end"
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                beginResize("end");
              }}
            />
          </>
        ) : null}
      </div>
      <div className="wrong-note-ghost-layer" aria-live="polite">
        {wrongNoteMarkers.map((marker) => (
          <div key={marker.note} className="wrong-note-ghost" style={{ left: marker.left, top: marker.top }} aria-label={`Wrong note ${midiNoteToName(marker.note)}`}>
            <span className="wrong-note-head" aria-hidden="true" />
            <span className="wrong-note-name">{midiNoteToName(marker.note)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function rectForRange(range: ScoreSelectionRange | undefined, positions: EventPosition[]): OverlayRect | undefined {
  if (!range) {
    return undefined;
  }

  const selected = positions.filter((position) => position.index >= range.startIndex && position.index <= range.endIndex);
  if (selected.length === 0) {
    return undefined;
  }

  const left = Math.min(...selected.map((position) => position.left)) - 16;
  const top = Math.min(...selected.map((position) => position.top)) - 10;
  const right = Math.max(...selected.map((position) => position.left + position.width)) + 34;
  const bottom = Math.max(...selected.map((position) => position.top + position.height)) + 10;

  return {
    left: Math.max(0, left),
    top: Math.max(0, top),
    width: Math.max(28, right - left),
    height: Math.max(42, bottom - top),
  };
}

function rectStyle(rect: OverlayRect): React.CSSProperties {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function markerForWrongNote(note: number, currentPosition: EventPosition | undefined, currentEvent: ScoreEvent | undefined): { note: number; left: number; top: number } {
  const position = currentPosition ?? { left: 24, top: 24, width: 24, height: 96, index: 0 };
  const staffNumber = staffForWrongNote(note, currentEvent);
  const staffTop = position.top + (staffNumber === 2 ? position.height * 0.56 : position.height * 0.12);
  const referenceMidi = staffNumber === 2 ? 48 : 60;
  const y = staffTop + 24 - (note - referenceMidi) * 3.3;

  return {
    note,
    left: position.left + Math.max(10, position.width + 8),
    top: Math.max(4, y),
  };
}

function staffForWrongNote(note: number, currentEvent: ScoreEvent | undefined): number {
  const eventStaves = new Set(currentEvent?.staffNumbers ?? []);
  if (eventStaves.size === 1) {
    return Array.from(eventStaves)[0] ?? 1;
  }
  if (eventStaves.has(1) && eventStaves.has(2)) {
    return note < 60 ? 2 : 1;
  }
  return note < 60 ? 2 : 1;
}
