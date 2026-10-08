import { z } from "zod";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { useCreateUserMutation } from "../api/usersApi";
import { type FetchBaseQueryError } from "@reduxjs/toolkit/query/react";
import SEO from "../components/SEO";

const registerSchema = (messages: {
  nameRequired: string;
  validEmail: string;
  passwordMin: string;
}) =>
  z.object({
    name: z.string().trim().min(1, messages.nameRequired),
    email: z.email(messages.validEmail),
    password: z.string().min(8, messages.passwordMin),
  });

type RegisterForm = z.infer<ReturnType<typeof registerSchema>>;

function RegisterRoute() {
  const { t } = useTranslation(["register", "validation"]);
  const navigate = useNavigate();
  const [createUser, { isLoading }] = useCreateUserMutation();
  const [serverError, setServerError] = useState<string | null>(null);
  const schema = useMemo(
    () =>
      registerSchema({
        nameRequired: t("validation:nameRequired"),
        validEmail: t("validation:validEmail"),
        passwordMin: t("validation:passwordMin"),
      }),
    [t],
  );
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: RegisterForm) => {
    setServerError(null);
    try {
      await createUser(values).unwrap();
      void navigate("/login", {
        replace: true,
        state: { accountCreated: true },
      });
    } catch (error) {
      const isConflict = (error as FetchBaseQueryError)?.status === 409;
      setServerError(
        t(
          isConflict
            ? "register:duplicateEmail"
            : "register:createAccountError",
        ),
      );
    }
  };

  return (
    <>
      <SEO
        title={t("register:htmlTag.title")}
        description={t("register:htmlTag.description")}
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
            {t("register:registerTitle")}
          </Typography>
          <Stack
            component="form"
            spacing={3}
            sx={{ mt: 4 }}
            onSubmit={handleSubmit(onSubmit)}
          >
            <TextField
              fullWidth
              label={t("register:name")}
              type="text"
              error={Boolean(errors.name)}
              helperText={errors.name?.message}
              {...register("name")}
            />
            <TextField
              fullWidth
              label={t("register:email")}
              type="email"
              error={Boolean(errors.email)}
              helperText={errors.email?.message}
              {...register("email")}
            />
            <TextField
              fullWidth
              label={t("register:password")}
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
              {t("register:createAccount")}
            </Button>
          </Stack>
          <Button href="/login" variant="text" sx={{ mt: 1 }} fullWidth>
            {t("register:alreadyHaveAccount", {
              login: t("register:loginLink"),
            })}
          </Button>
        </Box>
      </Container>
    </>
  );
}

export default RegisterRoute;
