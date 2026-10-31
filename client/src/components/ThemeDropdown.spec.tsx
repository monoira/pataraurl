import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ThemeDropdown from "./ThemeDropdown";

const setMode = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@mui/material/styles", async (importActual) => {
  const actual = await importActual<typeof import("@mui/material/styles")>();

  return {
    ...actual,
    useColorScheme: () => ({ mode: "light", setMode }),
  };
});

describe("ThemeDropdown", () => {
  it("opens menu and changes theme mode", () => {
    render(<ThemeDropdown />);

    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText("common:mode.dark"));

    expect(setMode).toHaveBeenCalledWith("dark");
  });
});
