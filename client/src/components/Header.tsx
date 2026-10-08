import { useTranslation } from "react-i18next";
import { NavLink } from "react-router";
import { Box, Button, Link, Stack, Typography } from "@mui/material";
import Dashboard from "@mui/icons-material/Dashboard";
import LinkIcon from "@mui/icons-material/Link";
import Login from "@mui/icons-material/Login";
import Logout from "@mui/icons-material/Logout";
import PersonAdd from "@mui/icons-material/PersonAdd";
import ThemeDropdown from "./ThemeDropdown";
import LanguageChangeDropdown from "./LanguageChangeDropdown";
import { useAppDispatch, useAppSelector } from "../hooks";
import { useLogoutMutation } from "../api/authApi";
import { logOut } from "../features/auth/authSlice";
import { apiSlice } from "../api/apiSlice";
import { Role } from "../types/auth";

function Header() {
  const { t } = useTranslation(["navigation"]);
  const user = useAppSelector((state) => state.auth.user);
  const dispatch = useAppDispatch();
  const [logout] = useLogoutMutation();
  const handleLogout = async () => {
    try {
      await logout().unwrap();
    } finally {
      dispatch(logOut());
      dispatch(apiSlice.util.resetApiState());
    }
  };

  return (
    <Box
      component="header"
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 1,
        borderBottom: 1,
        borderColor: "divider",
        px: 2,
        pt: 0.5,
      }}
    >
      <Stack component="nav" direction="row">
        <Link
          component={NavLink}
          end
          to="/"
          underline="none"
          sx={{
            color: "text.primary",
            px: 1.5,
            py: 1,
            borderBottom: 2,
            borderColor: "transparent",
            "&.active": { borderColor: "primary.main" },
          }}
        >
          {t("navigation:home")}
        </Link>
        {user && (
          <Link
            component={NavLink}
            to="/links"
            underline="none"
            sx={{
              color: "text.primary",
              display: "inline-flex",
              alignItems: "center",
              gap: 0.5,
              px: 1.5,
              py: 1,
              borderBottom: 2,
              borderColor: "transparent",
              "&.active": { borderColor: "primary.main" },
            }}
          >
            <LinkIcon sx={{ fontSize: "small" }} />
            {t("navigation:links")}
          </Link>
        )}
        {user && (user.role === Role.OWNER || user.role === Role.ADMIN) && (
          <Link
            component={NavLink}
            to="/dashboard"
            underline="none"
            sx={{
              color: "text.primary",
              display: "inline-flex",
              alignItems: "center",
              gap: 0.5,
              px: 1.5,
              py: 1,
              borderBottom: 2,
              borderColor: "transparent",
              "&.active": { borderColor: "primary.main" },
            }}
          >
            <Dashboard sx={{ fontSize: "small" }} />
            {t("navigation:adminDashboard")}
          </Link>
        )}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        {user ? (
          <Button
            color="inherit"
            size="small"
            startIcon={<Logout />}
            onClick={handleLogout}
          >
            {t("navigation:logout")}
          </Button>
        ) : (
          <>
            <Button
              component={NavLink}
              size="small"
              variant="contained"
              to="/login"
              startIcon={<Login />}
            >
              <Typography component="span" sx={{ pt: 0.5 }}>
                {t("navigation:login")}
              </Typography>
            </Button>
            <Button
              component={NavLink}
              size="small"
              variant="contained"
              to="/register"
              startIcon={<PersonAdd />}
            >
              <Typography component="span" sx={{ pt: 0.5 }}>
                {t("navigation:register")}
              </Typography>
            </Button>
          </>
        )}
        <LanguageChangeDropdown />
        <ThemeDropdown />
      </Stack>
    </Box>
  );
}

export default Header;
