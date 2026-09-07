"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Circle, Layer, Line, Rect, Stage, Transformer } from "react-konva";
import type Konva from "konva";
import { useBoardTool, type BoardTool } from "@/context/BoardToolContext";
import type { BoardElementsById } from "@/hooks/useBoardTransport";
import { ElementRenderer } from "./ElementRenderer";
import {
  boxFromDrag,
  diamondPoints,
  flattenPoints,
} from "@/lib/board/geometry";
import { zoomStageAtPointer } from "@/lib/board/camera";
import type { BoardElement, ElementType, Point } from "@/types/board";
import type { Dispatch, SetStateAction } from "react";

const SHAPE_TYPES: readonly BoardTool[] = ["rectangle", "diamond", "ellipse"];
const LINEAR_TYPES: readonly BoardTool[] = ["line", "freedraw"];
const BOX_TOOLS: readonly BoardTool[] = [...SHAPE_TYPES, "text"];
const RESIZABLE_TYPES: readonly BoardTool[] = [
  "rectangle",
  "diamond",
  "ellipse",
  "text",
];

function isElementType(tool: BoardTool): tool is ElementType {
  return tool !== "select" && tool !== "pan";
}

interface DatagramPayload {
  type?: "draft" | "cursor";
  clientId?: string;
  x?: number;
  y?: number;
  points?: Point[];
}

interface BoardCanvasProps {
  elements: BoardElementsById;
  setElements: Dispatch<SetStateAction<BoardElementsById>>;
  sendOp: (
    elementId: string,
    field: string,
    value: unknown,
    type?: ElementType,
  ) => void;
  sendDatagram: (payload: unknown) => void;
  onDatagram: (handler: (payload: unknown) => void) => () => void;
}

export function BoardCanvas({
  elements,
  setElements,
  sendOp,
  sendDatagram,
  onDatagram,
}: BoardCanvasProps) {
  const { tool, color, fontSize, selectedId, setSelectedId } = useBoardTool();

  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef<Record<string, Konva.Node>>({});
  const lastDatagramAtRef = useRef(0);

  const [size, setSize] = useState({ width: 1200, height: 800 });
  const [drawStart, setDrawStart] = useState<Point | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<Point | null>(null);
  const [strokePoints, setStrokePoints] = useState<Point[] | null>(null);
  const [remoteCursor, setRemoteCursor] = useState<Point | null>(null);
  const [remoteDrafts, setRemoteDrafts] = useState<Record<string, Point[]>>({});

  // Full-window responsive stage — the viewport is just whatever fits the
  // browser; "infinite" comes from the camera (stage scale/position), not
  // from the stage element itself.
  useEffect(() => {
    function updateSize() {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    }
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // Transformer (resize handles) follows the current selection, for the
  // element types resizing actually makes sense for.
  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    const el = selectedId ? elements[selectedId] : null;
    const node = selectedId ? nodeRefs.current[selectedId] : null;
    if (el && node && RESIZABLE_TYPES.includes(el.type)) {
      tr.nodes([node]);
    } else {
      tr.nodes([]);
    }
    tr.getLayer()?.batchDraw();
  }, [selectedId, elements]);

  // Cursor/draft datagrams from other clients — same channel the demo used,
  // no Redis involved, drawn as a dashed preview / a small ring.
  useEffect(() => {
    return onDatagram((payload) => {
      const msg = payload as DatagramPayload;
      if (msg.type === "draft" && msg.clientId && msg.points) {
        setRemoteDrafts((prev) => ({
          ...prev,
          [msg.clientId as string]: msg.points as Point[],
        }));
      } else if (typeof msg.x === "number" && typeof msg.y === "number") {
        setRemoteCursor({ x: msg.x, y: msg.y });
      }
    });
  }, [onDatagram]);

  // Soft-delete the current selection.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedId &&
        document.activeElement === document.body
      ) {
        e.preventDefault();
        const id = selectedId;
        setSelectedId(null);
        setElements((prev) => {
          const existing = prev[id];
          if (!existing) return prev;
          return { ...prev, [id]: { ...existing, deleted: true } };
        });
        sendOp(id, "deleted", true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, setElements, sendOp, setSelectedId]);

  const registerNode = useCallback((id: string, node: Konva.Node | null) => {
    if (node) nodeRefs.current[id] = node;
    else delete nodeRefs.current[id];
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      if (tool === "select") setSelectedId(id);
    },
    [tool, setSelectedId],
  );

  const handleCommitField = useCallback(
    (id: string, field: string, value: unknown, type: ElementType) => {
      setElements((prev) => {
        const existing = prev[id];
        if (!existing) return prev;
        return {
          ...prev,
          [id]: {
            ...existing,
            data: { ...existing.data, [field]: value },
          } as BoardElement,
        };
      });
      sendOp(id, field, value, type);
    },
    [sendOp, setElements],
  );

  const createElement = useCallback(
    (
      type: ElementType,
      data: Record<string, unknown>,
      fields: readonly string[],
    ) => {
      const id = crypto.randomUUID().slice(0, 8);
      setElements((prev) => ({
        ...prev,
        [id]: { id, type, deleted: false, data } as BoardElement,
      }));
      setSelectedId(id);
      for (const field of fields) sendOp(id, field, data[field], type);
    },
    [setElements, setSelectedId, sendOp],
  );

  const getWorldPointer = useCallback((): Point | null => {
    const stage = stageRef.current;
    const p = stage?.getRelativePointerPosition();
    return p ? { x: p.x, y: p.y } : null;
  }, []);

  const maybeBroadcastPointer = useCallback(
    (p: Point, draftPoints: Point[] | null) => {
      const now = Date.now();
      if (now - lastDatagramAtRef.current < 100) return;
      lastDatagramAtRef.current = now;
      if (draftPoints && draftPoints.length > 1) {
        sendDatagram({ type: "draft", points: draftPoints });
      } else {
        sendDatagram({ type: "cursor", x: p.x, y: p.y });
      }
    },
    [sendDatagram],
  );

  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) return;
    const factor = e.evt.deltaY > 0 ? 0.9 : 1.1;
    zoomStageAtPointer(stage, pointer, factor);
  }, []);

  const handleStageMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (tool === "select" || tool === "pan") {
        if (e.target === e.target.getStage()) setSelectedId(null); // click nền trống -> bỏ chọn
        return;
      }
      const p = getWorldPointer();
      if (!p) return;
      if (BOX_TOOLS.includes(tool)) {
        setDrawStart(p);
        setDrawCurrent(p);
      } else if (LINEAR_TYPES.includes(tool)) {
        setStrokePoints([p]);
      }
    },
    [tool, getWorldPointer, setSelectedId],
  );

  const handleStageMouseMove = useCallback(() => {
    const p = getWorldPointer();
    if (!p) return;

    if (drawStart) {
      setDrawCurrent(p);
    } else if (strokePoints) {
      if (tool === "line") {
        setStrokePoints([strokePoints[0], p]);
      } else if (tool === "freedraw") {
        const last = strokePoints[strokePoints.length - 1];
        if (Math.hypot(p.x - last.x, p.y - last.y) >= 4) {
          setStrokePoints([...strokePoints, p]);
        }
      }
    }

    maybeBroadcastPointer(p, LINEAR_TYPES.includes(tool) ? strokePoints : null);
  }, [drawStart, strokePoints, tool, getWorldPointer, maybeBroadcastPointer]);

  const handleStageMouseUp = useCallback(() => {
    if (drawStart && drawCurrent) {
      const { position, size: boxSize } = boxFromDrag(drawStart, drawCurrent);
      setDrawStart(null);
      setDrawCurrent(null);
      const minSize = tool === "text" ? 10 : 4;
      if (boxSize.width < minSize || boxSize.height < minSize) return;

      if (tool === "text") {
        const text = window.prompt("Nội dung textbox:");
        if (!text || !text.trim()) return;
        createElement(
          "text",
          { position, size: boxSize, text, color, fontSize },
          ["position", "size", "text", "color", "fontSize"],
        );
      } else if (isElementType(tool)) {
        createElement(
          tool,
          {
            position,
            size: boxSize,
            strokeColor: color,
            backgroundColor: "transparent",
          },
          ["position", "size", "strokeColor", "backgroundColor"],
        );
      }
      return;
    }

    if (strokePoints && strokePoints.length > 1 && isElementType(tool)) {
      const points = strokePoints;
      setStrokePoints(null);
      createElement(tool, { points, strokeColor: color }, [
        "points",
        "strokeColor",
      ]);
      return;
    }
    setStrokePoints(null);
  }, [
    drawStart,
    drawCurrent,
    strokePoints,
    tool,
    color,
    fontSize,
    createElement,
  ]);

  return (
    <Stage
      ref={stageRef}
      width={size.width}
      height={size.height}
      draggable={tool === "pan"}
      onWheel={handleWheel}
      onMouseDown={handleStageMouseDown}
      onMouseMove={handleStageMouseMove}
      onMouseUp={handleStageMouseUp}
    >
      <Layer>
        {Object.values(elements)
          .filter((el) => !el.deleted)
          .map((el) => (
            <ElementRenderer
              key={el.id}
              element={el}
              selected={el.id === selectedId}
              draggable={tool === "select"}
              registerNode={registerNode}
              onSelect={handleSelect}
              onCommitField={handleCommitField}
            />
          ))}

        {/* preview of whatever the local user is currently drawing */}
        {drawStart &&
          drawCurrent &&
          (() => {
            const { position, size: boxSize } = boxFromDrag(
              drawStart,
              drawCurrent,
            );
            if (tool === "diamond") {
              return (
                <Line
                  x={position.x}
                  y={position.y}
                  points={diamondPoints(boxSize.width, boxSize.height)}
                  closed
                  stroke="#9ca3af"
                  dash={[4, 4]}
                  listening={false}
                />
              );
            }
            return (
              <Rect
                x={position.x}
                y={position.y}
                width={boxSize.width}
                height={boxSize.height}
                stroke="#9ca3af"
                dash={[4, 4]}
                listening={false}
              />
            );
          })()}
        {strokePoints && strokePoints.length > 1 && (
          <Line
            points={flattenPoints(strokePoints)}
            stroke="#9ca3af"
            dash={[4, 4]}
            strokeWidth={2}
            listening={false}
          />
        )}

        {/* other clients' in-progress line/freedraw strokes + cursor, via datagram */}
        {Object.entries(remoteDrafts).map(
          ([clientId, pts]) =>
            pts.length > 1 && (
              <Line
                key={clientId}
                points={flattenPoints(pts)}
                stroke="#9ca3af"
                dash={[4, 4]}
                strokeWidth={2}
                listening={false}
              />
            ),
        )}
        {remoteCursor && (
          <Circle
            x={remoteCursor.x}
            y={remoteCursor.y}
            radius={8}
            stroke="#d97706"
            dash={[3, 3]}
            listening={false}
          />
        )}

        <Transformer ref={transformerRef} rotateEnabled={false} />
      </Layer>
    </Stage>
  );
}
