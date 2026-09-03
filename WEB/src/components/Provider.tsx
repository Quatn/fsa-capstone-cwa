"use client";

import store from "@/services/client/store";
import { Provider as ReduxStoreProvider } from "react-redux";

export const Provider = ({ children }: { children: React.ReactNode }) => {
  return (
    <ReduxStoreProvider store={store}>
      {children}
    </ReduxStoreProvider>
  );
};
