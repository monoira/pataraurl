import { describe, expect, it } from "vitest";

import { Role, type User } from "../../types/auth";

import {
  authReducer,
  logOut,
  sessionUnavailable,
  setCredentials,
  tokenRefreshed,
} from "./authSlice";

describe("authSlice", () => {
  const mockUser: User = {
    id: 1,
    email: "test@example.com",
    name: "Test User",
    role: Role.MEMBER,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it("handles initial state", () => {
    expect(authReducer(undefined, { type: "unknown" })).toEqual({
      user: null,
      token: null,
      status: "loading",
    });
  });

  it("handles setCredentials", () => {
    const nextState = authReducer(
      undefined,
      setCredentials({ user: mockUser, accessToken: "token123" }),
    );

    expect(nextState).toEqual({
      user: mockUser,
      token: "token123",
      status: "authenticated",
    });
  });

  it("handles logOut", () => {
    const initialState = {
      user: mockUser,
      token: "token123",
      status: "authenticated" as const,
    };
    const nextState = authReducer(initialState, logOut());

    expect(nextState).toEqual({
      user: null,
      token: null,
      status: "unauthenticated",
    });
  });

  it("handles sessionUnavailable", () => {
    const nextState = authReducer(undefined, sessionUnavailable());

    expect(nextState.status).toBe("unauthenticated");
  });

  it("handles tokenRefreshed", () => {
    const initialState = {
      user: mockUser,
      token: "oldToken",
      status: "authenticated" as const,
    };
    const nextState = authReducer(initialState, tokenRefreshed("newToken"));

    expect(nextState.token).toBe("newToken");
  });
});
