"use client";

import { useCallback, useRef, useState } from "react";
import { BoardToolProvider } from "@/context/BoardToolContext";
import { useBoardTransport } from "@/hooks/useBoardTransport";
import { useFollow } from "@/hooks/useFollow";
import { useAppSelector } from "@/services/client/hooks";
import { CameraStore, type BoardCamera } from "@/lib/board/camera";
import { themeSwatch } from "@/lib/board/theme";
import type { Point } from "@/types/board";
import { BoardCanvas } from "./BoardCanvas";
import { BoardToolbar } from "./BoardToolbar";
import { ChatPanel } from "./ChatPanel";
import { FollowMenu } from "./FollowMenu";
import { RemoteCursors } from "./RemoteCursors";

export interface BoardWorkspaceProps {
  roomId: string;
  wsUrl: string;
  certHashBase64: string;
}

function BoardWorkspaceInner({
  roomId,
  wsUrl,
  certHashBase64,
}: BoardWorkspaceProps) {
  const participantId = useAppSelector(
    (state) => state.auth.authState?.participantId ?? null,
  );

  // BoardCanvas owns the Konva stage; the chat panel and following read and
  // move the view through this handle rather than reaching for the stage.
  const cameraRef = useRef<BoardCamera | null>(null);
  // Fed by BoardCanvas, read by the overlays (cursors, text editor), so a
  // camera move re-renders only those rather than the whole canvas.
  const [cameraStore] = useState(() => new CameraStore());
  const [chatOpen, setChatOpen] = useState(false);

  const {
    elements,
    setElements,
    sendOp,
    sendDatagram,
    onDatagram,
    onOp,
    chatMessages,
    sendChat,
    participants,
    connectionState,
    clientId,
  } = useBoardTransport({
    url: wsUrl,
    certHashBase64,
    roomId,
    participantId,
  });

  const { followingId, follow, unfollow } = useFollow({
    cameraRef,
    cameraStore,
    clientId,
    participants,
    sendDatagram,
    onDatagram,
  });

  const getViewportCenter = useCallback(
    () => cameraRef.current?.getViewportCenter() ?? null,
    [],
  );

  const focusCoordinate = useCallback(
    (point: Point) => {
      // Jumping somewhere yourself means you're no longer following anyone.
      unfollow();
      cameraRef.current?.focusOn(point);
    },
    [unfollow],
  );

  const followed = followingId ? participants[followingId] : undefined;
  const followedSwatch = followed ? themeSwatch(followed.themeColor) : null;

  return (
    // overflow-clip rather than overflow-hidden: both clip the collapsed chat
    // panel, but `hidden` still makes this a scrollable box, so focusing or
    // revealing anything parked off-screen shunts the whole board sideways.
    <div className="relative h-full w-full overflow-clip bg-white">
      <BoardCanvas
        elements={elements}
        setElements={setElements}
        sendOp={sendOp}
        sendDatagram={sendDatagram}
        onDatagram={onDatagram}
        onOp={onOp}
        clientId={clientId}
        cameraRef={cameraRef}
        cameraStore={cameraStore}
        onCameraGesture={unfollow}
      />
      <RemoteCursors
        onDatagram={onDatagram}
        participants={participants}
        cameraStore={cameraStore}
      />
      <div className="pointer-events-none absolute left-4 top-4 z-10">
        <BoardToolbar connectionState={connectionState} />
      </div>

      {/* Stays clear of the chat panel when it's open, like the chat button. */}
      <div
        className={`absolute top-4 z-30 transition-all duration-200 ${
          chatOpen ? "right-[21rem]" : "right-4"
        }`}
      >
        <FollowMenu
          participants={participants}
          selfClientId={clientId}
          followingId={followingId}
          onFollow={follow}
          onUnfollow={unfollow}
        />
      </div>

      {followed && followedSwatch && (
        <>
          <div
            className="pointer-events-none absolute inset-0 z-20 border-4"
            style={{ borderColor: followedSwatch.background }}
            aria-hidden
          />
          <div
            className="absolute bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full py-1 pl-3 pr-1 text-sm font-medium shadow-lg"
            style={{
              backgroundColor: followedSwatch.background,
              color: followedSwatch.text,
            }}
          >
            Following {followed.displayName}
            <button
              type="button"
              onClick={unfollow}
              className="rounded-full bg-black/15 px-2 py-0.5 text-xs hover:bg-black/25"
            >
              Stop
            </button>
          </div>
        </>
      )}

      <ChatPanel
        open={chatOpen}
        messages={chatMessages}
        canSend={connectionState === "connected" && participantId !== null}
        onSend={sendChat}
        onFocusCoordinate={focusCoordinate}
        getViewportCenter={getViewportCenter}
      />

      <button
        type="button"
        onClick={() => setChatOpen((open) => !open)}
        aria-label={chatOpen ? "Collapse chat" : "Open chat"}
        aria-expanded={chatOpen}
        // Sits clear of the panel when it's open rather than on top of it.
        className={`absolute bottom-6 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500 text-white shadow-lg transition-all duration-200 hover:bg-indigo-400 ${
          chatOpen ? "right-[22rem]" : "right-6"
        }`}
      >
        {chatOpen ? (
          <span aria-hidden className="text-lg leading-none">
            ›
          </span>
        ) : (
          <span aria-hidden className="text-lg leading-none">
            💬
          </span>
        )}
        {!chatOpen && chatMessages.length > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-slate-900 px-1 text-[10px] font-semibold text-white ring-2 ring-indigo-500">
            {chatMessages.length > 99 ? "99+" : chatMessages.length}
          </span>
        )}
      </button>
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
