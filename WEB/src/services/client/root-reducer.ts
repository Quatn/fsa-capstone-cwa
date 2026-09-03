import { combineReducers } from "@reduxjs/toolkit";
import { apiClient } from "./slice/api-client";
// import authReducer from "./features/authSlice";

export const rootReducer = combineReducers({
  [apiClient.reducerPath]: apiClient.reducer,
  // auth: authReducer,
});

export type RootState = ReturnType<typeof rootReducer>;
