"use client";

import { useBoardTool, type BoardTool } from "@/context/BoardToolContext";
import type { ConnectionState } from "@/hooks/useBoardTransport";

const TOOLS: { tool: BoardTool; label: string }[] = [
  { tool: "select", label: "Select" },
  { tool: "pan", label: "Pan" },
  { tool: "rectangle", label: "Rectangle" },
  { tool: "diamond", label: "Diamond" },
  { tool: "ellipse", label: "Ellipse" },
  { tool: "line", label: "Line" },
  { tool: "freedraw", label: "Draw" },
  { tool: "text", label: "Text" },
];

const COLORS = ["#1f2937", "#ef4444", "#3b82f6", "#22c55e", "#eab308"];
const FONT_SIZES = [14, 18, 24, 32];

const CONNECTION_LABEL: Record<ConnectionState, string> = {
  connecting: "Connecting…",
  connected: "Connected",
  error: "Connection error",
};

const CONNECTION_DOT: Record<ConnectionState, string> = {
  connecting: "bg-amber-400",
  connected: "bg-emerald-400",
  error: "bg-red-500",
};

function toolButtonClasses(active: boolean) {
  return [
    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
    active
      ? "bg-indigo-500 text-white"
      : "bg-slate-800 text-slate-200 hover:bg-slate-700",
  ].join(" ");
}

interface BoardToolbarProps {
  connectionState: ConnectionState;
}

export function BoardToolbar({ connectionState }: BoardToolbarProps) {
  const { tool, setTool, color, setColor, fontSize, setFontSize } =
    useBoardTool();

  return (
    <div className="pointer-events-auto flex flex-col gap-3 rounded-xl border border-slate-700/60 bg-slate-900/90 p-3 shadow-lg shadow-black/30 backdrop-blur">
      <div className="flex flex-wrap gap-1.5">
        {TOOLS.map(({ tool: t, label }) => (
          <button
            key={t}
            type="button"
            className={toolButtonClasses(tool === t)}
            onClick={() => setTool(t)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-700/60 pt-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400">Color</span>
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Color ${c}`}
              onClick={() => setColor(c)}
              className={`h-6 w-6 rounded-full border-2 transition-transform ${color === c ? "scale-110 border-white" : "border-slate-600"}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400">Text size</span>
          {FONT_SIZES.map((fs) => (
            <button
              key={fs}
              type="button"
              onClick={() => setFontSize(fs)}
              className={toolButtonClasses(fontSize === fs)}
            >
              {fs}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1.5 text-xs text-slate-400">
          <span
            className={`h-2 w-2 rounded-full ${CONNECTION_DOT[connectionState]}`}
          />
          {CONNECTION_LABEL[connectionState]}
        </div>
      </div>
    </div>
  );
}
