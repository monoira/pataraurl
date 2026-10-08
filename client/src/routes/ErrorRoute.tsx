import { Container } from "@mui/material";
import { useTranslation } from "react-i18next";
import SEO from "../components/SEO";

function ErrorRoute() {
  const { t } = useTranslation(["common"]);

  return (
    <>
      <SEO
        title={t("common:htmlTag.title")}
        description={t("common:htmlTag.description")}
      />
      <Container component="main">{t("common:error")}</Container>
    </>
  );
}

export default ErrorRoute;
