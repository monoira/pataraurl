// got flag icons from
// https://flagpedia.net/index
import { useState } from "react";
import { Box, IconButton, Menu, MenuItem } from "@mui/material";
import Translate from "@mui/icons-material/Translate";
import { useTranslation } from "react-i18next";
import gbFlag from "../assets/flags/gb.png";
import geFlag from "../assets/flags/ge.png";

function LanguageChangeDropdown() {
  const { i18n, t } = useTranslation(["common"]);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  return (
    <>
      <IconButton
        size="small"
        onClick={(event) => setAnchorEl(event.currentTarget)}
      >
        <Translate />
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
      >
        <MenuItem
          onClick={() => {
            i18n.changeLanguage("en");
            setAnchorEl(null);
          }}
        >
          {t("common:language.en")}{" "}
          <Box
            component="img"
            sx={{ ml: 1 }}
            src={gbFlag}
            alt={t("common:flag.englishFlag")}
          />
        </MenuItem>
        <MenuItem
          onClick={() => {
            i18n.changeLanguage("ka");
            setAnchorEl(null);
          }}
        >
          {t("common:language.ka")}{" "}
          <Box
            component="img"
            sx={{ ml: 1 }}
            src={geFlag}
            alt={t("common:flag.georgianFlag")}
          />
        </MenuItem>
      </Menu>
    </>
  );
}

export default LanguageChangeDropdown;
