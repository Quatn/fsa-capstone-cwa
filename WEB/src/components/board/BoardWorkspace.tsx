"use client";

import { BoardToolProvider } from "@/context/BoardToolContext";
import { useBoardTransport } from "@/hooks/useBoardTransport";
import { BoardCanvas } from "./BoardCanvas";
import { BoardToolbar } from "./BoardToolbar";

export interface BoardWorkspaceProps {
  wsUrl: string;
  certHashBase64: string;
}

function BoardWorkspaceInner({ wsUrl, certHashBase64 }: BoardWorkspaceProps) {
  const {
    elements,
    setElements,
    sendOp,
    sendDatagram,
    onDatagram,
    onOp,
    connectionState,
    clientId,
  } = useBoardTransport({
    url: wsUrl,
    certHashBase64,
  });

  return (
    <div className="relative h-dvh w-dvw overflow-hidden bg-white">
      <BoardCanvas
        elements={elements}
        setElements={setElements}
        sendOp={sendOp}
        sendDatagram={sendDatagram}
        onDatagram={onDatagram}
        onOp={onOp}
        clientId={clientId}
      />
      <div className="pointer-events-none absolute left-4 top-4 z-10">
        <BoardToolbar connectionState={connectionState} />
      </div>
    </div>
  );
}

/** Public entry point — wrap the actual hook/canvas so BoardToolProvider covers both toolbar and canvas. */
export function BoardWorkspace(props: BoardWorkspaceProps) {
  return (
    <BoardToolProvider>
      <BoardWorkspaceInner {...props} />
    </BoardToolProvider>
  );
}
