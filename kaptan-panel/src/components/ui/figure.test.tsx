import { render, screen } from "@testing-library/react";
import { Figure, figureText } from "./figure";

describe("Figure", () => {
  it("prints exactly what lib/format prints", () => {
    expect(figureText(1018615.4, "try")).toBe("1.018.615 TL");
    expect(figureText(0.0021, "signedPct", 2)).toBe("+%0,21");
    expect(figureText(-0.011, "pct", 1)).toBe("−%1,1");
    expect(figureText(7, "int")).toBe("7");
    expect(figureText(682947.4, "lira")).toBe("682.947\u00a0₺");
    expect(figureText(18615, "signedLira")).toBe("+18.615\u00a0₺");
    expect(figureText(-2300, "signedLira")).toBe("−2.300\u00a0₺");
  });

  it("renders the plain words where animation is unavailable (jsdom)", () => {
    render(<Figure value={682947} kind="try" />);
    expect(screen.getByText("682.947 TL")).toBeInTheDocument();
  });
});
