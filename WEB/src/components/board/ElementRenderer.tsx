"use client";

import { Ellipse, Group, Line, Rect, Text } from "react-konva";
import type Konva from "konva";
import type {
  BoardElement,
  ElementType,
  LinearData,
  ShapeData,
  TextData,
} from "@/types/board";
import { diamondPoints, flattenPoints } from "@/lib/board/geometry";

export type KonvaMouseEvent = Konva.KonvaEventObject<MouseEvent>;
export type KonvaDragEvent = Konva.KonvaEventObject<DragEvent>;
export type KonvaTransformEvent = Konva.KonvaEventObject<Event>;

interface ElementRendererProps {
  element: BoardElement;
  selected: boolean;
  draggable: boolean;
  /** Registers the underlying Konva node so BoardCanvas can attach a Transformer to it. */
  registerNode: (id: string, node: Konva.Node | null) => void;
  onSelect: (id: string) => void;
  onCommitFields: (
    id: string,
    type: ElementType,
    changes: Record<string, unknown>,
  ) => void;
}

const SELECTION_COLOR = "#000000";

/** Renders one board element as Konva node(s), plus a dashed selection outline when selected. */
export function ElementRenderer({
  element,
  selected,
  draggable,
  registerNode,
  onSelect,
  onCommitFields,
}: ElementRendererProps) {
  const { id, type, data } = element;

  const stopBubbleAndSelect = (e: KonvaMouseEvent) => {
    e.cancelBubble = true; // đừng để Stage cũng bắt đầu pan khi đang thao tác trên 1 phần tử
    onSelect(id);
  };

  if (type === "rectangle" || type === "diamond") {
    const d = data as Partial<ShapeData>;
    if (!d.position || !d.size) return null;
    const { x, y } = d.position;
    const { width, height } = d.size;
    const fill =
      d.backgroundColor && d.backgroundColor !== "transparent"
        ? d.backgroundColor
        : undefined;
    const stroke = d.strokeColor ?? "#1f2937";

    const handleDragEnd = (e: KonvaDragEvent) => {
      onCommitFields(id, type, {
        position: { x: e.target.x(), y: e.target.y() },
      });
    };
    const handleTransformEnd = (e: KonvaTransformEvent) => {
      const node = e.target as Konva.Node;
      const newWidth = Math.max(4, node.width() * node.scaleX());
      const newHeight = Math.max(4, node.height() * node.scaleY());
      node.scaleX(1);
      node.scaleY(1);
      onCommitFields(id, type, {
        position: { x: node.x(), y: node.y() },
        size: { width: newWidth, height: newHeight },
      });
    };

    return (
      <Group>
        {type === "rectangle" ? (
          <Rect
            ref={(node) => registerNode(id, node)}
            x={x}
            y={y}
            width={width}
            height={height}
            fill={fill}
            stroke={stroke}
            strokeWidth={2}
            draggable={draggable}
            onMouseDown={stopBubbleAndSelect}
            onDragEnd={handleDragEnd}
            onTransformEnd={handleTransformEnd}
          />
        ) : (
          <Line
            ref={(node) => registerNode(id, node)}
            x={x}
            y={y}
            width={width}
            height={height}
            points={diamondPoints(width, height)}
            closed
            fill={fill}
            stroke={stroke}
            strokeWidth={2}
            draggable={draggable}
            onMouseDown={stopBubbleAndSelect}
            onDragEnd={handleDragEnd}
            onTransformEnd={handleTransformEnd}
          />
        )}
        {selected && (
          <Rect
            x={x - 3}
            y={y - 3}
            width={width + 6}
            height={height + 6}
            stroke={SELECTION_COLOR}
            dash={[3, 3]}
            listening={false}
          />
        )}
      </Group>
    );
  }

  if (type === "ellipse") {
    const d = data as Partial<ShapeData>;
    if (!d.position || !d.size) return null;
    const { x, y } = d.position;
    const { width, height } = d.size;
    const fill =
      d.backgroundColor && d.backgroundColor !== "transparent"
        ? d.backgroundColor
        : undefined;
    const stroke = d.strokeColor ?? "#1f2937";
    const cx = x + width / 2;
    const cy = y + height / 2;

    const handleDragEnd = (e: KonvaDragEvent) => {
      const node = e.target;
      onCommitFields(id, type, {
        position: { x: node.x() - width / 2, y: node.y() - height / 2 },
      });
    };
    const handleTransformEnd = (e: KonvaTransformEvent) => {
      const node = e.target as Konva.Node;
      const newWidth = Math.max(4, width * node.scaleX());
      const newHeight = Math.max(4, height * node.scaleY());
      node.scaleX(1);
      node.scaleY(1);
      onCommitFields(id, type, {
        position: { x: node.x() - newWidth / 2, y: node.y() - newHeight / 2 },
        size: { width: newWidth, height: newHeight },
      });
    };

    return (
      <Group>
        <Ellipse
          ref={(node) => registerNode(id, node)}
          x={cx}
          y={cy}
          radiusX={width / 2}
          radiusY={height / 2}
          fill={fill}
          stroke={stroke}
          strokeWidth={2}
          draggable={draggable}
          onMouseDown={stopBubbleAndSelect}
          onDragEnd={handleDragEnd}
          onTransformEnd={handleTransformEnd}
        />
        {selected && (
          <Ellipse
            x={cx}
            y={cy}
            radiusX={width / 2 + 3}
            radiusY={height / 2 + 3}
            stroke={SELECTION_COLOR}
            dash={[3, 3]}
            listening={false}
          />
        )}
      </Group>
    );
  }

  if (type === "line" || type === "freedraw") {
    const d = data as Partial<LinearData>;
    if (!d.points || d.points.length < 2) return null;
    const stroke = d.strokeColor ?? "#1f2937";
    const flat = flattenPoints(d.points);

    const handleDragEnd = (e: KonvaDragEvent) => {
      const node = e.target;
      const dx = node.x();
      const dy = node.y();
      node.position({ x: 0, y: 0 }); // gộp lệch vào chính points, không giữ offset trên node
      const translated = d.points!.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      onCommitFields(id, type, { points: translated });
    };

    return (
      <Group>
        <Line
          ref={(node) => registerNode(id, node)}
          points={flat}
          stroke={stroke}
          strokeWidth={3}
          lineCap="round"
          lineJoin="round"
          tension={type === "freedraw" ? 0.3 : 0}
          draggable={draggable}
          onMouseDown={stopBubbleAndSelect}
          onDragEnd={handleDragEnd}
          hitStrokeWidth={16}
        />
        {selected && (
          <Line
            points={flat}
            stroke={SELECTION_COLOR}
            strokeWidth={9}
            opacity={0.25}
            lineCap="round"
            lineJoin="round"
            listening={false}
          />
        )}
      </Group>
    );
  }

  // type === "text"
  const d = data as Partial<TextData>;
  if (!d.position || !d.size || d.text === undefined) return null;
  const { x, y } = d.position;
  const { width, height } = d.size;
  const fontSize = d.fontSize ?? 16;
  const fill = d.color ?? "#1f2937";

  const handleDragEnd = (e: KonvaDragEvent) => {
    onCommitFields(id, type, {
      position: { x: e.target.x(), y: e.target.y() },
    });
  };
  const handleTransformEnd = (e: KonvaTransformEvent) => {
    const node = e.target as Konva.Node;
    const newWidth = Math.max(20, width * node.scaleX());
    const newHeight = Math.max(16, height * node.scaleY());
    node.scaleX(1);
    node.scaleY(1);
    onCommitFields(id, type, {
      position: { x: node.x(), y: node.y() },
      size: { width: newWidth, height: newHeight },
    });
  };

  return (
    <Group>
      <Text
        ref={(node) => registerNode(id, node)}
        x={x}
        y={y}
        width={width}
        height={height}
        text={d.text}
        fontSize={fontSize}
        fill={fill}
        wrap="word"
        draggable={draggable}
        onMouseDown={stopBubbleAndSelect}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
      />
      {selected && (
        <Rect
          x={x - 2}
          y={y - 2}
          width={width + 4}
          height={height + 4}
          stroke={SELECTION_COLOR}
          dash={[2, 2]}
          listening={false}
        />
      )}
    </Group>
  );
}
