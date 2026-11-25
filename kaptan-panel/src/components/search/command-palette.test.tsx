import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { mockApi, renderWithApi } from "@/components/solo/money.test-utils";
import CommandPalette from "./command-palette";

const push = vi.fn();
vi.mock("next/navigation", async () => {
  const base = (await import("../nav.test-utils")).mockNavigation();
  return { ...base, useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }) };
});

beforeAll(() => {
  // jsdom lacks these; cmdk scrolls the picked row into view and watches sizes.
  Element.prototype.scrollIntoView ??= () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

describe("the Ctrl+K palette", () => {
  it("lists the screens, finds one as you type, and Enter goes there and closes", async () => {
    const u = userEvent.setup({ delay: null });
    const onOpenChange = vi.fn();
    renderWithApi(<CommandPalette open onOpenChange={onOpenChange} />, mockApi({ fresh: false }));
    const box = screen.getByRole("combobox", { name: "Sayfa, şirket ya da duyuru" });
    expect(screen.getByRole("option", { name: /Öneriye düşenler/ })).toBeInTheDocument();
    await u.type(box, "takvim");
    await waitFor(() => expect(screen.getAllByRole("option")[0]).toHaveTextContent("Takvim"));
    await u.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/takvim");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
