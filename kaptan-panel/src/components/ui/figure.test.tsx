import { render, screen } from "@testing-library/react";
import { Figure, figureText } from "./figure";

describe("Figure", () => {
  it("prints exactly what lib/format prints", () => {
    expect(figureText(1018615.4, "try")).toBe("1.018.615 TL");
    expect(figureText(0.0021, "signedPct", 2)).toBe("+%0,21");
    expect(figureText(-0.011, "pct", 1)).toBe("−%1,1");
    expect(figureText(7, "int")).toBe("7");
  });

  it("renders the plain words where animation is unavailable (jsdom)", () => {
    render(<Figure value={682947} kind="try" />);
    expect(screen.getByText("682.947 TL")).toBeInTheDocument();
  });
});
