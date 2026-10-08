import { z } from "zod";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation, useNavigate } from "react-router";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Link,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useLoginMutation } from "../api/authApi";
import { apiSlice } from "../api/apiSlice";
import { type FetchBaseQueryError } from "@reduxjs/toolkit/query/react";
import { useAppDispatch } from "../hooks";
import { completeLogin } from "../features/auth/authThunks";
import SEO from "../components/SEO";

const loginSchema = (messages: {
  validEmail: string;
  passwordRequired: string;
}) =>
  z.object({
    email: z.email(messages.validEmail),
    password: z.string().min(1, messages.passwordRequired),
  });
type LoginForm = z.infer<ReturnType<typeof loginSchema>>;

function LoginRoute() {
  const { t } = useTranslation(["login", "validation"]);
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const [login, { isLoading }] = useLoginMutation();
  const [serverError, setServerError] = useState<string | null>(null);
  const locationState = location.state as {
    from?: { pathname?: string };
    accountCreated?: boolean;
  } | null;

  const schema = useMemo(
    () =>
      loginSchema({
        validEmail: t("validation:validEmail"),
        passwordRequired: t("validation:passwordRequired"),
      }),
    [t],
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: LoginForm) => {
    setServerError(null);
    try {
      const { access_token } = await login(values).unwrap();
      dispatch(apiSlice.util.resetApiState());
      await dispatch(completeLogin(access_token)).unwrap();
      void navigate(locationState?.from?.pathname ?? "/dashboard", {
        replace: true,
      });
    } catch (error) {
      const isUnauthorized = (error as FetchBaseQueryError)?.status === 401;
      setServerError(
        t(isUnauthorized ? "login:invalidCredentials" : "login:loginError"),
      );
    }
  };

  return (
    <>
      <SEO
        title={t("login:htmlTag.title")}
        description={t("login:htmlTag.description")}
      />
      <Container
        component="main"
        maxWidth="xs"
        sx={{
          display: "flex",
          minHeight: "70vh",
          alignItems: "center",
          py: 6,
        }}
      >
        <Box sx={{ width: "100%" }}>
          <Typography
            variant="h3"
            component="h1"
            sx={{ fontWeight: "fontWeightBold" }}
          >
            {t("login:loginTitle")}
          </Typography>
          {locationState?.accountCreated && (
            <Alert severity="success" sx={{ mt: 2 }}>
              {t("login:accountCreated")}
            </Alert>
          )}
          <Stack
            component="form"
            spacing={3}
            sx={{ mt: 4 }}
            onSubmit={handleSubmit(onSubmit)}
          >
            <TextField
              fullWidth
              label={t("login:email")}
              type="email"
              error={Boolean(errors.email)}
              helperText={errors.email?.message}
              {...register("email")}
            />
            <TextField
              fullWidth
              label={t("login:password")}
              type="password"
              error={Boolean(errors.password)}
              helperText={errors.password?.message}
              {...register("password")}
            />
            {serverError && <Alert severity="error">{serverError}</Alert>}
            <Button
              fullWidth
              variant="contained"
              disabled={isLoading}
              type="submit"
            >
              {isLoading && (
                <CircularProgress color="inherit" size={18} sx={{ mr: 1 }} />
              )}
              {t("login:loginTitle")}
            </Button>
          </Stack>
          <Button href="/" variant="text" sx={{ mt: 1 }} fullWidth>
            {t("login:backHome")}
          </Button>
          <Typography
            color="text.secondary"
            sx={{ mt: 2, textAlign: "center" }}
            variant="body2"
          >
            {t("login:newHere")}{" "}
            <Link href="/register">{t("login:registerLink")}</Link>
          </Typography>
        </Box>
      </Container>
    </>
  );
}
export default LoginRoute;
