/**
 * Shared types for the whiteboard's board elements.
 *
 * An element is never sent over the wire as one whole object. Clients send
 * one `BoardOp` per field that changed, and the server merges each field
 * independently — last-write-wins by `time[0]` (ms timestamp), tie-broken by
 * `time[1]` (sending client id). This file is the single source of truth for
 * both shapes: what a merged element looks like, and what a legal field op
 * looks like for each element type. See board-elements.md for the narrative
 * version of this file.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export const ELEMENT_TYPES = [
  "rectangle",
  "diamond",
  "ellipse",
  "line",
  "freedraw",
  "text",
] as const;

export type ElementType = (typeof ELEMENT_TYPES)[number];

// ---------------------------------------------------------------------------
// Per-type `data` shapes — this is what board_elements.data (jsonb) holds.
// ---------------------------------------------------------------------------

/** rectangle | diamond | ellipse — anything defined by a bounding box. */
export interface ShapeData {
  position: Point; // top-left corner of the bounding box
  size: Size;
  strokeColor: string; // CSS color, e.g. "#1f2937"
  backgroundColor: string; // fill color; "transparent" if unfilled
}

/** line | freedraw — anything defined by an ordered list of points. */
export interface LinearData {
  points: Point[]; // absolute canvas coordinates, in drawing order
  strokeColor: string;
}

export interface TextData {
  position: Point; // top-left of the text box
  size: Size; // box the text wraps within — chosen by dragging, like a shape
  text: string;
  color: string;
  fontSize: number; // px
}

export interface BoardElementDataMap {
  rectangle: ShapeData;
  diamond: ShapeData;
  ellipse: ShapeData;
  line: LinearData;
  freedraw: LinearData;
  text: TextData;
}

export type BoardElementData = BoardElementDataMap[ElementType];

export const FIELDS_BY_TYPE: { [T in ElementType]: readonly (keyof BoardElementDataMap[T])[] } = {
  rectangle: ["position", "size", "strokeColor", "backgroundColor"],
  diamond: ["position", "size", "strokeColor", "backgroundColor"],
  ellipse: ["position", "size", "strokeColor", "backgroundColor"],
  line: ["points", "strokeColor"],
  freedraw: ["points", "strokeColor"],
  text: ["position", "size", "text", "color", "fontSize"],
};

/**
 * A fully merged element as reconstructed from Redis/Postgres.
 * `data` is Partial because a brand new element may not have every field's
 * op merged in yet (e.g. "position" arrived but "backgroundColor" hasn't).
 */
export type BoardElement = {
  [T in ElementType]: {
    id: string;
    type: T;
    deleted: boolean;
    data: Partial<BoardElementDataMap[T]>;
  };
}[ElementType];

// ---------------------------------------------------------------------------
// Field-level ops sent over WebTransport streams.
// ---------------------------------------------------------------------------

export type FieldOf<T extends ElementType> = keyof BoardElementDataMap[T];

/** One field mutation for one element of type T. */
export type BoardOp = {
  [T in ElementType]: {
    [F in FieldOf<T>]: {
      elementId: string;
      type: T;
      field: F;
      value: BoardElementDataMap[T][F];
      time: [number, string];
    };
  }[FieldOf<T>];
}[ElementType];

/**
 * Marks a whole element as deleted or restored. Deliberately kept outside
 * `BoardElementDataMap` — deletion isn't part of the element's rendered
 * data, it's a separate soft-delete flag (mirrors board_elements.deleted /
 * deleted_at in Postgres, see board-elements.md).
 */
export interface DeleteOp {
  elementId: string;
  field: "deleted";
  value: boolean;
  time: [number, string];
}

export type Op = BoardOp | DeleteOp;

// ---------------------------------------------------------------------------
// Runtime validation — JSON.parse gives you `any`; this narrows `unknown`
// into a real Op (or null) without ever casting through `any`.
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isPoint(v: unknown): v is Point {
  return isRecord(v) && typeof v.x === "number" && typeof v.y === "number";
}

function isSize(v: unknown): v is Size {
  return isRecord(v) && typeof v.width === "number" && typeof v.height === "number";
}

function isElementType(v: unknown): v is ElementType {
  return typeof v === "string" && (ELEMENT_TYPES as readonly string[]).includes(v);
}

function isFieldValueValid(field: string, value: unknown): boolean {
  switch (field) {
    case "position":
      return isPoint(value);
    case "size":
      return isSize(value);
    case "points":
      return Array.isArray(value) && value.every(isPoint);
    case "strokeColor":
    case "backgroundColor":
    case "color":
    case "text":
      return typeof value === "string";
    case "fontSize":
      return typeof value === "number";
    default:
      return false;
  }
}

/** Parses + validates a raw, untrusted network payload into a typed Op. */
export function parseOp(raw: unknown): Op | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.elementId !== "string" || typeof raw.field !== "string") return null;

  const t = raw.time;
  if (!Array.isArray(t) || t.length !== 2 || typeof t[0] !== "number" || typeof t[1] !== "string") {
    return null;
  }
  const time: [number, string] = [t[0], t[1]];

  if (raw.field === "deleted") {
    if (typeof raw.value !== "boolean") return null;
    return { elementId: raw.elementId, field: "deleted", value: raw.value, time };
  }

  if (!isElementType(raw.type)) return null;
  const type = raw.type;

  const legalFields: readonly string[] = FIELDS_BY_TYPE[type];
  if (!legalFields.includes(raw.field)) return null;
  if (!isFieldValueValid(raw.field, raw.value)) return null;

  // Every branch above has already verified `field`/`value` agree with
  // `type`, so this reflects a runtime-checked invariant, not a blind cast.
  return { elementId: raw.elementId, type, field: raw.field, value: raw.value, time } as BoardOp;
}