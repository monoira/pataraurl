import { CssBaseline, GlobalStyles } from "@mui/material";
import type { LinkProps } from "@mui/material/Link";
import {
  StyledEngineProvider,
  ThemeProvider,
  createTheme,
  useColorScheme,
} from "@mui/material/styles";

import { forwardRef, type ReactNode } from "react";

import {
  Link as RouterLink,
  type LinkProps as RouterLinkProps,
} from "react-router";

// combining RouterLink into MUI Link component
// https://mui.com/material-ui/integrations/routing/#global-theme-link

const LinkBehavior = forwardRef<
  HTMLAnchorElement,
  Omit<RouterLinkProps, "to"> & { href: RouterLinkProps["to"] }
>((props, ref) => {
  const { href, ...other } = props;
  return <RouterLink ref={ref} to={href} {...other} />;
});

// colorScheme / theme / mode

export type Mode = NonNullable<ReturnType<typeof useColorScheme>["mode"]>;

const theme = createTheme({
  cssVariables: { colorSchemeSelector: "class" },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: "#92487A" },
        secondary: { main: "#E49BA6" },
      },
    },
    dark: {
      palette: {
        primary: { main: "#92487A" },
        secondary: { main: "#E49BA6" },
      },
    },
  },
  components: {
    MuiLink: { defaultProps: { component: LinkBehavior } as LinkProps },
    MuiButtonBase: { defaultProps: { LinkComponent: LinkBehavior } },
  },
});

function AppThemeProvider({ children }: { children: ReactNode }) {
  return (
    <StyledEngineProvider enableCssLayer>
      <ThemeProvider theme={theme}>
        <GlobalStyles styles="@layer theme, base, mui, components, utilities;" />
        <CssBaseline />
        {children}
      </ThemeProvider>
    </StyledEngineProvider>
  );
}

export default AppThemeProvider;
