import { isValidElement, type ReactElement } from "react";
import { render } from "@testing-library/react";
import { Num, withNums } from "./num";

type NumElement = ReactElement<{ children: string }>;
const asText = (piece: unknown) => (isValidElement(piece) ? `Num(${(piece as NumElement).props.children})` : piece);

describe("withNums", () => {
  it("wraps a percent and keeps its suffix as a plain string", () => {
    const out = withNums("%0,31’i");
    expect(out.map(asText)).toEqual(["Num(%0,31)", "’i"]);
    expect(isValidElement(out[0]) && out[0].type).toBe(Num);
  });

  it("splits a whole sentence into words and figures", () => {
    expect(withNums("Bugün 3 öneri var, en büyüğü −%5 düştü.").map(asText)).toEqual([
      "Bugün ",
      "Num(3)",
      " öneri var, en büyüğü ",
      "Num(−%5)",
      " düştü.",
    ]);
    expect(withNums("1.240 lot 48,40 TL").map(asText)).toEqual(["Num(1.240)", " lot ", "Num(48,40)", " TL"]);
  });

  it("keeps sentence punctuation outside and times whole", () => {
    expect(withNums("Saat 09:50’ye kadar, 3.").map(asText)).toEqual(["Saat ", "Num(09:50)", "’ye kadar, ", "Num(3)", "."]);
    expect(withNums("+%1,4 ve -2").map(asText)).toEqual(["Num(+%1,4)", " ve ", "Num(-2)"]);
  });

  it("returns the text unchanged when it has no figures, and never changes its input", () => {
    const text = "Zincir sağlam.";
    expect(withNums(text)).toEqual(["Zincir sağlam."]);
    expect(text).toBe("Zincir sağlam.");
    expect(withNums("")).toEqual([]);
  });

  it("renders the figure as tabular Inter", () => {
    const { container } = render(<p>{withNums("Kayıt 3.907’de")}</p>);
    expect(container.querySelector(".num")).toHaveTextContent("3.907");
    expect(container).toHaveTextContent("Kayıt 3.907’de");
  });
});
