import { Box, Button, Container, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useAppSelector } from "../hooks";
import SEO from "../components/SEO";
import heroImage from "../assets/images/hero.png";

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

        <Box
          component="img"
          src={heroImage}
          alt={t("home:hero.alt")}
          sx={{
            width: "100%",
            borderRadius: "8px",
            marginTop: "48px",
            boxShadow: "rgba(149, 157, 165, 0.2) 0px 8px 24px",
          }}
        />
      </Container>
    </>
  );
}

export default HomeRoute;
