"use client";

import React, { useMemo } from "react";
import { AuthContextBundle } from "./auth-context";
import { useRefreshSessionQuery } from "@/services/client/slice/auth.slice";
import { accessTokenStore } from "@/services/client/auth-token";

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, dispatch] = React.useReducer(AuthContextBundle.reducer, AuthContextBundle.initialState);

  const { data: refreshSessionResponse } = useRefreshSessionQuery();

  const { userDetails, guestName } = useMemo(() => {
    if (!!refreshSessionResponse && refreshSessionResponse.success === true) {
      accessTokenStore.set(refreshSessionResponse.data.accessToken);
      return {
        userDetails: refreshSessionResponse.data.userDetails,
        guestName: refreshSessionResponse.data.guestName
      }
        ;
    }
    else {
      console.log("User is not authenticated");
      return {
        userDetails: null,
        guestName: null
      };
    }
  }, [refreshSessionResponse]);

  return (
    <AuthContextBundle.StateProvider value={{ state, data: { userDetails, guestName } }}>
      <AuthContextBundle.DispatchProvider value={dispatch}>
        {children}
      </AuthContextBundle.DispatchProvider>
    </AuthContextBundle.StateProvider>
  );
};
