import { configureStore } from "@reduxjs/toolkit";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";

import { authReducer } from "../features/auth/authSlice";
import { Role, type User } from "../types/auth";

import ProtectedRoute from "./ProtectedRoute";

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

function renderWithStore(initialState: AuthState) {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: { auth: initialState },
  });

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/protected"]}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/protected" element={<div>Protected Content</div>} />
          </Route>
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

describe("ProtectedRoute", () => {
  it("redirects to login when unauthenticated", () => {
    renderWithStore({ user: null, token: null, status: "unauthenticated" });

    expect(screen.getByText("Login Page")).toBeTruthy();
  });

  it("renders outlet content when authenticated", () => {
    renderWithStore({
      user: mockUser,
      token: "token",
      status: "authenticated",
    });

    expect(screen.getByText("Protected Content")).toBeTruthy();
  });
});
