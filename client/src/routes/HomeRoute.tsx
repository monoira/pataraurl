import { Button, Container, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useAppSelector } from "../hooks";
import SEO from "../components/SEO";

function HomeRoute() {
  const { t } = useTranslation(["common", "home", "navigation"]);
  const user = useAppSelector((state) => state.auth.user);

  return (
    <>
      <SEO
        title={t("home:htmlTag.title")}
        description={t("home:htmlTag.description")}
      />

      <Container
        component="main"
        maxWidth="md"
        sx={{ py: 8, textAlign: "center" }}
      >
        <Typography variant="h3" sx={{ fontWeight: "fontWeightBold", mb: 2 }}>
          {t("common:websiteTitle")}
        </Typography>
        <Typography variant="body1" sx={{ color: "text.secondary", mb: 6 }}>
          {t("home:productDescription")}
        </Typography>

        {!user && (
          <Stack direction="row" spacing={2} sx={{ justifyContent: "center" }}>
            <Button variant="contained" href="/login">
              {t("navigation:login")}
            </Button>
            <Button variant="outlined" href="/register">
              {t("navigation:register")}
            </Button>
          </Stack>
        )}
      </Container>
    </>
  );
}

export default HomeRoute;
