"use client";

import { AuthContextFunctions } from "@/context/auth-context";

export default function UserProfile() {
  const { data } = AuthContextFunctions.useState();

  return (
    <div>{JSON.stringify(data)}</div>
  )
}

