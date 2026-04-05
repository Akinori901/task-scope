import { createTheme } from "@mui/material/styles";
import type { ColorMode } from "../stores/viewStore";

const typography = {
  fontFamily: [
    "-apple-system",
    "BlinkMacSystemFont",
    '"Segoe UI"',
    "Roboto",
    '"Helvetica Neue"',
    "Arial",
    "sans-serif",
  ].join(","),
};

const components = {
  MuiCard: {
    styleOverrides: {
      root: {
        backgroundImage: "none",
      },
    },
  },
};

export function buildTheme(mode: ColorMode) {
  return createTheme({
    palette:
      mode === "dark"
        ? {
            mode: "dark",
            primary: { main: "#90caf9" },
            secondary: { main: "#f48fb1" },
            error: { main: "#ff8a80" },
            warning: { main: "#ffb74d" },
            success: { main: "#69f0ae" },
            background: { default: "#121212", paper: "#1e1e1e" },
          }
        : {
            mode: "light",
            primary: { main: "#1976d2" },
            secondary: { main: "#d81b60" },
            error: { main: "#d32f2f" },
            warning: { main: "#ed6c02" },
            success: { main: "#2e7d32" },
            background: { default: "#f5f5f5", paper: "#ffffff" },
          },
    typography,
    components,
  });
}

// デフォルトエクスポートは既存 import の互換用
const theme = buildTheme("dark");
export default theme;
