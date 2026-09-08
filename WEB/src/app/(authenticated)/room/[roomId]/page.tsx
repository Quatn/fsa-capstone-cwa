"use client";

import { useAppSelector } from "@/services/client/hooks";
import { useJoinRoomMutation } from "@/services/client/slice/room.slice";
import parseApiErrorValue from "@/utils/parseErrorValues";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

function getErrorMessage(error: unknown) {
  const errorValue = parseApiErrorValue(error);

  if (errorValue === "ERR_ROOM_NOT_FOUND") {
    return "This room does not exist.";
  }

  if (errorValue === "ERR_AUTHENTICATION_REQUIRED") {
    return "Your session has expired. Refresh the page and try again.";
  }

  return "Unable to join this room. Please try again.";
}

const StateDisplay = ({ isAuthenticated, isLoading }: { isAuthenticated: boolean, isLoading: boolean }) => {
  return (
    <div className="flex gap-2">
      <span className="rounded-full bg-green-600 px-3 py-1 text-xs font-medium text-white">
        {isAuthenticated ? "Authenticated" : "Not authenticated"}
      </span>

      <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-medium text-white">
        {isLoading ? "Loading..." : "Not loading"}
      </span>
    </div>
  );
};

export default function RoomInterfacePage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [hasJoined, setHasJoined] = useState(false);
  // const authState: AuthState | null = useAppSelector((state) =>
  //   state.auth.authState,
  // );
  const isAuthenticated: boolean = useAppSelector(
    (state) => state.auth.isAuthenticated,
  );
  const isAuthenticating: boolean = useAppSelector(
    (state) => state.auth.isLoading,
  );

  const [joinRoom, { isLoading: isJoining }] = useJoinRoomMutation();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const wrap = async () => {
      if (isAuthenticating || !isAuthenticated) {
        return;
      }

      try {
        const normalizedRoomId = roomId.trim();
        const response = await joinRoom(normalizedRoomId).unwrap();

        if (!response.success) {
          setErrorMessage(response.message);
          return;
        }

        setHasJoined(true);
      } catch (error) {
        setHasJoined(false);
        setErrorMessage(getErrorMessage(error));
      }
    }
    void wrap();
  }, [isAuthenticated, isAuthenticating, joinRoom, roomId]);

  if (isAuthenticating) {
    return <div>
      Authenticating...
      <StateDisplay isAuthenticated={isAuthenticated} isLoading={isJoining} />
    </div>;
  }

  if (isJoining) {
    return <div>
      Loading...
      <StateDisplay isAuthenticated={isAuthenticated} isLoading={isJoining} />
    </div>;
  }

  if (hasJoined) {
    return <div>
      Joined
      <StateDisplay isAuthenticated={isAuthenticated} isLoading={isJoining} />
    </div>;
  }

  return <div>
    Not joined
    <StateDisplay isAuthenticated={isAuthenticated} isLoading={isJoining} />
  </div>;
}
