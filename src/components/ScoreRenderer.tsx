import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Fraction, OpenSheetMusicDisplay, PointF2D } from "opensheetmusicdisplay";
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
  events?: ScoreEvent[];
  selectedRange?: ScoreSelectionRange;
  wrongNotes: number[];
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

type ResizeEdge = "start" | "end";
type InteractionMode = "idle" | "selecting" | "resizing-start" | "resizing-end";

const ROW_TOP_TOLERANCE = 28;
const EMPTY_SCORE_EVENTS: ScoreEvent[] = [];

export function ScoreRenderer({
  xmlText,
  currentEventIndex,
  currentEvent,
  eventCount,
  events = EMPTY_SCORE_EVENTS,
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
  const [overlaySize, setOverlaySize] = useState<OverlaySize>({ width: 0, height: 0 });
  const [draftRange, setDraftRange] = useState<ScoreSelectionRange | undefined>();
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
      setInteractionMode("idle");
    };

    window.addEventListener("mouseup", finishPointerAction);
    return () => window.removeEventListener("mouseup", finishPointerAction);
  }, []);

  const visibleRange = draftRange ?? selectedRange;
  const selectionRects = useMemo(() => rectsForRange(visibleRange, eventPositions), [eventPositions, visibleRange]);
  const committedDimRects = useMemo(
    () => (selectedRange && interactionMode === "idle" ? dimRectsForSelection(selectionRects, overlaySize) : []),
    [interactionMode, overlaySize, selectedRange, selectionRects],
  );
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

  const startHandleRect = selectionRects[0];
  const endHandleRect = selectionRects[selectionRects.length - 1];

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
        {startHandleRect && endHandleRect && selectedRange && !isDragging ? (
          <>
            <button
              type="button"
              className="score-selection-handle start"
              style={{ left: startHandleRect.left, top: startHandleRect.top, height: startHandleRect.height }}
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
              style={{ left: endHandleRect.left + endHandleRect.width, top: endHandleRect.top, height: endHandleRect.height }}
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
          <div key={marker.note} className="wrong-note-ghost" style={{ left: marker.left, top: marker.top }} aria-label={`Wrong note ${marker.name}`}>
            <span className="wrong-note-head" aria-hidden="true" />
            <span className="wrong-note-name">{marker.name}</span>
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
  const absoluteStartAndEnd = entry.getAbsoluteStartAndEnd?.();
  const width = absoluteStartAndEnd ? Math.max(24, (absoluteStartAndEnd[1] - absoluteStartAndEnd[0]) * OSMD_UNIT_TO_CSS_PIXEL) : 28;
  const height = Math.max(42, (entry.PositionAndShape?.Size?.height ?? 4.2) * OSMD_UNIT_TO_CSS_PIXEL);

  return {
    left: Math.max(0, domPoint.left - 8),
    top: Math.max(0, domPoint.top - height * 0.25),
    width,
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
function rectsForRange(range: ScoreSelectionRange | undefined, positions: EventPosition[]): OverlayRect[] {
  if (!range) {
    return [];
  }

  const selected = positions.filter((position) => position.index >= range.startIndex && position.index <= range.endIndex);
  if (selected.length === 0) {
    return [];
  }

  const rows = rowsForPositions(positions);
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

function rowsForPositions(positions: EventPosition[]): Array<{ top: number; bottom: number; left: number; right: number; positions: EventPosition[] }> {
  const rows: Array<{ top: number; bottom: number; left: number; right: number; positions: EventPosition[] }> = [];

  for (const position of [...positions].sort((a, b) => a.top - b.top || a.left - b.left)) {
    const row = rows.find((candidate) => Math.abs(candidate.top - position.top) <= ROW_TOP_TOLERANCE);
    if (!row) {
      rows.push({
        top: position.top,
        bottom: position.top + position.height,
        left: position.left,
        right: position.left + position.width,
        positions: [position],
      });
      continue;
    }

    row.top = Math.min(row.top, position.top);
    row.bottom = Math.max(row.bottom, position.top + position.height);
    row.left = Math.min(row.left, position.left);
    row.right = Math.max(row.right, position.left + position.width);
    row.positions.push(position);
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

function markerForWrongNote(note: number, currentPosition: EventPosition | undefined, currentEvent: ScoreEvent | undefined): { note: number; name: string; left: number; top: number } {
  const position = currentPosition ?? { left: 24, top: 24, width: 24, height: 96, index: 0 };
  const staffNumber = staffForWrongNote(note, currentEvent);
  const spelling = spellingForWrongNote(note, staffNumber, currentEvent);
  const staffTop = position.top + (staffNumber === 2 ? position.height * 0.56 : position.height * 0.12);
  const reference = { step: "C", alter: 0, octave: staffNumber === 2 ? 3 : 4 };
  const halfLineSpacing = Math.max(3, Math.min(5.5, position.height / 14.5));
  const y = staffTop + 24 + halfLineSpacing - diatonicStepDistance(reference, spelling) * halfLineSpacing;

  return {
    note,
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
