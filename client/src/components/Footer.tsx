import { Box, Typography } from "@mui/material";

function Footer() {
  return (
    <Box
      component="footer"
      sx={{
        minHeight: 64,
        display: "grid",
        placeItems: "center",
        borderTop: 1,
        borderColor: "divider",
      }}
    >
      <Typography sx={{ fontWeight: "bold" }}>
        {new Date().getUTCFullYear()}
      </Typography>
    </Box>
  );
}

export default Footer;
