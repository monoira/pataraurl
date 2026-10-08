import { createBrowserRouter } from "react-router";
import type { ComponentType } from "react";
import ProtectedRoute from "./components/ProtectedRoute";

// boilerplate needed for lazy loading routes
function lazyRoute<T extends { default: ComponentType }>(
  load: () => Promise<T>,
) {
  return async () => {
    const { default: Component, ...rest } = await load();
    return { Component, ...rest };
  };
}

// react-router - data mode
export const router = createBrowserRouter([
  {
    path: "/",
    lazy: lazyRoute(() => import("./RootLayout.tsx")),
    children: [
      {
        index: true,
        lazy: lazyRoute(() => import("./routes/HomeRoute.tsx")),
      },
      {
        path: "login",
        lazy: lazyRoute(() => import("./routes/LoginRoute.tsx")),
      },
      {
        path: "register",
        lazy: lazyRoute(() => import("./routes/RegisterRoute.tsx")),
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            path: "dashboard",
            lazy: lazyRoute(() => import("./routes/AdminDashboardRoute.tsx")),
          },
          {
            path: "links",
            lazy: lazyRoute(() => import("./routes/LinksDashboardRoute.tsx")),
          },
        ],
      },
      {
        path: "s/:shortCode",
        lazy: lazyRoute(() => import("./routes/ShortRedirectRoute.tsx")),
      },
      {
        path: "*",
        lazy: lazyRoute(() => import("./routes/ErrorRoute.tsx")),
      },
    ],
  },
]);
