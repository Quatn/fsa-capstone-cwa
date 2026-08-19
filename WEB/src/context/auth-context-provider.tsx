"use client";

import React from "react";
import { AuthContextBundle } from "./auth-context";
import { useFetch } from "@/hooks/useFetch";
import { refreshSession } from "@/services/api/slice/auth";

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, dispatch] = React.useReducer(AuthContextBundle.reducer, AuthContextBundle.initialState);

  const fetchAuthState = async () => {
    const response = await refreshSession();
    if (response.success === true) {
      return {
        userDetails: response.data.userDetails,
        accessToken: response.data.accessToken
      };
    }
    else {
      console.log("User is not authenticated");
      return {
        userDetails: null,
        accessToken: null
      };
    }
  }
  const authState = useFetch({
    userDetails: null,
    accessToken: null
  }, fetchAuthState, []);

  return (
    <AuthContextBundle.StateProvider value={{ state, data: { authState } }}>
      <AuthContextBundle.DispatchProvider value={dispatch}>
        {children}
      </AuthContextBundle.DispatchProvider>
    </AuthContextBundle.StateProvider>
  );
};
