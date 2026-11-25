import { render } from "@testing-library/react";
import { Sparkline, sparkPath } from "./sparkline";

describe("Sparkline", () => {
  it("draws a rising series from bottom-left to top-right", () => {
    const geo = sparkPath([1, 2, 3]);
    expect(geo?.line.startsWith("M0,30C")).toBe(true);
    expect(geo?.line.endsWith(",120,2")).toBe(true);
    expect(geo?.area.endsWith("Z")).toBe(true);
    expect(geo?.area).toContain("L120,32");
  });

  it("draws nothing for a flat or one-point series", () => {
    expect(sparkPath([5, 5, 5])).toBeNull();
    expect(sparkPath([5])).toBeNull();
    const { container } = render(<Sparkline values={[1, 1]} />);
    expect(container.querySelector("svg")).toBeNull();
  });
});
