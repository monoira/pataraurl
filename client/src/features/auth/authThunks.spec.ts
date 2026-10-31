import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";

import { usersApi } from "../../api/usersApi";
import { Role, type User } from "../../types/auth";

import { authReducer } from "./authSlice";
import { completeLogin } from "./authThunks";

const mockUser: User = {
  id: 1,
  email: "test@example.com",
  name: "Test",
  role: Role.MEMBER,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

vi.mock("../../api/usersApi", () => ({
  usersApi: {
    reducerPath: "usersApi",
    reducer: (state = {}) => state,
    middleware: () => (next: any) => (action: any) => next(action),
    endpoints: {
      getMe: {
        initiate: () => ({
          type: "users/getMe/initiate",
          unwrap: () => Promise.resolve(mockUser),
        }),
      },
    },
  },
}));

describe("authThunks", () => {
  it("completeLogin updates token and user state", async () => {
    const store = configureStore({
      reducer: {
        auth: authReducer,
        [usersApi.reducerPath]: usersApi.reducer,
      },
      middleware: (getDefault) => getDefault().concat(usersApi.middleware),
    });

    await store.dispatch(completeLogin("newAccessToken") as never);

    const state = store.getState().auth;
    expect(state.token).toBe("newAccessToken");
    expect(state.user).toEqual(mockUser);
    expect(state.status).toBe("authenticated");
  });
});
