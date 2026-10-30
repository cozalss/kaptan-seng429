import { render } from "@testing-library/react";
import { Sparkline, sparkPath } from "./sparkline";

describe("Sparkline", () => {
  it("draws a rising series from bottom-left to top-right", () => {
    const geo = sparkPath([1, 2, 3]);
    expect(geo?.line).toBe("M0.0 30.0 L60.0 16.0 L120.0 2.0");
    expect(geo?.area.endsWith("L120 32 L0 32 Z")).toBe(true);
  });

  it("draws nothing for a flat or one-point series", () => {
    expect(sparkPath([5, 5, 5])).toBeNull();
    expect(sparkPath([5])).toBeNull();
    const { container } = render(<Sparkline values={[1, 1]} />);
    expect(container.querySelector("svg")).toBeNull();
  });
});
