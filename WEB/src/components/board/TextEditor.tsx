"use client";

import { useEffect, useRef, useState } from "react";
import type { Point, Size } from "@/types/board";
import {
  TEXT_FONT_FAMILY,
  TEXT_LINE_HEIGHT,
  TEXT_PADDING,
} from "@/lib/board/text";

interface TextEditorProps {
  initialText: string;
  position: Point;
  size: Size;
  color: string;
  fontSize: number;
  /** Camera transform, so the overlay lands exactly on top of the Konva node. */
  stageScale: number;
  stageOffset: Point;
  onCommit: (text: string) => void;
}

/**
 * An HTML textarea laid over the canvas while a text element is being edited.
 * Konva can't take keyboard input itself, so the usual approach is to hide
 * the Konva node and mirror it with a real input styled to match — see
 * ElementRenderer, which takes `editing` for exactly that.
 */
export function TextEditor({
  initialText,
  position,
  size,
  color,
  fontSize,
  stageScale,
  stageOffset,
  onCommit,
}: TextEditorProps) {
  const [value, setValue] = useState(initialText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Guards against blur firing on top of an Escape/Ctrl+Enter commit.
  // Deliberately NOT also committing on unmount: Strict Mode mounts, tears
  // down and remounts every effect, so an unmount commit fires with the
  // still-empty initial value and a brand new box is discarded as blank the
  // instant it is drawn.
  const committedRef = useRef(false);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, []);

  function commit() {
    if (committedRef.current) return;
    committedRef.current = true;
    onCommit(value);
  }

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        // Enter inserts a newline, like Paint — Escape and Ctrl/Cmd+Enter are
        // the ways out. Board shortcuts (Delete, Ctrl+Z) stay inert on their
        // own while this has focus: BoardCanvas ignores keys unless the body
        // is the active element.
        if (
          e.key === "Escape" ||
          (e.key === "Enter" && (e.ctrlKey || e.metaKey))
        ) {
          e.preventDefault();
          commit();
        }
      }}
      style={{
        position: "absolute",
        left: position.x * stageScale + stageOffset.x,
        top: position.y * stageScale + stageOffset.y,
        width: size.width * stageScale,
        height: size.height * stageScale,
        fontSize: fontSize * stageScale,
        fontFamily: TEXT_FONT_FAMILY,
        lineHeight: TEXT_LINE_HEIGHT,
        padding: TEXT_PADDING * stageScale,
        color,
        margin: 0,
        border: "1px dashed #6366f1",
        outline: "none",
        background: "transparent",
        boxSizing: "border-box",
        resize: "none",
        overflow: "hidden",
        whiteSpace: "pre-wrap",
        wordBreak: "normal",
      }}
    />
  );
}
