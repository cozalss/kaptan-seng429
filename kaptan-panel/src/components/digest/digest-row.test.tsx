import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DigestItem } from "@/lib/domain/digest";
import { DigestRow } from "./digest-row";

const item: DigestItem = {
  disclosure_index: 42,
  kind: "contract",
  ticker: "ABCDE",
  company_name: "Deneme A.Ş.",
  line: "Yeni bir iş ilişkisi bildirdi. Tutar: 11,36 milyon USD.",
  headline: null,
  published_at: "2026-11-20T09:00:00.000Z",
  source_url: "https://www.kap.org.tr/tr/Bildirim/42",
  why: null,
  outside_list: true,
  outside_note: "KAPtan bu hisseye öneri vermez (işlem hacmi düşük)",
};

describe("DigestRow", () => {
  it("shows the line, the KAP link and the outside-the-list tag", () => {
    render(<ul><DigestRow item={item} /></ul>);
    expect(screen.getByText(/11,36 milyon USD/)).toBeTruthy();
    expect(screen.getByText("KAPtan bu hisseye öneri vermez (işlem hacmi düşük)")).toBeTruthy();
    expect(screen.getByRole("link", { name: /KAP’ta aç/ }).getAttribute("href")).toBe(item.source_url);
  });

  it("says whose company it is and has no tag for one inside the list", () => {
    render(<ul><DigestRow item={{ ...item, why: "held", outside_list: false, outside_note: null }} showKind /></ul>);
    expect(screen.getByText("Elinde var")).toBeTruthy();
    expect(screen.getByText("Yeni iş ve ihale")).toBeTruthy();
    expect(screen.queryByText(/öneri vermez/)).toBeNull();
  });
});
