import { useTranslation } from "react-i18next";
import { useState } from "react";
import { IconButton, Menu, MenuItem } from "@mui/material";
import { useColorScheme } from "@mui/material/styles";
import Palette from "@mui/icons-material/Palette";
import type { Mode } from "../AppThemeProvider";

function ThemeDropdown() {
  const { t } = useTranslation(["common"]);
  const { mode, setMode } = useColorScheme();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const changeMode = (mode: Mode) => {
    setMode(mode);
    setAnchorEl(null);
  };

  return (
    <>
      <IconButton
        size="small"
        onClick={(event) => setAnchorEl(event.currentTarget)}
      >
        <Palette />
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
      >
        <MenuItem selected={mode === "dark"} onClick={() => changeMode("dark")}>
          {t("common:mode.dark")}
        </MenuItem>
        <MenuItem
          selected={mode === "light"}
          onClick={() => changeMode("light")}
        >
          {t("common:mode.light")}
        </MenuItem>
      </Menu>
    </>
  );
}

export default ThemeDropdown;
