import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./i18n";
import "./index.css";

import { RouterProvider } from "react-router";
import { Provider } from "react-redux";

import { store } from "./store";
import { router } from "./router.tsx";
import AppThemeProvider from "./AppThemeProvider";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Provider store={store}>
      <AppThemeProvider>
        <RouterProvider router={router} />
      </AppThemeProvider>
    </Provider>
  </StrictMode>,
);
