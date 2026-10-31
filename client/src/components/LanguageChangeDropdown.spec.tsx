import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import LanguageChangeDropdown from "./LanguageChangeDropdown";

const changeLanguage = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { changeLanguage },
    t: (key: string) => key,
  }),
}));

describe("LanguageChangeDropdown", () => {
  it("opens menu and changes language", () => {
    render(<LanguageChangeDropdown />);

    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText("common:language.ka"));

    expect(changeLanguage).toHaveBeenCalledWith("ka");
  });
});
