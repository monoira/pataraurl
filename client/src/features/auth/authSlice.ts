import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { User } from "../../types/auth";

type AuthState = {
  user: User | null;
  token: string | null;
  status: "loading" | "authenticated" | "unauthenticated";
};
const initialState: AuthState = {
  user: null,
  token: null,
  status: "loading",
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials: (
      state,
      action: PayloadAction<{ user: User; accessToken: string }>,
    ) => {
      const { user, accessToken } = action.payload;
      state.user = user;
      state.token = accessToken;
      state.status = "authenticated";
    },
    tokenRefreshed: (state, action: PayloadAction<string>) => {
      state.token = action.payload;
    },
    sessionUnavailable: (state) => {
      state.status = "unauthenticated";
    },
    logOut: (state) => {
      state.user = null;
      state.token = null;
      state.status = "unauthenticated";
    },
  },
});

export const { logOut, setCredentials, sessionUnavailable, tokenRefreshed } =
  authSlice.actions;
export const authReducer = authSlice.reducer;
