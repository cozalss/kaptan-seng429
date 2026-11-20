import { render, screen } from "@testing-library/react";
import { currentTimeMs } from "@/lib/clock";
import { exactPriceTime } from "@/lib/solo/money-words";
import { PriceAge } from "./price-age";

const minutesAgo = (min: number) => new Date(currentTimeMs() - min * 60_000).toISOString();

describe("PriceAge", () => {
  it("says how old the prices are in plain words, and gives the exact time to a keyboard user", async () => {
    const asOf = minutesAgo(5);
    render(<PriceAge asOf={asOf} />);
    const line = await screen.findByText(/^Fiyatlar bugün \d\d:\d\d’(ten|den)\./);
    expect(line).toHaveAttribute("tabindex", "0");
    expect(line).toHaveAttribute("data-exact", exactPriceTime(asOf));
    // The exact time is also read out, not only shown on hover.
    expect(line).toHaveTextContent(exactPriceTime(asOf));
  });

  it("says a price from yesterday is from yesterday", async () => {
    render(<PriceAge asOf={minutesAgo(26 * 60)} />);
    expect(await screen.findByText(/^Fiyatlar (dün|\d+ [A-ZÇĞİÖŞÜa-zçğıöşü]+ gününden)/)).toBeInTheDocument();
  });

  it("says nothing when there is no price to speak of (cash only)", async () => {
    const { container } = render(<PriceAge asOf={null} />);
    await new Promise((r) => setTimeout(r, 10));
    expect(container).toBeEmptyDOMElement();
  });

  it("for one holding says so when its price has not come yet", async () => {
    render(<PriceAge asOf={null} holding />);
    const line = await screen.findByText("Fiyatı henüz gelmedi; aldığın fiyattan sayılıyor.");
    expect(line).not.toHaveAttribute("tabindex");
  });

  it("for one holding says how old the price is", async () => {
    render(<PriceAge asOf={minutesAgo(3)} holding />);
    expect(await screen.findByText(/^Fiyatı bugün \d\d:\d\d’(ten|den)\./)).toBeInTheDocument();
  });
});
