import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog, DialogContent, DialogTrigger } from "./overlay";
import { ErrorState, Skeleton, SkeletonLines } from "./primitives";
import { Input, Textarea } from "./field";
import { Toaster, notify } from "./toast";
import { Button } from "./button";
import { Wordmark } from "@/components/brand/marks";
import { Disclaimer, DISCLAIMER_TR } from "@/components/brand/disclaimer";

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
  it("renders skeletons, the error box, fields, the mark and the disclaimer", () => {
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
        <Disclaimer />
      </>,
    );
    expect(screen.getByRole("status", { name: "Yükleniyor" })).toBeInTheDocument();
    screen.getByRole("button", { name: "Yeniden dene" }).click();
    expect(retry).toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "lot" })).toHaveValue("620");
    expect(screen.getByRole("link", { name: "bağlantı" })).toHaveAttribute("href", "/x");
    expect(screen.getByRole("img", { name: "KAPtan" })).toBeInTheDocument();
    expect(screen.getByText(DISCLAIMER_TR, { exact: false })).toBeInTheDocument();
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
  });
});
