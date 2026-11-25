import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { __setMockDb, MockDb } from "@/lib/api/mock/db";
import { createMockApi } from "@/lib/api/mock/mock-api";
import { ApiProvider } from "@/lib/api/react";
import type { KaptanApi } from "@/lib/api/types";
import { MOCK_USER } from "@/lib/auth/mock-user";
import { SessionProvider } from "@/lib/auth/session-context";
import { Toaster } from "@/components/ui/toast";
import { renderWithDesk } from "../harness.test-utils";
import { SignalStrip } from "./signal-strip";

vi.mock("next/navigation", async () => (await import("../nav.test-utils")).mockNavigation());

const user = () => userEvent.setup({ delay: null });

function renderStrip() {
  return renderWithDesk(
    <>
      <SignalStrip />
      <Toaster />
    </>,
  );
}

const rowIds = () => [...document.querySelectorAll("[data-signal-index]")].map((el) => el.getAttribute("data-signal-index"));

describe("a slow first read never brings back what you already marked", () => {
  it("a reading-state answer asked before a Tamam is dropped when it arrives after it", async () => {
    const u = user();
    const db = new MockDb(null);
    __setMockDb(db);
    const base = createMockApi({ db, latencyMs: 0, live: false });
    // The first read (on mount) is taken before the click but answers after it: the server's old picture.
    let slowOnce = true;
    const api: KaptanApi = {
      ...base,
      readingState: async () => {
        const old = await base.readingState();
        if (slowOnce) {
          slowOnce = false;
          await new Promise((r) => setTimeout(r, 250));
        }
        return old;
      },
    };
    render(
      <SessionProvider user={MOCK_USER}>
        <ApiProvider api={api}>
          <SignalStrip />
        </ApiProvider>
      </SessionProvider>,
    );
    await screen.findByTestId("senin-hisselerinde");
    await waitFor(() => expect(rowIds().length).toBeGreaterThan(0));
    const first = rowIds()[0] ?? "";
    const row = document.querySelector(`[data-signal-index="${first}"]`) as HTMLElement;
    await u.click(within(row).getByRole("button", { name: "Tamam" }));
    await waitFor(() => expect(rowIds()).not.toContain(first));
    await new Promise((r) => setTimeout(r, 400));
    expect(rowIds()).not.toContain(first);
  });
});

describe("Senin hisselerinde bugün: Tamam can be taken back", () => {
  it("Tamam takes the item off the strip and a toast's Geri al puts it back, on the server too", async () => {
    const u = user();
    const { db } = renderStrip();
    const strip = await screen.findByTestId("senin-hisselerinde");
    await waitFor(() => expect(rowIds().length).toBeGreaterThan(0));
    const first = rowIds()[0] ?? "";
    const row = strip.querySelector(`[data-signal-index="${first}"]`) as HTMLElement;

    await u.click(within(row).getByRole("button", { name: "Tamam" }));
    await waitFor(() => expect(rowIds()).not.toContain(first));
    expect(db.snapshot.reading?.triage?.[first]).toBe("tamam");

    await u.click(await screen.findByRole("button", { name: "Geri al" }));
    await waitFor(() => expect(rowIds()).toContain(first));
    expect(db.snapshot.reading?.triage?.[first]).toBeUndefined();
  });

  it("Geri al puts back the state the item had before (here: Yapılacak), not an empty one", async () => {
    const u = user();
    const { db } = renderStrip();
    const strip = await screen.findByTestId("senin-hisselerinde");
    await waitFor(() => expect(rowIds().length).toBeGreaterThan(0));
    const first = rowIds()[0] ?? "";
    const row = () => strip.querySelector(`[data-signal-index="${first}"]`) as HTMLElement;

    await u.click(within(row()).getByRole("button", { name: "Yapılacak" }));
    await waitFor(() => expect(within(row()).getByRole("button", { name: "Yapılacak" })).toHaveAttribute("aria-pressed", "true"));
    await u.click(within(row()).getByRole("button", { name: "Tamam" }));
    await waitFor(() => expect(rowIds()).not.toContain(first));

    await u.click(await screen.findByRole("button", { name: "Geri al" }));
    await waitFor(() => expect(rowIds()).toContain(first));
    expect(db.snapshot.reading?.triage?.[first]).toBe("yapilacak");
    expect(within(row()).getByRole("button", { name: "Yapılacak" })).toHaveAttribute("aria-pressed", "true");
  });
});
