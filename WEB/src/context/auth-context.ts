"use client";

import { UserDetails } from "@/lib/types/dto/UserDetails";
import React from "react";

type State = {
  placeholder: string;
};

type Action =
  | { type: 'SET_PLACEHOLDER', payload: string }
  ;

type Data = {
  userDetails?: UserDetails | null;
  guestName?: string | null;
};

const initialState: State = {
  placeholder: "",
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_PLACEHOLDER':
      return {
        ...state,
        placeholder: action.payload,
      };

    default:
      return state;
  }
}

const AuthStateContext = React.createContext<{ state: State, data: Data } | undefined>(undefined);
const AuthDispatchContext = React.createContext<React.Dispatch<Action> | undefined>(undefined);

function useAuthStateContext() {
  const context = React.useContext(AuthStateContext);
  if (context === undefined) {
    throw new Error('useAuthStateContext must be used within a AuthProvider');
  }
  return context;
}

function useAuthDispatchContext() {
  const context = React.useContext(AuthDispatchContext);
  if (context === undefined) {
    throw new Error('useAuthDispatchContext must be used within a AuthProvider');
  }
  return context;
}

// export type AuthState = State;
export type AuthAction = Action;
export type AuthData = Data;

export const AuthContextBundle = {
  StateProvider: AuthStateContext.Provider,
  DispatchProvider: AuthDispatchContext.Provider,
  initialState,
  reducer,
};

export const AuthContextFunctions = {
  useState: useAuthStateContext,
  useDispatch: useAuthDispatchContext,
}
