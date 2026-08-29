import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Fraction, OpenSheetMusicDisplay, PointF2D } from "opensheetmusicdisplay";
import { midiNoteToName } from "../music/note";
import type { HandMode, NoteFeedbackMarker, PracticeRunMode, ScoreSelectionRange } from "../learning/matcher";
import { normalizeSelectionRange } from "../learning/matcher";
import type { ScoreEvent } from "../music/scoreTypes";
import type { MissedPerformanceNote, PerformanceResult, PlaybackPhase } from "../playback/playback";
import { SCORE_THEME_PRESETS, type ScoreTheme } from "../theme/appearance";
import type { AudioSettings } from "../audio/settings";
import { AudioControls } from "./AudioControls";
import { PlayModeDialog } from "./PlayModeDialog";
import type { PlayMode } from "../playback/settings";

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
  completedFeedback?: CompletedNoteFeedback;
  performanceResults?: PerformanceResult[];
  missedPerformanceNotes?: MissedPerformanceNote[];
  playbackPhase?: PlaybackPhase;
  countdownValue?: number;
  showStartCue?: boolean;
  canPlay?: boolean;
  handMode?: HandMode;
  runMode?: PracticeRunMode;
  pauseOnNotes?: boolean;
  playMode?: PlayMode;
  showProgressWhilePlaying?: boolean;
  waitingForNotes?: number[];
  audioSettings?: AudioSettings;
  audioError?: string;
  scoreTheme?: ScoreTheme;
  showCorrectNoteNames: boolean;
  showWrongNoteNames: boolean;
  onSelectedRangeChange: (range: ScoreSelectionRange | undefined) => void;
  onEventSeek?: (eventIndex: number) => void;
  onHandModeChange?: (mode: HandMode) => void;
  onRunModeChange?: (mode: PracticeRunMode) => void;
  onPlayModeChange?: (mode: PlayMode) => void;
  onShowProgressWhilePlayingChange?: (enabled: boolean) => void;
  onPauseOnNotesChange?: (enabled: boolean) => void;
  onTogglePlayback?: () => void;
  onStop?: () => void;
  onReset?: () => void;
  onClearPerformance?: () => void;
  onAudioSettingsChange?: (update: Partial<AudioSettings>) => void;
  onRenderStateChange: (state: { status: "empty" | "loading" | "ready" | "error"; error?: string }) => void;
}

export interface CompletedNoteFeedback {
  id: number;
  eventIndex: number;
  event: ScoreEvent;
  markers: NoteFeedbackMarker[];
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
  anchorX: number;
  width: number;
  height: number;
  staffAnchors?: StaffAnchor[];
  staffLineTops?: Partial<Record<number, number[]>>;
}

interface StaffAnchor extends OverlayPosition {
  staffNumber: number;
}

interface OverlayRect extends OverlayPosition {
  width: number;
  height: number;
}

interface DragPoint extends OverlayPosition {
  rowIndex: number;
}

type ResizeEdge = "start" | "end";
type InteractionMode = "idle" | "pending" | "selecting" | "resizing-start" | "resizing-end";

const SYSTEM_WRAP_LEFT_TOLERANCE = 48;
const SYSTEM_WRAP_TOP_TOLERANCE = 28;
const GRAPHICAL_EVENT_ANCHOR_HEIGHT = 48;
const CURRENT_EVENT_MARKER_HEIGHT = 192;
const FALLBACK_FEEDBACK_HALF_LINE_SPACING = 4.5;
const FALLBACK_FEEDBACK_MIDDLE_C_OFFSET = 96;
const FEEDBACK_HORIZONTAL_OFFSET = 32;
const TREBLE_TO_BASS_ANCHOR_OFFSET = 96;
const SELECTION_DRAG_THRESHOLD = 6;
const EMPTY_SCORE_EVENTS: ScoreEvent[] = [];

export function ScoreRenderer({
  xmlText,
  currentEventIndex,
  currentEvent,
  eventCount,
  events = EMPTY_SCORE_EVENTS,
  selectedRange,
  feedbackMarkers,
  completedFeedback,
  performanceResults = [],
  missedPerformanceNotes = [],
  playbackPhase = "idle",
  countdownValue,
  showStartCue = false,
  canPlay = false,
  handMode = "both",
  runMode = "once",
  playMode = "play",
  showProgressWhilePlaying = false,
  waitingForNotes = [],
  audioSettings,
  audioError,
  scoreTheme = "paper",
  showCorrectNoteNames,
  showWrongNoteNames,
  onSelectedRangeChange,
  onEventSeek,
  onHandModeChange,
  onRunModeChange,
  onPlayModeChange,
  onShowProgressWhilePlayingChange,
  onTogglePlayback,
  onStop,
  onReset,
  onClearPerformance,
  onAudioSettingsChange,
  onRenderStateChange,
}: ScoreRendererProps) {
  const [playModeOpen, setPlayModeOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const dragStartRef = useRef<DragPoint | null>(null);
  const resizeEdgeRef = useRef<ResizeEdge | null>(null);
  const interactionModeRef = useRef<InteractionMode>("idle");
  const currentMarkerRef = useRef<HTMLDivElement | null>(null);
  const followedSystemRef = useRef<string | undefined>(undefined);
  const resizeRefreshTimerRef = useRef<number | undefined>(undefined);
  const observedScoreWidthRef = useRef<number | undefined>(undefined);
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
        anchorX: Math.max(0, rect.left + rect.width / 2 - shellRect.left),
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
        const scorePreset = SCORE_THEME_PRESETS[scoreTheme];
        const osmd = new OpenSheetMusicDisplay(target, {
          autoResize: true,
          backend: "svg",
          drawTitle: true,
          newSystemFromXML: true,
          newSystemFromNewPageInXML: true,
          defaultColorMusic: scorePreset.ink,
          defaultColorLabel: scorePreset.ink,
          defaultColorTitle: scorePreset.ink,
          pageBackgroundColor: "#00000000",
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
  }, [xmlText, refreshEventPositions, scoreTheme]);

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
    const target = containerRef.current;
    if (!target || typeof ResizeObserver === "undefined") return;
    const refreshAfterResize = (width: number, force = false) => {
      if (width <= 0) return;
      const previous = observedScoreWidthRef.current;
      observedScoreWidthRef.current = width;
      if (previous === undefined || (!force && Math.abs(previous - width) < 1)) return;
      if (resizeRefreshTimerRef.current !== undefined) window.clearTimeout(resizeRefreshTimerRef.current);
      resizeRefreshTimerRef.current = window.setTimeout(() => {
        resizeRefreshTimerRef.current = undefined;
        const osmd = osmdRef.current;
        if (!osmd) return;
        void Promise.resolve(osmd.render()).then(() => {
          hideNativeCursor();
          window.requestAnimationFrame(() => window.requestAnimationFrame(refreshEventPositions));
        });
      }, 80);
    };
    const observer = new ResizeObserver((entries) => refreshAfterResize(entries[0]?.contentRect.width ?? target.clientWidth));
    observer.observe(target);
    const refreshForWindow = () => refreshAfterResize(target.getBoundingClientRect().width, true);
    window.addEventListener("resize", refreshForWindow);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", refreshForWindow);
      if (resizeRefreshTimerRef.current !== undefined) window.clearTimeout(resizeRefreshTimerRef.current);
    };
  }, [hideNativeCursor, refreshEventPositions, xmlText]);

  useEffect(() => {
    const finishPointerAction = () => {
      dragStartRef.current = null;
      resizeEdgeRef.current = null;
      interactionModeRef.current = "idle";
      setDraftRange(undefined);
      setDragStartPoint(undefined);
      setDragEndPoint(undefined);
      setInteractionMode("idle");
    };

    window.addEventListener("mouseup", finishPointerAction);
    return () => window.removeEventListener("mouseup", finishPointerAction);
  }, []);

  const systemRows = useMemo(() => rowsForPositions(eventPositions), [eventPositions]);
  const isPointerPreview = interactionMode === "selecting" || interactionMode === "resizing-start" || interactionMode === "resizing-end";
  const visibleRange = draftRange ?? selectedRange;
  const rangeSelectionRects = useMemo(() => rectsForRange(visibleRange, eventPositions, systemRows), [eventPositions, systemRows, visibleRange]);
  const effectiveOverlaySize = useMemo(() => effectiveSizeForRows(overlaySize, systemRows), [overlaySize, systemRows]);
  const dragSelectionRects = useMemo(() => rectsForDrag(dragStartPoint, dragEndPoint, systemRows, effectiveOverlaySize), [dragEndPoint, dragStartPoint, effectiveOverlaySize, systemRows]);
  const outlineRects = isPointerPreview ? dragSelectionRects : rangeSelectionRects;
  const hasVisibleRange = visibleRange !== undefined;
  const rangeDimRects = useMemo(
    () => (hasVisibleRange ? dimRectsForSelection(rangeSelectionRects, effectiveOverlaySize) : []),
    [effectiveOverlaySize, hasVisibleRange, rangeSelectionRects],
  );
  const inactiveHandDimRects = useMemo(
    () => dimRectsForInactiveHand(handMode, systemRows, hasVisibleRange ? rangeSelectionRects : undefined),
    [handMode, hasVisibleRange, rangeSelectionRects, systemRows],
  );
  const isDragging = isPointerPreview;
  const currentPosition = eventPositions.find((position) => position.index === currentEventIndex);
  useEffect(() => {
    if (!currentPosition) return;
    const rowIndex = nearestRowIndexForPoint(currentPosition, systemRows);
    const row = systemRows[rowIndex];
    if (!row) return;
    const systemKey = `${Math.round(row.top)}:${Math.round(row.left)}`;
    if (followedSystemRef.current === systemKey) return;
    followedSystemRef.current = systemKey;
    currentMarkerRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start", inline: "nearest" });
  }, [currentPosition, systemRows]);
  const noteFeedbackMarkers = useMemo(
    () => feedbackMarkers.map((feedback) => markerForNoteFeedback(feedback, currentPosition, currentEvent)),
    [currentEvent, currentPosition, feedbackMarkers],
  );
  const completedPosition = completedFeedback
    ? eventPositions.find((position) => position.index === completedFeedback.eventIndex)
    : undefined;
  const completedNoteFeedbackMarkers = useMemo(
    () => completedFeedback?.markers.map((feedback) => {
      const marker = markerForNoteFeedback(feedback, completedPosition, completedFeedback.event);
      return { ...marker, left: expectedNoteAnchorX(completedPosition, marker.staffNumber, marker.left) };
    }) ?? [],
    [completedFeedback, completedPosition],
  );
  const recordedNoteFeedbackMarkers = useMemo(() => performanceResults.map((result) => {
    const event = events[result.eventIndex];
    const position = eventPositions.find((item) => item.index === result.eventIndex);
    const displayedNote = result.result === "correct" ? result.expectedNote : result.playedNote;
    const marker = markerForNoteFeedback({ note: displayedNote, kind: result.result, staffNumber: result.staffNumber }, position, event);
    const left = result.result === "correct"
      ? expectedNoteAnchorX(position, result.staffNumber, marker.left)
      : scoreTimeAnchorX(result.scoreQuarter, events, eventPositions, position?.anchorX ?? marker.left);
    return { ...marker, id: result.id, left };
  }), [eventPositions, events, performanceResults]);
  const missedNoteFeedbackMarkers = useMemo(() => missedPerformanceNotes.map((missed) => {
    const event = events[missed.eventIndex];
    const position = eventPositions.find((item) => item.index === missed.eventIndex);
    const marker = markerForNoteFeedback({ note: missed.note, kind: "wrong", staffNumber: missed.staffNumber }, position, event);
    return { ...marker, id: missed.id, left: expectedNoteAnchorX(position, missed.staffNumber, marker.left) };
  }), [eventPositions, events, missedPerformanceNotes]);

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
    const index = boundaryEventIndexForPoint(point, dragStartRef.current ?? point, systemRows);
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
    interactionModeRef.current = "pending";
    dragStartRef.current = point;
    setDragStartPoint(point);
    setDragEndPoint(point);
    setDraftRange(undefined);
    setInteractionMode("pending");
  };

  const updatePointerSelection = (event: React.PointerEvent<HTMLElement>) => {
    const point = pointFromPointerEvent(event);
    if (!point) {
      return;
    }

    if (interactionModeRef.current === "pending" && dragStartRef.current) {
      const distance = Math.hypot(point.left - dragStartRef.current.left, point.top - dragStartRef.current.top);
      if (distance < SELECTION_DRAG_THRESHOLD || playbackPhase !== "idle") return;
      interactionModeRef.current = "selecting";
      setInteractionMode("selecting");
    }

    if (interactionModeRef.current === "selecting" && dragStartRef.current) {
      setDragEndPoint(point);
      setDraftRange(rangeForPoint(point));
      return;
    }

    if ((interactionModeRef.current === "resizing-start" || interactionModeRef.current === "resizing-end") && selectedRange) {
      setDragEndPoint(point);
      setDraftRange(rangeForPoint(point));
    }
  };

  const finishPointerSelection = (event: React.PointerEvent<HTMLElement>) => {
    const point = pointFromPointerEvent(event);
    const completedMode = interactionModeRef.current;
    const completedRangeGesture = completedMode === "selecting" || completedMode === "resizing-start" || completedMode === "resizing-end";
    const nextRange = completedRangeGesture ? (point ? rangeForPoint(point) : draftRange) : undefined;
    const clickedIndex = completedMode === "pending" && point ? nearestEventIndexForPoint(point, systemRows) : undefined;

    dragStartRef.current = null;
    resizeEdgeRef.current = null;
    interactionModeRef.current = "idle";
    setDragStartPoint(undefined);
    setDragEndPoint(undefined);
    setDraftRange(undefined);
    setInteractionMode("idle");

    releasePointer(event.currentTarget, event.pointerId);

    if (nextRange) {
      onSelectedRangeChange(nextRange);
    } else if (clickedIndex !== undefined && (!selectedRange || (clickedIndex >= selectedRange.startIndex && clickedIndex <= selectedRange.endIndex))) {
      onEventSeek?.(clickedIndex);
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
    interactionModeRef.current = edge === "start" ? "resizing-start" : "resizing-end";
    setInteractionMode(edge === "start" ? "resizing-start" : "resizing-end");
    dragStartRef.current = fixedPoint;
    setDragStartPoint(fixedPoint);
    setDragEndPoint(movingPoint);
    setDraftRange(selectedRange);
  };

  const startHandleRect = rangeSelectionRects[0];
  const endHandleRect = rangeSelectionRects[rangeSelectionRects.length - 1];
  const controlPosition = eventPositions.find((position) => position.index === (visibleRange?.startIndex ?? eventPositions[0]?.index));
  const controlRowIndex = controlPosition ? nearestRowIndexForPoint(controlPosition, systemRows) : 0;
  const controlRow = systemRows[controlRowIndex];
  const controlBoundaryLeft = visibleRange && rangeSelectionRects[0]
    ? rangeSelectionRects[0].left
    : controlRow ? Math.max(0, controlRow.left - 16) : 0;
  const toolbarTop = visibleRange && rangeSelectionRects[0]
    ? Math.max(6, rangeSelectionRects[0].top - 44)
    : controlRow ? Math.max(6, visualBoundsForRow(systemRows, controlRowIndex).top - 44) : 6;
  const toggleHand = (hand: "right" | "left") => {
    const nextMode = handModeAfterToggle(handMode, hand);
    if (nextMode !== handMode) {
      onHandModeChange?.(nextMode);
    }
  };

  return (
    <div ref={shellRef} className="score-renderer-shell">
      <div ref={containerRef} className="score-renderer" aria-label="Rendered sheet music" />
      <div className="score-selection-visual-layer" aria-hidden="true">
        {rangeDimRects.map((rect, index) => (
          <div key={`range-dim-${index}`} className="score-selection-dim range" style={rectStyle(rect)} />
        ))}
        {inactiveHandDimRects.map((rect, index) => (
          <div key={`hand-dim-${index}`} className="score-selection-dim inactive-hand" style={rectStyle(rect)} />
        ))}
        {outlineRects.map((rect, index) => (
          <div
            key={`selection-${index}`}
            className={`score-selection-rect${isDragging ? " dragging" : ""}${selectedRange && !isDragging ? " committed" : ""}`}
            style={rectStyle(rect)}
          />
        ))}
        {currentPosition ? <div ref={currentMarkerRef} className={`score-current-event-marker${showStartCue ? " playback-onset" : ""}`} style={rectStyle(currentMarkerRect(currentPosition))} /> : null}
      </div>
      <div
        className={`score-selection-layer${playbackPhase === "idle" ? "" : " playback-active"}`}
        aria-label="Score selection layer"
        onPointerDown={beginSelection}
        onPointerMove={updatePointerSelection}
        onPointerUp={finishPointerSelection}
        onPointerCancel={finishPointerSelection}
      >
        {startHandleRect && endHandleRect && selectedRange && interactionMode === "idle" && playbackPhase === "idle" ? (
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
      {controlPosition ? (
        <div className="score-controls-layer">
          <button
            type="button"
            className={`score-hand-toggle${handMode !== "left" ? " active" : ""}`}
            style={{ left: Math.max(36, controlBoundaryLeft - 8), top: staffControlTop(controlPosition, 1) }}
            aria-label="Toggle right hand"
            aria-pressed={handMode !== "left"}
            aria-disabled={handMode === "right"}
            disabled={playbackPhase !== "idle"}
            title={handMode === "right" ? "Right hand must remain on" : "Toggle right hand"}
            onClick={() => toggleHand("right")}
          >RH</button>
          <button
            type="button"
            className={`score-hand-toggle${handMode !== "right" ? " active" : ""}`}
            style={{ left: Math.max(36, controlBoundaryLeft - 8), top: staffControlTop(controlPosition, 2) }}
            aria-label="Toggle left hand"
            aria-pressed={handMode !== "right"}
            aria-disabled={handMode === "left"}
            disabled={playbackPhase !== "idle"}
            title={handMode === "left" ? "Left hand must remain on" : "Toggle left hand"}
            onClick={() => toggleHand("left")}
          >LH</button>
          <div className="score-practice-toolbar" style={{ left: Math.max(8, controlBoundaryLeft), top: toolbarTop }} role="toolbar" aria-label="Practice toolbar">
            <div className="play-control-group"><button type="button" aria-label={playbackPhase === "idle" ? "Play score" : playbackPhase === "paused" ? "Resume score" : "Pause playback"} title={playbackPhase === "idle" ? "Play" : playbackPhase === "paused" ? "Resume" : "Pause"} disabled={!canPlay} onClick={onTogglePlayback}>{playbackPhase === "idle" || playbackPhase === "paused" ? <PlayIcon /> : <TransportPauseIcon />}</button><button type="button" className="toolbar-icon-button toolbar-options-button" aria-label="Choose play mode" title="Play mode" aria-haspopup="dialog" onClick={() => setPlayModeOpen(true)}><ChevronDownIcon /></button></div>
            <button type="button" aria-label="Stop score playback" title="Stop" disabled={!canStop(playbackPhase)} onClick={onStop}><StopIcon /></button>
            <button
              type="button"
              className={runMode === "loop" ? "active" : ""}
              aria-label="Loop selected range"
              aria-pressed={runMode === "loop"}
              disabled={playbackPhase !== "idle"}
              title={runMode === "loop" ? "Loop on" : "Loop off"}
              onClick={() => onRunModeChange?.(runMode === "loop" ? "once" : "loop")}
            >
              <LoopIcon />
            </button>
            <button type="button" aria-label="Clear performance markers" title="Clear performance" disabled={performanceResults.length === 0 && missedPerformanceNotes.length === 0} onClick={onClearPerformance}><ClearIcon /></button>
            <button type="button" aria-label="Reset score progress" title="Reset" disabled={!canPlay} onClick={onReset}><ResetIcon /></button>
            {audioSettings && onAudioSettingsChange ? <AudioControls settings={audioSettings} error={audioError} onSettingsChange={onAudioSettingsChange} compact /> : null}
          </div>
          {playModeOpen ? <PlayModeDialog value={playMode} showProgress={showProgressWhilePlaying} onChange={(mode) => { onPlayModeChange?.(mode); setPlayModeOpen(false); }} onShowProgressChange={(enabled) => onShowProgressWhilePlayingChange?.(enabled)} onClose={() => setPlayModeOpen(false)} /> : null}
        </div>
      ) : null}
      <div className="note-feedback-layer" aria-live="polite">
        {noteFeedbackMarkers.map((marker) => (
          <div key={`${marker.kind}-${marker.note}`} className={`note-feedback ${marker.kind}`} style={{ left: marker.left, top: marker.top }} aria-label={`${marker.kind === "correct" ? "Correct" : "Wrong"} note ${marker.name}`}>
            <span className="note-feedback-head" aria-hidden="true" />
            {shouldShowNoteName(marker.kind, showCorrectNoteNames, showWrongNoteNames) ? <span className="note-feedback-name">{marker.name}</span> : null}
          </div>
        ))}
        {completedNoteFeedbackMarkers.map((marker) => (
          <div key={`completed-${completedFeedback?.id}-${marker.note}-${marker.staffNumber}`} className={`note-feedback ${marker.kind} completed`} style={{ left: marker.left, top: marker.top }} aria-label={`Correct note ${marker.name}`}>
            <span className="note-feedback-head" aria-hidden="true" />
            {showCorrectNoteNames ? <span className="note-feedback-name">{marker.name}</span> : null}
          </div>
        ))}
        {recordedNoteFeedbackMarkers.map((marker) => (
          <div key={`recorded-${marker.id}`} className={`note-feedback ${marker.kind} recorded`} style={{ left: marker.left, top: marker.top }} aria-label={`${marker.kind === "correct" ? "Correct" : "Wrong"} recorded note ${marker.name}`}>
            <span className="note-feedback-head" aria-hidden="true" />
          </div>
        ))}
        {missedNoteFeedbackMarkers.map((marker) => <span key={`missed-${marker.id}`} className="missed-note-feedback" style={{ left: marker.left, top: marker.top }} aria-label={`Missed note ${marker.name}`}>×</span>)}
      </div>
      {playbackPhase === "countdown" ? <div className="playback-overlay countdown" role="status" aria-live="assertive"><div className="playback-message"><strong>{countdownValue ?? ""}</strong></div></div> : null}
      {showStartCue ? <div className="playback-overlay start-cue" role="status" aria-live="assertive"><div className="playback-message"><strong>Go</strong></div></div> : null}
      {playbackPhase === "waiting-note" && !showStartCue ? <div className="playback-overlay note-wait" role="status" aria-live="polite"><div className="playback-message"><span>Waiting for</span><strong>{waitingForNotes.map(midiNoteToName).join(" + ")}</strong></div></div> : null}
      {playbackPhase === "paused" ? <div className="playback-overlay paused" role="status" aria-live="polite"><div className="playback-message"><span>Playback</span><strong>Paused</strong></div></div> : null}
      {playbackPhase === "waiting-restart" ? <div className="playback-overlay restart" role="status" aria-live="polite"><div className="playback-message"><span>Loop complete</span><strong>Press any key to start again</strong></div></div> : null}
    </div>
  );
}

function LoopIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M17.7 7.3A8 8 0 0 0 4.6 9H2l3.5-4L9 9H6.7a6 6 0 0 1 9.6-.3L17.7 7.3Zm-10.4 9.4A8 8 0 0 0 20 15h2l-3.5 4-3.5-4h2.3a6 6 0 0 1-9.6.3l-1.4 1.4Z" />
    </svg>
  );
}

function ChevronDownIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 8 7 7 7-7-2-2-5 5-5-5-2 2Z" /></svg>; }

function PlayIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13-8L7 4Z" /></svg>; }
function TransportPauseIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4v16H6V4Zm8 0h4v16h-4V4Z" /></svg>; }
function StopIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5V5Z" /></svg>; }
function ResetIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.1 7.2A8 8 0 1 1 4 14h2.1a6 6 0 1 0 .8-5.2L10 12H2V4l3.1 3.2Z" /></svg>; }
function ClearIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 6 1-2h8l1 2h4v2H3V6h4Zm1 4h8l-1 10H9L8 10Z" /></svg>; }

function canStop(phase: PlaybackPhase | undefined): boolean { return phase === "countdown" || phase === "playing" || phase === "waiting-note" || phase === "paused"; }

function handModeAfterToggle(mode: HandMode, hand: "right" | "left"): HandMode {
  if (hand === "right") {
    return mode === "both" ? "left" : mode === "left" ? "both" : "right";
  }
  return mode === "both" ? "right" : mode === "right" ? "both" : "left";
}

function staffControlTop(position: EventPosition, staffNumber: number): number {
  const staffLines = position.staffLineTops?.[staffNumber];
  if (staffLines && staffLines.length >= 5) {
    return midpoint(staffLines[0], staffLines[staffLines.length - 1]);
  }

  const staffAnchor = position.staffAnchors?.find((anchor) => anchor.staffNumber === staffNumber);
  return (staffAnchor?.top ?? position.top) + GRAPHICAL_EVENT_ANCHOR_HEIGHT / 2 + (staffNumber === 2 && !staffAnchor ? TREBLE_TO_BASS_ANCHOR_OFFSET : 0);
}

type GraphicalSheetLike = {
  findGraphicalMeasureByMeasureNumber?: (measureNumber: number, staffIndex: number) => GraphicalMeasureLike | undefined;
  svgToDom?: (point: PointF2D) => PointF2D;
};

type GraphicalMeasureLike = {
  staffEntries?: GraphicalStaffEntryLike[];
  findGraphicalStaffEntryFromTimestamp?: (timestamp: Fraction) => GraphicalStaffEntryLike | undefined;
  PositionAndShape?: BoundingBoxLike;
  ParentStaffLine?: StaffLineLike;
};

type StaffLineLike = {
  PositionAndShape?: BoundingBoxLike;
  StaffLines?: GraphicalLineLike[];
};

type GraphicalLineLike = {
  Start?: { x?: number; y?: number };
  End?: { x?: number; y?: number };
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
    .map((staffNumber) => ({ staffNumber, entry: graphicalEntryForEvent(graphicSheet, event, staffNumber) }))
    .filter((item): item is { staffNumber: number; entry: GraphicalStaffEntryLike } => item.entry !== undefined);

  if (entries.length === 0) {
    return undefined;
  }

  const anchoredRects = entries
    .map(({ entry, staffNumber }) => {
      const rect = rectForGraphicalEntry(graphicSheet, shell, entry);
      return rect ? { rect, staffNumber } : undefined;
    })
    .filter((anchored): anchored is { rect: OverlayRect; staffNumber: number } => anchored !== undefined);
  const rects = anchoredRects.map(({ rect }) => rect);

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
    anchorX: midpoint(left, right),
    top,
    width: Math.max(24, right - left),
    height: Math.max(42, bottom - top),
    staffAnchors: anchoredRects.map(({ rect, staffNumber }) => ({
      staffNumber,
      left: rect.left,
      top: rect.top,
    })),
    staffLineTops: staffLineTopsForEvent(graphicSheet, shell, event),
  };
}

function staffLineTopsForEvent(graphicSheet: GraphicalSheetLike, shell: HTMLElement, event: ScoreEvent): Partial<Record<number, number[]>> | undefined {
  const staffLineTops = [1, 2].reduce<Partial<Record<number, number[]>>>((result, staffNumber) => {
    const tops = staffLineTopsForMeasure(graphicSheet, shell, event.measureNumber, staffNumber);
    if (tops) {
      result[staffNumber] = tops;
    }
    return result;
  }, {});
  return Object.keys(staffLineTops).length > 0 ? staffLineTops : undefined;
}

function staffLineTopsForMeasure(graphicSheet: GraphicalSheetLike, shell: HTMLElement, measureNumber: number, staffNumber: number): number[] | undefined {
  const measure = graphicSheet.findGraphicalMeasureByMeasureNumber?.(measureNumber, Math.max(0, staffNumber - 1));
  const staffLine = measure?.ParentStaffLine;
  const staffOrigin = staffLine?.PositionAndShape?.AbsolutePosition;
  if (staffOrigin?.x === undefined || staffOrigin.y === undefined) {
    return undefined;
  }
  const staffOriginX = staffOrigin.x;
  const staffOriginY = staffOrigin.y;

  const tops = (staffLine?.StaffLines ?? [])
    .map((line) => line.Start ?? line.End)
    .filter((point): point is { x: number; y: number } => point?.x !== undefined && point.y !== undefined)
    .map((point) => pointToShellPosition(graphicSheet, shell, staffOriginX + point.x, staffOriginY + point.y).top)
    .sort((a, b) => a - b);

  return tops.length >= 5 ? tops.slice(0, 5) : undefined;
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
  return {
    left: Math.max(0, domPoint.left - 12),
    top: Math.max(0, domPoint.top - GRAPHICAL_EVENT_ANCHOR_HEIGHT * 0.25),
    width: 24,
    height: GRAPHICAL_EVENT_ANCHOR_HEIGHT,
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

  return rows
    .map((row, rowIndex) => {
      const rowPositions = [...row.positions].sort((a, b) => eventCenterX(a) - eventCenterX(b) || a.index - b.index);
      const selectedInRow = rowPositions.filter((position) => selected.includes(position));
      if (selectedInRow.length === 0) {
        return undefined;
      }

      const firstSelectedIndex = rowPositions.indexOf(selectedInRow[0]);
      const lastSelectedIndex = rowPositions.indexOf(selectedInRow[selectedInRow.length - 1]);
      const previousPosition = rowPositions[firstSelectedIndex - 1];
      const nextPosition = rowPositions[lastSelectedIndex + 1];
      const left = previousPosition
        ? midpoint(eventCenterX(previousPosition), eventCenterX(selectedInRow[0]))
        : row.left - 16;
      const right = nextPosition
        ? midpoint(eventCenterX(selectedInRow[selectedInRow.length - 1]), eventCenterX(nextPosition))
        : row.right + 34;
      const previousRow = rows[rowIndex - 1];
      const nextRow = rows[rowIndex + 1];
      const top = previousRow ? midpoint(previousRow.bottom, row.top) : row.top - 24;
      const bottom = nextRow ? midpoint(row.bottom, nextRow.top) : row.bottom + 24;

      return {
        left: Math.max(0, left),
        top: Math.max(0, top),
        width: Math.max(2, right - left),
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

function boundaryEventIndexForPoint(point: DragPoint, start: DragPoint, rows: ScoreRow[]): number | undefined {
  if (rows.length === 0) {
    return undefined;
  }

  const rowIndex = clamp(point.rowIndex, 0, rows.length - 1);
  const startRowIndex = clamp(start.rowIndex, 0, rows.length - 1);
  const rowPositions = [...rows[rowIndex].positions].sort((a, b) => eventCenterX(a) - eventCenterX(b));
  const forward = rowIndex > startRowIndex || (rowIndex === startRowIndex && point.left >= start.left);

  if (forward) {
    const crossed = rowPositions.filter((position) => eventCenterX(position) <= point.left).at(-1);
    if (crossed) {
      return crossed.index;
    }

    const previousRow = rows.slice(0, rowIndex).reverse().find((row) => row.positions.length > 0);
    return previousRow?.positions.at(-1)?.index ?? rowPositions[0]?.index;
  }

  const crossed = rowPositions.find((position) => eventCenterX(position) >= point.left);
  if (crossed) {
    return crossed.index;
  }

  const nextRow = rows.slice(rowIndex + 1).find((row) => row.positions.length > 0);
  return nextRow?.positions[0]?.index ?? rowPositions.at(-1)?.index;
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
  return position.anchorX;
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

function dimRectsForInactiveHand(handMode: HandMode, rows: ScoreRow[], activeSelectionRects?: OverlayRect[]): OverlayRect[] {
  if (handMode === "both") {
    return [];
  }

  return rows.flatMap((row, rowIndex) => {
    const bounds = visualBoundsForRow(rows, rowIndex);
    const trebleLines = staffLinesForRow(row, 1);
    const bassLines = staffLinesForRow(row, 2);
    const split = trebleLines && bassLines
      ? midpoint(trebleLines[trebleLines.length - 1], bassLines[0])
      : midpoint(bounds.top, bounds.bottom);
    const left = Math.max(0, row.left - 16);
    const right = row.right + 34;
    const baseRect: OverlayRect = handMode === "right"
      ? {
          left,
          top: split,
          width: Math.max(0, right - left),
          height: Math.max(0, bounds.bottom - split),
        }
      : {
          left,
          top: bounds.top,
          width: Math.max(0, right - left),
          height: Math.max(0, split - bounds.top),
        };

    if (!activeSelectionRects) {
      return baseRect.width > 0 && baseRect.height > 0 ? [baseRect] : [];
    }

    return activeSelectionRects
      .map((selectionRect) => intersectRects(baseRect, selectionRect))
      .filter((rect): rect is OverlayRect => rect !== undefined);
  });
}

function staffLinesForRow(row: ScoreRow, staffNumber: number): number[] | undefined {
  return row.positions.find((position) => (position.staffLineTops?.[staffNumber]?.length ?? 0) >= 5)?.staffLineTops?.[staffNumber];
}

function intersectRects(a: OverlayRect, b: OverlayRect): OverlayRect | undefined {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.left + a.width, b.left + b.width);
  const bottom = Math.min(a.top + a.height, b.top + b.height);
  return right > left && bottom > top
    ? { left, top, width: right - left, height: bottom - top }
    : undefined;
}

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

function markerForNoteFeedback(feedback: NoteFeedbackMarker, currentPosition: EventPosition | undefined, currentEvent: ScoreEvent | undefined): { note: number; kind: NoteFeedbackMarker["kind"]; staffNumber: number; name: string; left: number; top: number } {
  const note = feedback.note;
  const position = currentPosition ?? { left: 24, anchorX: 36, top: 24, width: 24, height: 96, index: 0 };
  const staffNumber = feedback.staffNumber ?? staffForFeedbackNote(note, currentEvent);
  const spelling = spellingForFeedbackNote(note, staffNumber, currentEvent);
  const staffAnchor = position.staffAnchors?.find((anchor) => anchor.staffNumber === staffNumber);
  const { referenceTop, referencePitch, halfLineSpacing } = feedbackPitchGeometry(position, staffNumber, currentEvent);
  const y = referenceTop - diatonicStepDistance(referencePitch, spelling) * halfLineSpacing;

  return {
    note,
    kind: feedback.kind,
    staffNumber,
    name: nameForSpelling(spelling) ?? midiNoteToName(note),
    left: (staffAnchor?.left ?? position.left) + FEEDBACK_HORIZONTAL_OFFSET,
    top: Math.max(4, y),
  };
}

function expectedNoteAnchorX(position: EventPosition | undefined, staffNumber: number | undefined, fallback: number): number {
  if (!position) return fallback - FEEDBACK_HORIZONTAL_OFFSET;
  const staffAnchor = position.staffAnchors?.find((anchor) => anchor.staffNumber === staffNumber);
  return staffAnchor ? staffAnchor.left + 12 : position.anchorX;
}

function scoreTimeAnchorX(scoreQuarter: number, events: ScoreEvent[], positions: EventPosition[], fallback: number): number {
  const timed = positions.map((position) => ({ position, quarter: events[position.index]?.startQuarter }))
    .filter((item): item is { position: EventPosition; quarter: number } => item.quarter !== undefined)
    .sort((a, b) => a.quarter - b.quarter);
  const before = [...timed].reverse().find((item) => item.quarter <= scoreQuarter);
  const after = timed.find((item) => item.quarter >= scoreQuarter);
  if (!before && !after) return fallback;
  if (!before) return after?.position.anchorX ?? fallback;
  if (!after) return before.position.anchorX;
  const sameSystem = Math.abs(before.position.top - after.position.top) <= SYSTEM_WRAP_TOP_TOLERANCE;
  const span = after.quarter - before.quarter;
  if (!sameSystem || span <= 0) return Math.abs(scoreQuarter - before.quarter) <= Math.abs(after.quarter - scoreQuarter) ? before.position.anchorX : after.position.anchorX;
  const progress = clamp((scoreQuarter - before.quarter) / span, 0, 1);
  return before.position.anchorX + (after.position.anchorX - before.position.anchorX) * progress;
}

function feedbackPitchGeometry(position: EventPosition, staffNumber: number, currentEvent: ScoreEvent | undefined): { referenceTop: number; referencePitch: PitchSpelling; halfLineSpacing: number } {
  const staffLines = position.staffLineTops?.[staffNumber];
  if (staffLines && staffLines.length >= 5) {
    const lineSpacings = staffLines.slice(1).map((top, index) => top - staffLines[index]);
    const staffSpace = lineSpacings.reduce((total, spacing) => total + spacing, 0) / lineSpacings.length;
    const clef = currentEvent?.noteDetails.find((detail) => detail.staffNumber === staffNumber && detail.clef)?.clef;
    const referencePitch = clefReferencePitch(clef?.sign, clef?.octaveChange ?? 0);
    if (clef && referencePitch && Number.isInteger(clef.line) && clef.line >= 1 && clef.line <= 5) return { referenceTop: staffLines[5 - clef.line], referencePitch, halfLineSpacing: staffSpace / 2 };
    const middleC = { step: "C", alter: 0, octave: 4 };
    return { referenceTop: staffNumber === 2 ? staffLines[0] - staffSpace : staffLines[staffLines.length - 1] + staffSpace, referencePitch: middleC, halfLineSpacing: staffSpace / 2 };
  }

  return {
    referenceTop: systemTopForPosition(position) + FALLBACK_FEEDBACK_MIDDLE_C_OFFSET,
    referencePitch: { step: "C", alter: 0, octave: 4 },
    halfLineSpacing: FALLBACK_FEEDBACK_HALF_LINE_SPACING,
  };
}

function clefReferencePitch(sign: string | undefined, octaveChange: number): PitchSpelling | undefined {
  if (sign === "G") return { step: "G", alter: 0, octave: 4 + octaveChange };
  if (sign === "F") return { step: "F", alter: 0, octave: 3 + octaveChange };
  if (sign === "C") return { step: "C", alter: 0, octave: 4 + octaveChange };
  return undefined;
}

function currentMarkerRect(position: EventPosition): OverlayRect {
  return {
    left: position.left,
    top: systemTopForPosition(position),
    width: 24,
    height: CURRENT_EVENT_MARKER_HEIGHT,
  };
}

function systemTopForPosition(position: EventPosition): number {
  const trebleAnchor = position.staffAnchors?.find((anchor) => anchor.staffNumber === 1);
  if (trebleAnchor) {
    return trebleAnchor.top;
  }

  const bassAnchor = position.staffAnchors?.find((anchor) => anchor.staffNumber === 2);
  if (bassAnchor) {
    return Math.max(0, bassAnchor.top - TREBLE_TO_BASS_ANCHOR_OFFSET);
  }

  return position.top;
}

type PitchSpelling = {
  step: string;
  alter: number;
  octave: number;
};

function spellingForFeedbackNote(note: number, staffNumber: number, currentEvent: ScoreEvent | undefined): PitchSpelling {
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

function staffForFeedbackNote(note: number, currentEvent: ScoreEvent | undefined): number {
  const eventStaves = new Set(currentEvent?.staffNumbers ?? []);
  if (eventStaves.size === 1) {
    return Array.from(eventStaves)[0] ?? 1;
  }

  const exactScoreNote = currentEvent?.noteDetails.find((detail) => detail.midiNote === note);
  if (exactScoreNote) {
    return exactScoreNote.staffNumber;
  }

  const nearestScoreNote = currentEvent?.noteDetails.reduce<ScoreEvent["noteDetails"][number] | undefined>((nearest, detail) => {
    if (!nearest) {
      return detail;
    }
    return Math.abs(detail.midiNote - note) < Math.abs(nearest.midiNote - note) ? detail : nearest;
  }, undefined);
  if (nearestScoreNote) {
    return nearestScoreNote.staffNumber;
  }

  return note <= 60 ? 2 : 1;
}
