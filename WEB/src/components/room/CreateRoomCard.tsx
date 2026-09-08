"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCreateRoomMutation } from "@/services/client/slice/room.slice";
import parseApiErrorValue from "@/utils/parseErrorValues";
import { useAppSelector } from "@/services/client/hooks";

function getErrorMessage(error: unknown) {
  const errorValue = parseApiErrorValue(error);

  if (errorValue === "ERR_AUTHENTICATION_REQUIRED") {
    return "Your session has expired. Refresh the page and try again.";
  }

  return "Unable to create a room. Please try again.";
}

export default function CreateRoomCard() {
  const router = useRouter();
  // const authState = useAppSelector((state) => state.auth.authState);
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const isAuthenticating = useAppSelector((state) => state.auth.isLoading);
  const [createRoom, { isLoading }] = useCreateRoomMutation();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCreateRoom = async () => {
    setErrorMessage(null);

    try {
      const response = await createRoom().unwrap();

      if (!response.success) {
        setErrorMessage(response.message);
        return;
      }

      router.push(`/room/${encodeURIComponent(response.data.id)}`);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  };

  return (
    <section className="rounded-lg border border-gray-200 bg-gray-50 p-6 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-gray-900">
        Create a room
      </h2>

      <button
        type="button"
        disabled={isAuthenticating || !isAuthenticated || isLoading}
        onClick={() => void handleCreateRoom()}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
      >
        {isAuthenticating
          ? "Preparing session..."
          : isLoading
            ? "Creating room..."
            : "Create room"}
      </button>

      {errorMessage && (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {errorMessage}
        </p>
      )}
    </section>
  );
}
