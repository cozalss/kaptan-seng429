import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RegimeLine } from "./guards";

describe("RegimeLine (06 §9, live over SSE desk `regime`)", () => {
  it("says calm or stormy plainly, and what a storm changes", () => {
    const { rerender, container } = render(<RegimeLine regime="normal" />);
    expect(screen.getByText("Piyasa bugün sakin. Sınırlar olağan.")).toBeTruthy();
    rerender(<RegimeLine regime="crisis" />);
    expect(screen.getByText(/^Piyasa bugün fırtınalı\. KAPtan yeni alımları yarı tutarla önerir/)).toBeTruthy();
    expect(container.querySelector("[data-regime='crisis']")).not.toBeNull();
  });
});
