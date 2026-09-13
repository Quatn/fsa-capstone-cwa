"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Circle,
  Group,
  Layer,
  Line,
  Rect,
  Stage,
  Transformer,
} from "react-konva";
import type Konva from "konva";
import { useBoardTool, type BoardTool } from "@/context/BoardToolContext";
import type { BoardElementsById, OpHandler } from "@/hooks/useBoardTransport";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { ElementRenderer } from "./ElementRenderer";
import { TextEditor } from "./TextEditor";
import {
  boxFromDrag,
  diamondPoints,
  flattenPoints,
} from "@/lib/board/geometry";
import {
  focusStageOn,
  zoomStageAtPointer,
  type BoardCamera,
} from "@/lib/board/camera";
import { minTextBoxSize, textHeightAtWidth } from "@/lib/board/text";
import type { BoardElement, ElementType, Point, TextData } from "@/types/board";
import type { Dispatch, RefObject, SetStateAction } from "react";

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
  onOp: (handler: OpHandler) => () => void;
  clientId: string | null;
  /** Populated with a camera handle while mounted, for the chat panel's use. */
  cameraRef?: RefObject<BoardCamera | null>;
}

export function BoardCanvas({
  elements,
  setElements,
  sendOp,
  sendDatagram,
  onDatagram,
  onOp,
  clientId,
  cameraRef,
}: BoardCanvasProps) {
  const { tool, color, fontSize, selectedId, setSelectedId } = useBoardTool();

  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef<Record<string, Konva.Node>>({});
  const lastDatagramAtRef = useRef(0);

  // Kept in sync via effect below so commitFields/createElement/deleteSelected
  // can read the latest elements without needing `elements` in their own
  // dependency arrays (keeps their identity — and ElementRenderer's props —
  // stable across unrelated state updates).
  const elementsRef = useRef(elements);
  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  const [size, setSize] = useState({ width: 1200, height: 800 });
  const [editingId, setEditingId] = useState<string | null>(null);
  // The textarea overlay is positioned in screen pixels, so it needs the
  // camera as React state. The stage's own transform changes outside React
  // (wheel zoom, pan drag), hence the explicit sync — kept to while an editor
  // is actually open, since otherwise nothing re-renders on camera moves.
  const [camera, setCamera] = useState({ scale: 1, x: 0, y: 0 });
  const editingIdRef = useRef<string | null>(null);
  useEffect(() => {
    editingIdRef.current = editingId;
  }, [editingId]);

  const syncCamera = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    setCamera({ scale: stage.scaleX(), x: stage.x(), y: stage.y() });
  }, []);

  useEffect(() => {
    if (!cameraRef) return;
    cameraRef.current = {
      getViewportCenter() {
        const stage = stageRef.current;
        if (!stage) return { x: 0, y: 0 };
        // Screen centre back through the camera transform into world space.
        return {
          x: (stage.width() / 2 - stage.x()) / stage.scaleX(),
          y: (stage.height() / 2 - stage.y()) / stage.scaleY(),
        };
      },
      focusOn(point) {
        const stage = stageRef.current;
        if (stage) void focusStageOn(stage, point);
      },
    };
    return () => {
      cameraRef.current = null;
    };
  }, [cameraRef]);

  const [drawStart, setDrawStart] = useState<Point | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<Point | null>(null);
  const [strokePoints, setStrokePoints] = useState<Point[] | null>(null);
  const [remoteCursors, setRemoteCursors] = useState<Record<string, Point>>({});
  const [remoteDrafts, setRemoteDrafts] = useState<Record<string, Point[]>>({});

  // The stage fills its container, not the window — the board sits under a
  // header, so the two differ, and measuring the window would push the bottom
  // of the canvas out of view and skew every viewport-centre calculation.
  // "Infinite" comes from the camera (stage scale/position), not this size.
  useEffect(() => {
    const container = stageRef.current?.container()?.parentElement;
    if (!container) return;

    function updateSize() {
      setSize({
        width: container!.clientWidth,
        height: container!.clientHeight,
      });
    }
    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Transformer (resize handles) follows the current selection, for the
  // element types resizing actually makes sense for.
  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    const el = selectedId ? elements[selectedId] : null;
    const node = selectedId ? nodeRefs.current[selectedId] : null;
    // Resize handles would sit on top of the textarea while editing.
    if (
      el &&
      node &&
      el.id !== editingId &&
      RESIZABLE_TYPES.includes(el.type)
    ) {
      tr.nodes([node]);
    } else {
      tr.nodes([]);
    }
    tr.getLayer()?.batchDraw();
  }, [selectedId, elements, editingId]);

  // Cursor/draft datagrams from other clients — same channel the demo used,
  // no Redis involved, drawn as a dashed preview / a small ring. Keyed by
  // clientId so each remote client gets their own tracked cursor/draft
  // (also what a later "name label per cursor" feature will hang off of).
  useEffect(() => {
    return onDatagram((payload) => {
      const msg = payload as DatagramPayload;
      if (!msg.clientId) return; // dữ liệu cũ/hỏng, không rõ của ai — bỏ qua
      if (msg.type === "draft" && msg.points) {
        setRemoteDrafts((prev) => ({
          ...prev,
          [msg.clientId as string]: msg.points as Point[],
        }));
        // client này đang vẽ, không còn "chỉ di chuột" — bỏ vòng tròn con trỏ cũ đi
        setRemoteCursors((prev) => {
          if (!((msg.clientId as string) in prev)) return prev;
          const next = { ...prev };
          delete next[msg.clientId as string];
          return next;
        });
      } else if (typeof msg.x === "number" && typeof msg.y === "number") {
        setRemoteCursors((prev) => ({
          ...prev,
          [msg.clientId as string]: { x: msg.x as number, y: msg.y as number },
        }));
        // client này không còn vẽ dở (đã thả tay, kể cả khi nét quá ngắn để tạo
        // phần tử — trường hợp đó không có Op nào được gửi để dọn qua onOp bên dưới)
        setRemoteDrafts((prev) => {
          if (!((msg.clientId as string) in prev)) return prev;
          const next = { ...prev };
          delete next[msg.clientId as string];
          return next;
        });
      }
    });
  }, [onDatagram]);

  // Một op đáng tin cậy (reliable stream) từ 1 client đồng nghĩa họ vừa chốt
  // xong hành động — dọn draft dang dở của họ, y hệt cách index.html cũ làm
  // với `delete remoteDrafts[op.time[1]]`.
  useEffect(() => {
    return onOp((op) => {
      const authorId = op.time[1];
      setRemoteDrafts((prev) => {
        if (!(authorId in prev)) return prev;
        const next = { ...prev };
        delete next[authorId];
        return next;
      });
    });
  }, [onOp]);

  const { record, undo, redo, setDeleted } = useUndoRedo({
    elements,
    setElements,
    sendOp,
    onDeselect: (id) => setSelectedId((s) => (s === id ? null : s)),
  });

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    const el = elementsRef.current[selectedId];
    if (!el) return;
    const id = selectedId;
    setSelectedId(null);
    setDeleted(id, true);
    record({
      kind: "toggleDeleted",
      elementId: id,
      type: el.type,
      deletedAfter: true,
    });
  }, [selectedId, setSelectedId, setDeleted, record]);

  // Delete/Backspace soft-deletes the current selection; Ctrl/Cmd+Z undoes;
  // Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y redoes. All three only fire when nothing
  // else on the page has focus, same guard the delete handler always had.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (document.activeElement !== document.body) return;
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelected();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo, deleteSelected]);

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

  const commitFields = useCallback(
    (id: string, type: ElementType, changes: Record<string, unknown>) => {
      const current = elementsRef.current[id];
      const before: Record<string, unknown> = {};
      for (const field of Object.keys(changes)) {
        before[field] = current
          ? (current.data as Record<string, unknown>)[field]
          : undefined;
      }
      setElements((prev) => {
        const existing = prev[id];
        if (!existing) return prev;
        return {
          ...prev,
          [id]: {
            ...existing,
            data: { ...existing.data, ...changes },
          } as BoardElement,
        };
      });
      for (const [field, value] of Object.entries(changes))
        sendOp(id, field, value, type);
      record({ kind: "fields", elementId: id, type, before, after: changes });
    },
    [setElements, sendOp, record],
  );

  const createElement = useCallback(
    (
      type: ElementType,
      data: Record<string, unknown>,
      fields: readonly string[],
    ) => {
      const id = crypto.randomUUID();
      setElements((prev) => ({
        ...prev,
        [id]: { id, type, deleted: false, data } as BoardElement,
      }));
      setSelectedId(id);
      for (const field of fields) sendOp(id, field, data[field], type);
      record({
        kind: "toggleDeleted",
        elementId: id,
        type,
        deletedAfter: false,
      });
      return id;
    },
    [setElements, setSelectedId, sendOp, record],
  );

  const handleStartEdit = useCallback(
    (id: string) => {
      if (tool !== "select") return; // the text tool is busy drawing new boxes
      setSelectedId(id);
      syncCamera();
      setEditingId(id);
    },
    [tool, setSelectedId, syncCamera],
  );

  const handleCommitText = useCallback(
    (text: string) => {
      const id = editingId;
      setEditingId(null);
      if (!id) return;

      const el = elementsRef.current[id];
      if (!el || el.type !== "text") return;
      const data = el.data as Partial<TextData>;

      if (!text.trim()) {
        // Nothing to show, and an empty box has no hit area to click back
        // into — drop it, the way Paint discards a text box you leave blank.
        setSelectedId((s) => (s === id ? null : s));
        setDeleted(id, true);
        record({
          kind: "toggleDeleted",
          elementId: id,
          type: "text",
          deletedAfter: true,
        });
        return;
      }

      const changes: Record<string, unknown> = {};
      if (text !== data.text) changes.text = text;

      // Typing more than fits has to grow the box, otherwise the overflow is
      // simply clipped — the resize clamp only guards the other direction.
      const node = nodeRefs.current[id] as Konva.Text | undefined;
      if (node && data.size) {
        const neededHeight = textHeightAtWidth(node, data.size.width, text);
        if (neededHeight > data.size.height) {
          changes.size = { width: data.size.width, height: neededHeight };
        }
      }

      if (Object.keys(changes).length > 0) commitFields(id, "text", changes);
    },
    [editingId, commitFields, setDeleted, record, setSelectedId],
  );

  const getWorldPointer = useCallback((): Point | null => {
    const stage = stageRef.current;
    const p = stage?.getRelativePointerPosition();
    return p ? { x: p.x, y: p.y } : null;
  }, []);

  const maybeBroadcastPointer = useCallback(
    (p: Point, draftPoints: Point[] | null) => {
      if (!clientId) return; // chưa kết nối xong, chưa có id để tự nhận diện
      const now = Date.now();
      if (now - lastDatagramAtRef.current < 100) return;
      lastDatagramAtRef.current = now;
      if (draftPoints && draftPoints.length > 1) {
        sendDatagram({ type: "draft", clientId, points: draftPoints });
      } else {
        sendDatagram({ type: "cursor", clientId, x: p.x, y: p.y });
      }
    },
    [sendDatagram, clientId],
  );

  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      const pointer = stage?.getPointerPosition();
      if (!stage || !pointer) return;
      const factor = e.evt.deltaY > 0 ? 0.9 : 1.1;
      zoomStageAtPointer(stage, pointer, factor);
      if (editingIdRef.current) syncCamera();
    },
    [syncCamera],
  );

  const handleStageDragMove = useCallback(() => {
    if (editingIdRef.current) syncCamera();
  }, [syncCamera]);

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
        // Drag lays out an empty box and drops the caret straight into it,
        // like Paint — the content is typed on the canvas, not in a dialog.
        const id = createElement(
          "text",
          { position, size: boxSize, text: "", color, fontSize },
          ["position", "size", "text", "color", "fontSize"],
        );
        syncCamera();
        setEditingId(id);
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
    syncCamera,
  ]);

  const editingElement = editingId ? elements[editingId] : null;
  const editingData =
    editingElement?.type === "text"
      ? (editingElement.data as Partial<TextData>)
      : null;

  return (
    <>
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        draggable={tool === "pan"}
        onWheel={handleWheel}
        onDragMove={handleStageDragMove}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
      >
        <Layer>
          {/* Existing elements only take the pointer in Select mode. Each one
              swallows its mousedown (so selecting doesn't also clear the
              selection via the stage), which with a drawing tool meant a
              stroke or shape could never be started on top of another one.
              Konva's listening is inherited, so this one flag covers them all. */}
          <Group listening={tool === "select"}>
            {Object.values(elements)
              .filter((el) => !el.deleted)
              .map((el) => (
                <ElementRenderer
                  key={el.id}
                  element={el}
                  selected={el.id === selectedId}
                  draggable={tool === "select"}
                  editing={el.id === editingId}
                  registerNode={registerNode}
                  onSelect={handleSelect}
                  onStartEdit={handleStartEdit}
                  onCommitFields={commitFields}
                />
              ))}
          </Group>

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
            ([authorId, pts]) =>
              pts.length > 1 && (
                <Line
                  key={authorId}
                  points={flattenPoints(pts)}
                  stroke="#9ca3af"
                  dash={[4, 4]}
                  strokeWidth={2}
                  listening={false}
                />
              ),
          )}
          {Object.entries(remoteCursors).map(([id, pos]) => (
            <Circle
              key={id}
              x={pos.x}
              y={pos.y}
              radius={8}
              stroke="#d97706"
              dash={[3, 3]}
              listening={false}
            />
          ))}

          <Transformer
            ref={transformerRef}
            rotateEnabled={false}
            boundBoxFunc={(oldBox, newBox) => {
              // Stop a text box being dragged smaller than the text it holds.
              // Rejecting the whole frame (returning oldBox) rather than just
              // clamping the width keeps the box's position pinned too —
              // clamping alone lets the dragged edge run away from the box.
              const el = selectedId ? elementsRef.current[selectedId] : null;
              if (!selectedId || el?.type !== "text") return newBox;
              const node = nodeRefs.current[selectedId] as
                Konva.Text | undefined;
              if (!node) return newBox;

              // boundBox is in screen pixels, element geometry in world units.
              const scale = stageRef.current?.scaleX() ?? 1;
              const minimum = minTextBoxSize(node);
              if (newBox.width < minimum.width * scale) return oldBox;

              const minHeight = textHeightAtWidth(node, newBox.width / scale);
              if (newBox.height < minHeight * scale) return oldBox;

              return newBox;
            }}
          />
        </Layer>
      </Stage>

      {editingId && editingData?.position && editingData.size && (
        <TextEditor
          key={editingId}
          initialText={editingData.text ?? ""}
          position={editingData.position}
          size={editingData.size}
          color={editingData.color ?? "#1f2937"}
          fontSize={editingData.fontSize ?? 16}
          stageScale={camera.scale}
          stageOffset={{ x: camera.x, y: camera.y }}
          onCommit={handleCommitText}
        />
      )}
    </>
  );
}
