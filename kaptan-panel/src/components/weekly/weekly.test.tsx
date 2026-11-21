import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { __setMockDb } from "@/lib/api/mock/db";
import { stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import { renderWithDesk } from "../harness.test-utils";
import { nav } from "../nav.test-utils";
import { WeeklyScreen } from "./weekly-screen";
import { alertsSentence, weeklySentence } from "./weekly-words";
import type { WeeklySummary } from "@/lib/domain/weekly";

vi.mock("next/navigation", async () =>
  (await import("../nav.test-utils")).mockNavigation(),
);

afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
  __setMockDb(null);
  nav.push.mockReset();
});

const base: WeeklySummary = {
  start: "2026-11-16",
  end: "2026-11-22",
  label_tr: "16–22 Kasım 2026",
  is_current: false,
  started: true,
  put_in_net: 0,
  value_start: null,
  value_end: null,
  gain_try: 1250,
  dividends_try: null,
  read: 10,
  suggestions: {
    made: 0,
    took: 0,
    skipped: 0,
    declined: 0,
    expired: 0,
    waiting: 0,
  },
  benchmark: {
    start: null,
    end: null,
    available: false,
    you_ratio: null,
    index_ratio: null,
    sentence_tr: null,
    reason_tr: null,
  },
  alerts_sent: 0,
  notes_tr: [],
};

describe("weekly words", () => {
  it("says what the money did, or why it cannot", () => {
    expect(weeklySentence(base)).toMatch(/^16–22 Kasım 2026 paran .* arttı\.$/);
    expect(
      weeklySentence({ ...base, is_current: true, gain_try: -40 }),
    ).toMatch(/^Bu hafta paran .* azaldı\.$/);
    expect(weeklySentence({ ...base, gain_try: null })).toBe(
      "16–22 Kasım 2026 paranın ne kadar değiştiğini hesaplayamadım.",
    );
    expect(weeklySentence({ ...base, started: false })).toBe(
      "16–22 Kasım 2026 için henüz başlangıç paran yok.",
    );
    expect(alertsSentence(base)).toBe(
      "Bu hafta telefonuna ya da e-postana bildirim gitmedi.",
    );
  });
});

describe("/gecmis/hafta", () => {
  it("opens on this week and steps back and forward", async () => {
    const u = userEvent.setup({ delay: null });
    renderWithDesk(<WeeklyScreen />);
    expect(
      await screen.findByRole("heading", { level: 1, name: /Haftalık özet/ }),
    ).toBeInTheDocument();
    expect(await screen.findByTestId("hafta-kaptan")).toBeInTheDocument();
    const next = screen.getByRole("button", { name: "Sonraki hafta" });
    expect(next).toBeDisabled();
    await u.click(screen.getByRole("button", { name: "Önceki hafta" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Sonraki hafta" }),
      ).toBeEnabled(),
    );
  });
});
