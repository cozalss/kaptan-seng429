import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RegimeLine } from "./portfolio-hero";

describe("RegimeLine (06 §9, live over SSE desk `regime`)", () => {
  it("says Normal or Kriz plainly", () => {
    const { rerender, container } = render(<RegimeLine regime="normal" />);
    expect(screen.getByText("Piyasa: Normal")).toBeTruthy();
    rerender(<RegimeLine regime="crisis" />);
    expect(screen.getByText("Piyasa: Kriz")).toBeTruthy();
    expect(container.querySelector("[data-regime='crisis']")).not.toBeNull();
  });
});
