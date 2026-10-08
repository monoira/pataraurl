import { createAsyncThunk } from "@reduxjs/toolkit";
import { authApi } from "../../api/authApi";
import { usersApi } from "../../api/usersApi";
import {
  sessionUnavailable,
  setCredentials,
  tokenRefreshed,
} from "./authSlice";

export const completeLogin = createAsyncThunk(
  "auth/completeLogin",
  async (accessToken: string, { dispatch }) => {
    dispatch(tokenRefreshed(accessToken));
    const user = await dispatch(usersApi.endpoints.getMe.initiate()).unwrap();
    dispatch(setCredentials({ accessToken, user }));
  },
);

export const restoreSession = createAsyncThunk(
  "auth/restoreSession",
  async (_, { dispatch }) => {
    try {
      const { access_token } = await dispatch(
        authApi.endpoints.refresh.initiate(),
      ).unwrap();
      await dispatch(completeLogin(access_token)).unwrap();
    } catch (error) {
      dispatch(sessionUnavailable());
      throw error;
    }
  },
);
