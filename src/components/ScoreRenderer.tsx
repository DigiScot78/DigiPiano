import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Fraction, OpenSheetMusicDisplay, PointF2D } from "opensheetmusicdisplay";
import { midiNoteToName } from "../music/note";
import type { NoteFeedbackMarker, ScoreSelectionRange } from "../learning/matcher";
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
  events?: ScoreEvent[];
  selectedRange?: ScoreSelectionRange;
  feedbackMarkers: NoteFeedbackMarker[];
  showCorrectNoteNames: boolean;
  showWrongNoteNames: boolean;
  onSelectedRangeChange: (range: ScoreSelectionRange | undefined) => void;
  onRenderStateChange: (state: { status: "empty" | "loading" | "ready" | "error"; error?: string }) => void;
}

interface OverlayPosition {
  left: number;
  top: number;
}

interface OverlaySize {
  width: number;
  height: number;
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

interface DragPoint extends OverlayPosition {
  rowIndex: number;
}

type ResizeEdge = "start" | "end";
type InteractionMode = "idle" | "selecting" | "resizing-start" | "resizing-end";

const SYSTEM_WRAP_LEFT_TOLERANCE = 48;
const SYSTEM_WRAP_TOP_TOLERANCE = 28;
const EMPTY_SCORE_EVENTS: ScoreEvent[] = [];

export function ScoreRenderer({
  xmlText,
  currentEventIndex,
  currentEvent,
  eventCount,
  events = EMPTY_SCORE_EVENTS,
  selectedRange,
  feedbackMarkers,
  showCorrectNoteNames,
  showWrongNoteNames,
  onSelectedRangeChange,
  onRenderStateChange,
}: ScoreRendererProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const dragStartRef = useRef<DragPoint | null>(null);
  const resizeEdgeRef = useRef<ResizeEdge | null>(null);
  const currentEventIndexRef = useRef(currentEventIndex);
  const onRenderStateChangeRef = useRef(onRenderStateChange);
  const [eventPositions, setEventPositions] = useState<EventPosition[]>([]);
  const [overlaySize, setOverlaySize] = useState<OverlaySize>({ width: 0, height: 0 });
  const [draftRange, setDraftRange] = useState<ScoreSelectionRange | undefined>();
  const [dragStartPoint, setDragStartPoint] = useState<DragPoint | undefined>();
  const [dragEndPoint, setDragEndPoint] = useState<DragPoint | undefined>();
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("idle");
  const [usesGraphicEventPositions, setUsesGraphicEventPositions] = useState(false);

  useEffect(() => {
    onRenderStateChangeRef.current = onRenderStateChange;
  }, [onRenderStateChange]);

  useEffect(() => {
    currentEventIndexRef.current = currentEventIndex;
  }, [currentEventIndex]);

  const hideNativeCursor = useCallback(() => {
    const cursor = (osmdRef.current as (OpenSheetMusicDisplay & { cursor?: CursorLike }) | null)?.cursor;
    cursor?.hide();
  }, []);

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
      setOverlaySize({ width: 0, height: 0 });
      setUsesGraphicEventPositions(false);
      return;
    }

    const shellRect = shell.getBoundingClientRect();
    const positionsFromGraphicSheet = eventPositionsFromGraphicSheet(osmdRef.current, shell, events);
    if (positionsFromGraphicSheet.length === eventCount) {
      setEventPositions(positionsFromGraphicSheet);
      setOverlaySize({
        width: Math.max(shell.scrollWidth, shell.clientWidth, shellRect.width),
        height: Math.max(shell.scrollHeight, shell.clientHeight, shellRect.height),
      });
      setUsesGraphicEventPositions(true);
      hideNativeCursor();
      return;
    }

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
    setOverlaySize({
      width: Math.max(shell.scrollWidth, shell.clientWidth, shellRect.width),
      height: Math.max(shell.scrollHeight, shell.clientHeight, shellRect.height),
    });
    setUsesGraphicEventPositions(false);
    positionCursor(currentEventIndexRef.current);
  }, [eventCount, events, hideNativeCursor, positionCursor]);

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
    setOverlaySize({ width: 0, height: 0 });
    setUsesGraphicEventPositions(false);
    setDraftRange(undefined);
    setDragStartPoint(undefined);
    setDragEndPoint(undefined);
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
          newSystemFromXML: true,
          newSystemFromNewPageInXML: true,
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
    if (usesGraphicEventPositions) {
      hideNativeCursor();
      return;
    }

    positionCursor(currentEventIndex);
  }, [currentEventIndex, hideNativeCursor, positionCursor, usesGraphicEventPositions]);

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
      setDragStartPoint(undefined);
      setDragEndPoint(undefined);
      setInteractionMode("idle");
    };

    window.addEventListener("mouseup", finishPointerAction);
    return () => window.removeEventListener("mouseup", finishPointerAction);
  }, []);

  const systemRows = useMemo(() => rowsForPositions(eventPositions), [eventPositions]);
  const isPointerPreview = dragStartPoint !== undefined && (interactionMode === "selecting" || interactionMode === "resizing-start" || interactionMode === "resizing-end");
  const visibleRange = isPointerPreview ? undefined : draftRange ?? selectedRange;
  const rangeSelectionRects = useMemo(() => rectsForRange(visibleRange, eventPositions, systemRows), [eventPositions, systemRows, visibleRange]);
  const effectiveOverlaySize = useMemo(() => effectiveSizeForRows(overlaySize, systemRows), [overlaySize, systemRows]);
  const dragSelectionRects = useMemo(() => rectsForDrag(dragStartPoint, dragEndPoint, systemRows, effectiveOverlaySize), [dragEndPoint, dragStartPoint, effectiveOverlaySize, systemRows]);
  const selectionRects = isPointerPreview ? dragSelectionRects : rangeSelectionRects;
  const committedDimRects = useMemo(
    () => (selectedRange && interactionMode === "idle" ? dimRectsForSelection(selectionRects, effectiveOverlaySize) : []),
    [effectiveOverlaySize, interactionMode, selectedRange, selectionRects],
  );
  const isDragging = isPointerPreview;
  const currentPosition = eventPositions.find((position) => position.index === currentEventIndex);
  const noteFeedbackMarkers = useMemo(
    () => feedbackMarkers.map((feedback) => markerForNoteFeedback(feedback, currentPosition, currentEvent)),
    [currentEvent, currentPosition, feedbackMarkers],
  );

  const pointFromPointerEvent = (event: React.PointerEvent<HTMLElement>): DragPoint | undefined => {
    const shell = shellRef.current;
    if (!shell || systemRows.length === 0) {
      return undefined;
    }

    const shellRect = shell.getBoundingClientRect();
    const point = {
      left: clamp(event.clientX - shellRect.left, 0, effectiveOverlaySize.width),
      top: clamp(event.clientY - shellRect.top, 0, effectiveOverlaySize.height),
    };
    return { ...point, rowIndex: nearestRowIndexForPoint(point, systemRows) };
  };

  const rangeForPoint = (point: DragPoint): ScoreSelectionRange | undefined => {
    const index = nearestEventIndexForPoint(point, systemRows);
    if (index === undefined) {
      return undefined;
    }

    if (resizeEdgeRef.current && selectedRange) {
      return resizeEdgeRef.current === "start"
        ? normalizeSelectionRange(index, selectedRange.endIndex, eventCount)
        : normalizeSelectionRange(selectedRange.startIndex, index, eventCount);
    }

    const startIndex = dragStartRef.current ? nearestEventIndexForPoint(dragStartRef.current, systemRows) : undefined;
    return startIndex === undefined ? undefined : normalizeSelectionRange(startIndex, index, eventCount);
  };

  const beginSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || eventPositions.length === 0) {
      return;
    }

    const point = pointFromPointerEvent(event);
    if (!point) {
      return;
    }

    event.preventDefault();
    capturePointer(event.currentTarget, event.pointerId);
    resizeEdgeRef.current = null;
    dragStartRef.current = point;
    setDragStartPoint(point);
    setDragEndPoint(point);
    setDraftRange(undefined);
    setInteractionMode("selecting");
  };

  const updatePointerSelection = (event: React.PointerEvent<HTMLElement>) => {
    const point = pointFromPointerEvent(event);
    if (!point) {
      return;
    }

    if (interactionMode === "selecting" && dragStartRef.current) {
      setDragEndPoint(point);
      return;
    }

    if ((interactionMode === "resizing-start" || interactionMode === "resizing-end") && selectedRange) {
      setDragEndPoint(point);
    }
  };

  const finishPointerSelection = (event: React.PointerEvent<HTMLElement>) => {
    const point = pointFromPointerEvent(event);
    const nextRange = point ? rangeForPoint(point) : undefined;

    dragStartRef.current = null;
    resizeEdgeRef.current = null;
    setDragStartPoint(undefined);
    setDragEndPoint(undefined);
    setDraftRange(undefined);
    setInteractionMode("idle");

    releasePointer(event.currentTarget, event.pointerId);

    if (nextRange) {
      onSelectedRangeChange(nextRange);
    }
  };

  const beginResize = (edge: ResizeEdge, event: React.PointerEvent<HTMLButtonElement>) => {
    const movingPoint = pointFromPointerEvent(event);
    const fixedPoint = selectedRange ? dragPointForSelectionEdge(selectedRange, edge === "start" ? "end" : "start", eventPositions, systemRows) : undefined;
    if (!movingPoint || !fixedPoint) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    capturePointer(event.currentTarget, event.pointerId);
    resizeEdgeRef.current = edge;
    setInteractionMode(edge === "start" ? "resizing-start" : "resizing-end");
    dragStartRef.current = null;
    setDragStartPoint(fixedPoint);
    setDragEndPoint(movingPoint);
    setDraftRange(undefined);
  };

  const startHandleRect = rangeSelectionRects[0];
  const endHandleRect = rangeSelectionRects[rangeSelectionRects.length - 1];

  return (
    <div ref={shellRef} className="score-renderer-shell">
      <div ref={containerRef} className="score-renderer" aria-label="Rendered sheet music" />
      <div className="score-selection-visual-layer" aria-hidden="true">
        {committedDimRects.map((rect, index) => (
          <div key={`dim-${index}`} className="score-selection-dim" style={rectStyle(rect)} />
        ))}
        {selectionRects.map((rect, index) => (
          <div
            key={`selection-${index}`}
            className={`score-selection-rect${isDragging ? " dragging" : ""}${selectedRange && !isDragging ? " committed" : ""}`}
            style={rectStyle(rect)}
          />
        ))}
        {currentPosition ? <div className="score-current-event-marker" style={rectStyle(currentPosition)} /> : null}
      </div>
      <div
        className="score-selection-layer"
        aria-label="Score selection layer"
        onPointerDown={beginSelection}
        onPointerMove={updatePointerSelection}
        onPointerUp={finishPointerSelection}
        onPointerCancel={finishPointerSelection}
      >
        {startHandleRect && endHandleRect && selectedRange && interactionMode !== "selecting" ? (
          <>
            <button
              type="button"
              className="score-selection-handle start"
              style={{ left: startHandleRect.left, top: startHandleRect.top, height: startHandleRect.height }}
              aria-label="Resize selected range start"
              onPointerDown={(event) => beginResize("start", event)}
              onPointerMove={updatePointerSelection}
              onPointerUp={finishPointerSelection}
              onPointerCancel={finishPointerSelection}
            />
            <button
              type="button"
              className="score-selection-handle end"
              style={{ left: endHandleRect.left + endHandleRect.width, top: endHandleRect.top, height: endHandleRect.height }}
              aria-label="Resize selected range end"
              onPointerDown={(event) => beginResize("end", event)}
              onPointerMove={updatePointerSelection}
              onPointerUp={finishPointerSelection}
              onPointerCancel={finishPointerSelection}
            />
          </>
        ) : null}
      </div>
      <div className="note-feedback-layer" aria-live="polite">
        {noteFeedbackMarkers.map((marker) => (
          <div key={`${marker.kind}-${marker.note}`} className={`note-feedback ${marker.kind}`} style={{ left: marker.left, top: marker.top }} aria-label={`${marker.kind === "correct" ? "Correct" : "Wrong"} note ${marker.name}`}>
            <span className="note-feedback-head" aria-hidden="true" />
            {shouldShowNoteName(marker.kind, showCorrectNoteNames, showWrongNoteNames) ? <span className="note-feedback-name">{marker.name}</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

type GraphicalSheetLike = {
  findGraphicalMeasureByMeasureNumber?: (measureNumber: number, staffIndex: number) => GraphicalMeasureLike | undefined;
  svgToDom?: (point: PointF2D) => PointF2D;
};

type GraphicalMeasureLike = {
  staffEntries?: GraphicalStaffEntryLike[];
  findGraphicalStaffEntryFromTimestamp?: (timestamp: Fraction) => GraphicalStaffEntryLike | undefined;
  PositionAndShape?: BoundingBoxLike;
};

type GraphicalStaffEntryLike = {
  relInMeasureTimestamp?: { RealValue?: number };
  PositionAndShape?: BoundingBoxLike;
  getAbsoluteStartAndEnd?: () => [number, number];
};

type BoundingBoxLike = {
  AbsolutePosition?: { x?: number; y?: number };
  Center?: { x?: number; y?: number };
  Size?: { width?: number; height?: number };
};

const OSMD_UNIT_TO_CSS_PIXEL = 10;

function eventPositionsFromGraphicSheet(osmd: OpenSheetMusicDisplay | null, shell: HTMLElement, events: ScoreEvent[]): EventPosition[] {
  const graphicSheet = osmd?.GraphicSheet as GraphicalSheetLike | undefined;
  if (!graphicSheet || events.length === 0) {
    return [];
  }

  const positions = events.map((event, index) => positionForEvent(graphicSheet, shell, event, index));
  return positions.every((position): position is EventPosition => position !== undefined) ? positions : [];
}

function positionForEvent(graphicSheet: GraphicalSheetLike, shell: HTMLElement, event: ScoreEvent, index: number): EventPosition | undefined {
  const staffNumbers = event.staffNumbers.length > 0 ? event.staffNumbers : [event.noteDetails[0]?.staffNumber ?? 1];
  const entries = staffNumbers
    .map((staffNumber) => graphicalEntryForEvent(graphicSheet, event, staffNumber))
    .filter((entry): entry is GraphicalStaffEntryLike => entry !== undefined);

  if (entries.length === 0) {
    return undefined;
  }

  const rects = entries
    .map((entry) => rectForGraphicalEntry(graphicSheet, shell, entry))
    .filter((rect): rect is OverlayRect => rect !== undefined);

  if (rects.length === 0) {
    return undefined;
  }

  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.left + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.top + rect.height));

  return {
    index,
    left,
    top,
    width: Math.max(24, right - left),
    height: Math.max(42, bottom - top),
  };
}

function graphicalEntryForEvent(graphicSheet: GraphicalSheetLike, event: ScoreEvent, staffNumber: number): GraphicalStaffEntryLike | undefined {
  const measure = graphicSheet.findGraphicalMeasureByMeasureNumber?.(event.measureNumber, Math.max(0, staffNumber - 1));
  if (!measure) {
    return undefined;
  }

  const relativeQuarter = Math.max(0, event.startQuarter - (event.measureStartQuarter ?? 0));
  const relativeTimestamp = fractionFromQuarters(relativeQuarter);
  return measure.findGraphicalStaffEntryFromTimestamp?.(relativeTimestamp) ?? nearestStaffEntry(measure, relativeQuarter / 4);
}

function nearestStaffEntry(measure: GraphicalMeasureLike, relativeWholeNote: number): GraphicalStaffEntryLike | undefined {
  const entries = measure.staffEntries ?? [];
  if (entries.length === 0) {
    return undefined;
  }

  return entries.reduce((nearest, entry) => {
    const nearestDistance = Math.abs((nearest.relInMeasureTimestamp?.RealValue ?? 0) - relativeWholeNote);
    const entryDistance = Math.abs((entry.relInMeasureTimestamp?.RealValue ?? 0) - relativeWholeNote);
    return entryDistance < nearestDistance ? entry : nearest;
  }, entries[0]);
}

function rectForGraphicalEntry(graphicSheet: GraphicalSheetLike, shell: HTMLElement, entry: GraphicalStaffEntryLike): OverlayRect | undefined {
  const position = entry.PositionAndShape?.AbsolutePosition ?? entry.PositionAndShape?.Center;
  if (position?.x === undefined || position.y === undefined) {
    return undefined;
  }

  const domPoint = pointToShellPosition(graphicSheet, shell, position.x, position.y);
  const height = Math.max(42, (entry.PositionAndShape?.Size?.height ?? 4.2) * OSMD_UNIT_TO_CSS_PIXEL);

  return {
    left: Math.max(0, domPoint.left - 12),
    top: Math.max(0, domPoint.top - height * 0.25),
    width: 24,
    height,
  };
}

function pointToShellPosition(graphicSheet: GraphicalSheetLike, shell: HTMLElement, x: number, y: number): OverlayPosition {
  const shellRect = shell.getBoundingClientRect();
  const scaledX = x * OSMD_UNIT_TO_CSS_PIXEL;
  const scaledY = y * OSMD_UNIT_TO_CSS_PIXEL;

  try {
    const domPoint = graphicSheet.svgToDom?.(new PointF2D(scaledX, scaledY));
    if (domPoint?.x !== undefined && domPoint.y !== undefined) {
      return {
        left: domPoint.x - shellRect.left,
        top: domPoint.y - shellRect.top,
      };
    }
  } catch {
    // Fall back to OSMD's documented unit scale when svgToDom is unavailable in tests or unusual backends.
  }

  return { left: scaledX, top: scaledY };
}

function fractionFromQuarters(quarters: number): Fraction {
  const denominator = 4096;
  return new Fraction(Math.round((quarters / 4) * denominator), denominator);
}
function rectsForRange(range: ScoreSelectionRange | undefined, positions: EventPosition[], rows = rowsForPositions(positions)): OverlayRect[] {
  if (!range) {
    return [];
  }

  const selected = positions.filter((position) => position.index >= range.startIndex && position.index <= range.endIndex);
  if (selected.length === 0) {
    return [];
  }

  const firstSelectedRow = rowIndexForPosition(rows, selected[0]);
  const lastSelectedRow = rowIndexForPosition(rows, selected[selected.length - 1]);

  return rows
    .map((row, rowIndex) => {
      const selectedInRow = selected.filter((position) => row.positions.includes(position));
      if (selectedInRow.length === 0) {
        return undefined;
      }

      const left = rowIndex === firstSelectedRow ? Math.min(...selectedInRow.map((position) => position.left)) - 16 : row.left - 16;
      const right = rowIndex === lastSelectedRow ? Math.max(...selectedInRow.map((position) => position.left + position.width)) + 34 : row.right + 34;
      const previousRow = rows[rowIndex - 1];
      const nextRow = rows[rowIndex + 1];
      const top = previousRow ? midpoint(previousRow.bottom, row.top) : row.top - 24;
      const bottom = nextRow ? midpoint(row.bottom, nextRow.top) : row.bottom + 24;

      return {
        left: Math.max(0, left),
        top: Math.max(0, top),
        width: Math.max(28, right - left),
        height: Math.max(42, bottom - top),
      };
    })
    .filter((rect): rect is OverlayRect => rect !== undefined);
}

function midpoint(a: number, b: number): number {
  return a + (b - a) / 2;
}

function effectiveSizeForRows(size: OverlaySize, rows: ScoreRow[]): OverlaySize {
  if (rows.length === 0) {
    return size;
  }

  return {
    width: Math.max(size.width, ...rows.map((row) => row.right + 34)),
    height: Math.max(size.height, ...rows.map((row, index) => visualBoundsForRow(rows, index).bottom)),
  };
}

function rectsForDrag(start: DragPoint | undefined, end: DragPoint | undefined, rows: ScoreRow[], size: OverlaySize): OverlayRect[] {
  if (!start || !end || rows.length === 0 || size.width <= 0 || size.height <= 0) {
    return [];
  }

  const startRowIndex = clamp(start.rowIndex, 0, rows.length - 1);
  const endRowIndex = clamp(end.rowIndex, 0, rows.length - 1);
  const firstRowIndex = Math.min(startRowIndex, endRowIndex);
  const lastRowIndex = Math.max(startRowIndex, endRowIndex);
  const forward = startRowIndex < endRowIndex || (startRowIndex === endRowIndex && start.left <= end.left);

  const rects: OverlayRect[] = [];
  for (let rowIndex = firstRowIndex; rowIndex <= lastRowIndex; rowIndex += 1) {
    const row = rows[rowIndex];
    const bounds = visualBoundsForRow(rows, rowIndex);
    const rowLeft = Math.max(0, row.left - 16);
    const rowRight = Math.min(size.width, row.right + 34);
    let left = rowLeft;
    let right = rowRight;

    if (startRowIndex === endRowIndex) {
      left = Math.min(start.left, end.left);
      right = Math.max(start.left, end.left);
    } else if (rowIndex === startRowIndex) {
      left = forward ? start.left : rowLeft;
      right = forward ? rowRight : start.left;
    } else if (rowIndex === endRowIndex) {
      left = forward ? rowLeft : end.left;
      right = forward ? end.left : rowRight;
    }

    left = clamp(left, 0, size.width);
    right = clamp(right, 0, size.width);
    rects.push({
      left: Math.min(left, right),
      top: bounds.top,
      width: Math.max(2, Math.abs(right - left)),
      height: bounds.bottom - bounds.top,
    });
  }

  return rects;
}

function nearestRowIndexForPoint(point: OverlayPosition, rows: ScoreRow[]): number {
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  rows.forEach((row, index) => {
    const bounds = visualBoundsForRow(rows, index);
    const distance = point.top >= bounds.top && point.top <= bounds.bottom
      ? 0
      : Math.min(Math.abs(point.top - bounds.top), Math.abs(point.top - bounds.bottom));
    if (distance < nearestDistance) {
      nearestIndex = index;
      nearestDistance = distance;
    }
  });

  return nearestIndex;
}

function dragPointForSelectionEdge(range: ScoreSelectionRange, edge: ResizeEdge, positions: EventPosition[], rows: ScoreRow[]): DragPoint | undefined {
  const position = positions.find((candidate) => candidate.index === (edge === "start" ? range.startIndex : range.endIndex));
  if (!position) {
    return undefined;
  }

  const point = {
    left: edge === "start" ? position.left : position.left + position.width,
    top: position.top + position.height / 2,
  };
  return { ...point, rowIndex: nearestRowIndexForPoint(point, rows) };
}

function nearestEventIndexForPoint(point: DragPoint, rows: ScoreRow[]): number | undefined {
  const row = rows[point.rowIndex];
  if (!row) {
    return undefined;
  }

  return row.positions.reduce((nearest, position) => {
    const nearestDistance = Math.abs(eventCenterX(nearest) - point.left);
    const positionDistance = Math.abs(eventCenterX(position) - point.left);
    return positionDistance < nearestDistance ? position : nearest;
  }, row.positions[0])?.index;
}

function visualBoundsForRow(rows: ScoreRow[], rowIndex: number): { top: number; bottom: number } {
  const row = rows[rowIndex];
  const previousRow = rows[rowIndex - 1];
  const nextRow = rows[rowIndex + 1];
  return {
    top: Math.max(0, previousRow ? midpoint(previousRow.bottom, row.top) : row.top - 24),
    bottom: nextRow ? midpoint(row.bottom, nextRow.top) : row.bottom + 24,
  };
}

function eventCenterX(position: EventPosition): number {
  return position.left + position.width / 2;
}

function capturePointer(element: HTMLElement, pointerId: number): void {
  if (Number.isFinite(pointerId) && element.setPointerCapture) {
    element.setPointerCapture(pointerId);
  }
}

function releasePointer(element: HTMLElement, pointerId: number): void {
  if (Number.isFinite(pointerId) && element.hasPointerCapture?.(pointerId)) {
    element.releasePointerCapture(pointerId);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function dimRectsForSelection(selectionRects: OverlayRect[], size: OverlaySize): OverlayRect[] {
  if (selectionRects.length === 0 || size.width <= 0 || size.height <= 0) {
    return [];
  }

  const sorted = [...selectionRects].sort((a, b) => a.top - b.top || a.left - b.left);
  const dimRects: OverlayRect[] = [];
  let previousBottom = 0;

  for (const rect of sorted) {
    if (rect.top > previousBottom) {
      dimRects.push({ left: 0, top: previousBottom, width: size.width, height: rect.top - previousBottom });
    }
    if (rect.left > 0) {
      dimRects.push({ left: 0, top: rect.top, width: rect.left, height: rect.height });
    }
    const rightStart = rect.left + rect.width;
    if (rightStart < size.width) {
      dimRects.push({ left: rightStart, top: rect.top, width: size.width - rightStart, height: rect.height });
    }
    previousBottom = Math.max(previousBottom, rect.top + rect.height);
  }

  if (previousBottom < size.height) {
    dimRects.push({ left: 0, top: previousBottom, width: size.width, height: size.height - previousBottom });
  }

  return dimRects;
}

type ScoreRow = { top: number; bottom: number; left: number; right: number; positions: EventPosition[] };

function rowsForPositions(positions: EventPosition[]): ScoreRow[] {
  const rows: ScoreRow[] = [];
  let currentRow: ScoreRow | undefined;
  let previousPosition: EventPosition | undefined;

  for (const position of [...positions].sort((a, b) => a.index - b.index)) {
    const wrappedToNextSystem = previousPosition !== undefined
      && position.left < previousPosition.left - SYSTEM_WRAP_LEFT_TOLERANCE
      && position.top > previousPosition.top + SYSTEM_WRAP_TOP_TOLERANCE;

    if (!currentRow || wrappedToNextSystem) {
      currentRow = {
        top: position.top,
        bottom: position.top + position.height,
        left: position.left,
        right: position.left + position.width,
        positions: [position],
      };
      rows.push(currentRow);
      previousPosition = position;
      continue;
    }

    currentRow.top = Math.min(currentRow.top, position.top);
    currentRow.bottom = Math.max(currentRow.bottom, position.top + position.height);
    currentRow.left = Math.min(currentRow.left, position.left);
    currentRow.right = Math.max(currentRow.right, position.left + position.width);
    currentRow.positions.push(position);
    previousPosition = position;
  }

  return rows;
}

function rowIndexForPosition(rows: Array<{ positions: EventPosition[] }>, position: EventPosition): number {
  return Math.max(0, rows.findIndex((row) => row.positions.includes(position)));
}

function rectStyle(rect: OverlayRect): React.CSSProperties {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function shouldShowNoteName(kind: NoteFeedbackMarker["kind"], showCorrectNoteNames: boolean, showWrongNoteNames: boolean): boolean {
  return kind === "correct" ? showCorrectNoteNames : showWrongNoteNames;
}

function markerForNoteFeedback(feedback: NoteFeedbackMarker, currentPosition: EventPosition | undefined, currentEvent: ScoreEvent | undefined): { note: number; kind: NoteFeedbackMarker["kind"]; name: string; left: number; top: number } {
  const note = feedback.note;
  const position = currentPosition ?? { left: 24, top: 24, width: 24, height: 96, index: 0 };
  const staffNumber = staffForWrongNote(note, currentEvent);
  const spelling = spellingForWrongNote(note, staffNumber, currentEvent);
  const staffTop = position.top + (staffNumber === 2 ? position.height * 0.56 : position.height * 0.12);
  const reference = { step: "C", alter: 0, octave: staffNumber === 2 ? 3 : 4 };
  const halfLineSpacing = Math.max(3, Math.min(5.5, position.height / 14.5));
  const y = staffTop + 24 + halfLineSpacing - diatonicStepDistance(reference, spelling) * halfLineSpacing;

  return {
    note,
    kind: feedback.kind,
    name: nameForSpelling(spelling) ?? midiNoteToName(note),
    left: position.left + Math.max(10, position.width + 8),
    top: Math.max(4, y),
  };
}

type PitchSpelling = {
  step: string;
  alter: number;
  octave: number;
};

function spellingForWrongNote(note: number, staffNumber: number, currentEvent: ScoreEvent | undefined): PitchSpelling {
  const matchingScoreNote = currentEvent?.noteDetails.find(
    (detail) => detail.midiNote === note && detail.staffNumber === staffNumber && detail.pitchStep && detail.pitchOctave !== undefined,
  ) ?? currentEvent?.noteDetails.find((detail) => detail.midiNote === note && detail.pitchStep && detail.pitchOctave !== undefined);

  if (matchingScoreNote?.pitchStep && matchingScoreNote.pitchOctave !== undefined) {
    return {
      step: matchingScoreNote.pitchStep,
      alter: matchingScoreNote.pitchAlter ?? 0,
      octave: matchingScoreNote.pitchOctave,
    };
  }

  return spellingForMidiInKey(note, currentEvent?.keyFifths ?? 0);
}

function spellingForMidiInKey(note: number, keyFifths: number): PitchSpelling {
  const octave = Math.floor(note / 12) - 1;
  const pitchClass = ((note % 12) + 12) % 12;
  const spellings = keyFifths < 0 ? FLAT_PITCH_CLASS_SPELLINGS : SHARP_PITCH_CLASS_SPELLINGS;
  const spelling = spellings[pitchClass];
  return { ...spelling, octave };
}

function nameForSpelling(spelling: PitchSpelling): string | undefined {
  const accidental = spelling.alter === 0 ? "" : spelling.alter > 0 ? "#".repeat(spelling.alter) : "b".repeat(Math.abs(spelling.alter));
  return `${spelling.step}${accidental}${spelling.octave}`;
}

function diatonicStepDistance(from: PitchSpelling, to: PitchSpelling): number {
  return diatonicPositionForSpelling(to) - diatonicPositionForSpelling(from);
}

function diatonicPositionForSpelling(spelling: PitchSpelling): number {
  return spelling.octave * 7 + letterIndexForStep(spelling.step);
}

function letterIndexForStep(step: string): number {
  const index = ["C", "D", "E", "F", "G", "A", "B"].indexOf(step.toUpperCase());
  return index >= 0 ? index : 0;
}

const SHARP_PITCH_CLASS_SPELLINGS: PitchSpelling[] = [
  { step: "C", alter: 0, octave: 0 },
  { step: "C", alter: 1, octave: 0 },
  { step: "D", alter: 0, octave: 0 },
  { step: "D", alter: 1, octave: 0 },
  { step: "E", alter: 0, octave: 0 },
  { step: "F", alter: 0, octave: 0 },
  { step: "F", alter: 1, octave: 0 },
  { step: "G", alter: 0, octave: 0 },
  { step: "G", alter: 1, octave: 0 },
  { step: "A", alter: 0, octave: 0 },
  { step: "A", alter: 1, octave: 0 },
  { step: "B", alter: 0, octave: 0 },
];

const FLAT_PITCH_CLASS_SPELLINGS: PitchSpelling[] = [
  { step: "C", alter: 0, octave: 0 },
  { step: "D", alter: -1, octave: 0 },
  { step: "D", alter: 0, octave: 0 },
  { step: "E", alter: -1, octave: 0 },
  { step: "E", alter: 0, octave: 0 },
  { step: "F", alter: 0, octave: 0 },
  { step: "G", alter: -1, octave: 0 },
  { step: "G", alter: 0, octave: 0 },
  { step: "A", alter: -1, octave: 0 },
  { step: "A", alter: 0, octave: 0 },
  { step: "B", alter: -1, octave: 0 },
  { step: "B", alter: 0, octave: 0 },
];

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
