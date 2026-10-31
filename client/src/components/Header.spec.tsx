import { configureStore } from "@reduxjs/toolkit";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { apiSlice } from "../api/apiSlice";
import { authReducer } from "../features/auth/authSlice";
import { Role, type User } from "../types/auth";

import Header from "./Header";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../api/authApi", () => ({
  useLogoutMutation: () => [() => ({ unwrap: () => Promise.resolve() })],
}));

const mockUser: User = {
  id: 1,
  email: "test@example.com",
  name: "Test",
  role: Role.MEMBER,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

type AuthState = {
  user: User | null;
  token: string | null;
  status: "loading" | "authenticated" | "unauthenticated";
};

function renderHeader(initialState: AuthState) {
  const store = configureStore({
    reducer: {
      auth: authReducer,
      [apiSlice.reducerPath]: apiSlice.reducer,
    },
    middleware: (getDefault) => getDefault().concat(apiSlice.middleware),
    preloadedState: { auth: initialState },
  });

  return render(
    <Provider store={store}>
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    </Provider>,
  );
}

describe("Header", () => {
  it("renders login and register buttons when unauthenticated", () => {
    renderHeader({ user: null, token: null, status: "unauthenticated" });

    expect(screen.getByText("navigation:login")).toBeTruthy();
    expect(screen.getByText("navigation:register")).toBeTruthy();
  });

  it("renders logout button and links when authenticated", () => {
    renderHeader({
      user: mockUser,
      token: "token",
      status: "authenticated",
    });

    expect(screen.getByText("navigation:logout")).toBeTruthy();
    expect(screen.getByText("navigation:links")).toBeTruthy();
  });
});
