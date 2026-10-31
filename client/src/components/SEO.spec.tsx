import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import SEO from "./SEO";

describe("SEO", () => {
  it("renders title and meta tags", () => {
    render(<SEO title="Test Title" description="Test Description" />);

    expect(document.title).toBe("Test Title");
    const metaDesc = document.querySelector("meta[name='description']");
    expect(metaDesc?.getAttribute("content")).toBe("Test Description");
  });
});
