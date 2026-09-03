"use client";

import React, { useMemo } from "react";
import { AuthContextBundle } from "./auth-context";
import { useRefreshSessionQuery } from "@/services/client/slice/auth.slice";
import { accessTokenStore } from "@/services/client/auth-token";

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, dispatch] = React.useReducer(AuthContextBundle.reducer, AuthContextBundle.initialState);

  const { data: refreshSessionResponse } = useRefreshSessionQuery();

  const userDetails = useMemo(() => {
    if (!!refreshSessionResponse && refreshSessionResponse.success === true) {
      accessTokenStore.set(refreshSessionResponse.data.accessToken);
      return refreshSessionResponse.data.userDetails;
    }
    else {
      console.log("User is not authenticated");
      return null;
    }
  }, [refreshSessionResponse]);

  return (
    <AuthContextBundle.StateProvider value={{ state, data: { userDetails } }}>
      <AuthContextBundle.DispatchProvider value={dispatch}>
        {children}
      </AuthContextBundle.DispatchProvider>
    </AuthContextBundle.StateProvider>
  );
};
