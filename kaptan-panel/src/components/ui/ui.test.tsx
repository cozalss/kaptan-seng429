import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog, DialogContent, DialogTrigger } from "./overlay";
import { ErrorState, Skeleton, SkeletonLines } from "./primitives";
import { Hint, Input, Textarea } from "./field";
import { Toaster, notify } from "./toast";
import { Button } from "./button";
import { Arrow } from "./arrow";
import { MENU_CONTENT, MENU_ITEM } from "./menu";
import { Wordmark } from "@/components/brand/marks";

describe("dialog", () => {
  it("opens with an accessible name and returns focus on Escape", async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <Dialog>
        <DialogTrigger asChild>
          <Button>Aç</Button>
        </DialogTrigger>
        <DialogContent title="Reddet" description="Emir yazılmaz." tone="critical" size="sm">
          <p>gövde</p>
        </DialogContent>
      </Dialog>,
    );
    await user.click(screen.getByRole("button", { name: "Aç" }));
    expect(screen.getByRole("dialog", { name: "Reddet" })).toHaveAccessibleDescription("Emir yazılmaz.");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Aç" })).toHaveFocus();
  });

  it("falls back to the title as its description", async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <Dialog>
        <DialogTrigger>aç</DialogTrigger>
        <DialogContent title="Yalnız başlık" size="lg">
          x
        </DialogContent>
      </Dialog>,
    );
    await user.click(screen.getByText("aç"));
    expect(screen.getByRole("dialog", { name: "Yalnız başlık" })).toBeInTheDocument();
  });
});

describe("primitives", () => {
  it("renders skeletons, the error box, fields, and the mark", () => {
    const retry = vi.fn();
    render(
      <>
        <Skeleton className="h-4" />
        <SkeletonLines lines={2} />
        <ErrorState message="Olmadı" onRetry={retry} />
        <ErrorState message="Sessiz" />
        <Input aria-label="lot" defaultValue="620" />
        <Textarea aria-label="not" />
        <Button asChild variant="primary">
          <a href="/x">bağlantı</a>
        </Button>
        <Wordmark />
      </>,
    );
    expect(screen.getByRole("status", { name: "Yükleniyor" })).toBeInTheDocument();
    screen.getByRole("button", { name: "Yeniden dene" }).click();
    expect(retry).toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "lot" })).toHaveValue("620");
    expect(screen.getByRole("link", { name: "bağlantı" })).toHaveAttribute("href", "/x");
    expect(screen.getByRole("img", { name: "KAPtan" })).toBeInTheDocument();
  });
});

describe("buttons", () => {
  it("says it is busy while pending", () => {
    render(
      <Button variant="primary" pending disabled>
        İmzala
      </Button>,
    );
    const b = screen.getByRole("button", { name: "İmzala" });
    expect(b).toHaveAttribute("aria-busy", "true");
    expect(b).toHaveAttribute("data-pending", "true");
    expect(b).toBeDisabled();
  });

  it("draws a lock before the words of a button closed for your role", () => {
    render(
      <Button locked disabled>
        Onayla
      </Button>,
    );
    const b = screen.getByRole("button", { name: "Onayla" });
    expect(b.querySelector("svg[aria-hidden]")).not.toBeNull();
    expect(b).not.toHaveAttribute("aria-busy");
  });

  it("has a text-button variant with a 44px target and no shadow", () => {
    render(<Button variant="link">Risk Sorumlusu gözüyle bak →</Button>);
    const b = screen.getByRole("button", { name: /gözüyle bak/ });
    expect(b.className).toMatch(/min-h-11/);
    expect(b.className).not.toMatch(/shadow-ink/);
    expect(b.className).toMatch(/underline/);
  });
});

describe("small pieces", () => {
  it("links a hint to its field and draws decorative arrows", () => {
    const { container } = render(
      <>
        <label htmlFor="lot">Lot</label>
        <Input id="lot" aria-describedby="lot-ipucu" />
        <Hint id="lot-ipucu">Tam sayı yaz.</Hint>
        <Arrow />
        <Arrow dir="left" />
        <Arrow dir="down" />
      </>,
    );
    expect(screen.getByRole("textbox", { name: "Lot" })).toHaveAccessibleDescription("Tam sayı yaz.");
    expect(container.querySelectorAll("svg[aria-hidden]")).toHaveLength(3);
  });

  it("shares one menu look", () => {
    expect(MENU_CONTENT).toMatch(/shadow-ink/);
    expect(MENU_CONTENT).toMatch(/menu-in/);
    expect(MENU_ITEM).toMatch(/py-3/);
  });
});

describe("toasts", () => {
  it("prints info, success, error and event slips", async () => {
    render(<Toaster />);
    act(() => {
      notify.info("Bilgi", "a");
      notify.success("Tamam", "b");
      notify.error("Hata", "c");
      notify.event("Yeni öneri", undefined, { label: "İncele", onClick: () => undefined });
    });
    expect(await screen.findByText("Yeni öneri")).toBeInTheDocument();
    expect(screen.getByText("Hata")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Bildirimi kapat" }).length).toBeGreaterThan(0);
  });
});
