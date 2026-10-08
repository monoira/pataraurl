import { Suspense, useEffect, useRef } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";

import { Outlet } from "react-router";

import { useTranslation } from "react-i18next";

import Header from "./components/Header";
import Footer from "./components/Footer";
import { useAppDispatch } from "./hooks";
import { useAppSelector } from "./hooks";
import { restoreSession } from "./features/auth/authThunks";

function RootLayout() {
  const { t } = useTranslation(["common"]);
  const authStatus = useAppSelector((state) => state.auth.status);
  const dispatch = useAppDispatch();
  const hasRestoredSession = useRef(false);

  useEffect(() => {
    if (authStatus === "loading" && !hasRestoredSession.current) {
      hasRestoredSession.current = true;
      void dispatch(restoreSession());
    }
  }, [authStatus, dispatch]);

  if (authStatus === "loading")
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          gap: 1,
        }}
      >
        <CircularProgress size={28} />
        <Typography>{t("common:loading")}</Typography>
      </Box>
    );

  return (
    <>
      <Header />

      <Box sx={{ minHeight: "100vh", p: 1 }}>
        <Suspense fallback={t("common:loading")}>
          <Outlet />
        </Suspense>
      </Box>

      <Footer />
    </>
  );
}

export default RootLayout;
