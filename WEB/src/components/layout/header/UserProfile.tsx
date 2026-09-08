"use client";

import { useAppSelector } from "@/services/client/hooks";

export default function UserProfile() {
  const { authState } = useAppSelector((state) => state.auth);

  return (
    <div>{JSON.stringify(authState)}</div>
  )
}

