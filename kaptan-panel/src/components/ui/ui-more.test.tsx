import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog, DialogContent, DialogTrigger, DrawerContent, Tabs, TabsContent, TabsList, TabsTrigger, Tooltip, TooltipProvider } from "./overlay";
import { Countdown, HashChip, Sparkline } from "./data";
import { Panel, PanelBody, PanelFooter, PanelHeader } from "./panel";
import { EmptyState, ErrorState, Kbd, LlmNote, PageHeader, SampleNote, SkeletonLines } from "./primitives";
import { FixtureBadge, SeverityBadge, TemsiliBadge } from "./badge";
import { Toaster, notify } from "./toast";
import { Button } from "./button";
import { Compass, InkRule, Wordmark } from "@/components/brand/marks";
import { Disclaimer, DISCLAIMER_TR } from "@/components/brand/disclaimer";
import { __setMockDb, MockDb } from "@/lib/api/mock/db";

afterEach(() => __setMockDb(null));

describe("overlays", () => {
  it("opens a dialog with an accessible name and returns focus on Escape", async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <Dialog>
        <DialogTrigger asChild>
          <Button>Aç</Button>
        </DialogTrigger>
        <DialogContent title="Öneriyi küçült" description="Yalnızca aşağı yönlü.">
          <p>gövde</p>
        </DialogContent>
      </Dialog>,
    );
    await user.click(screen.getByRole("button", { name: "Aç" }));
    expect(screen.getByRole("dialog", { name: "Öneriyi küçült" })).toHaveAccessibleDescription("Yalnızca aşağı yönlü.");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Aç" })).toHaveFocus();
  });

  it("renders a drawer with a close button", async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <Dialog defaultOpen>
        <DrawerContent title="ORNEK · 10:12" width="lg">
          <p>çekmece</p>
        </DrawerContent>
      </Dialog>,
    );
    const drawer = screen.getByRole("dialog", { name: "ORNEK · 10:12" });
    await user.click(within(drawer).getByRole("button", { name: "Kapat" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("switches tabs from the keyboard", async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <Tabs defaultValue="tr">
        <TabsList aria-label="Dil">
          <TabsTrigger value="tr">Türkçe</TabsTrigger>
          <TabsTrigger value="en">English</TabsTrigger>
        </TabsList>
        <TabsContent value="tr">metin</TabsContent>
        <TabsContent value="en">text</TabsContent>
      </Tabs>,
    );
    await user.click(screen.getByRole("tab", { name: "Türkçe" }));
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "English" })).toHaveAttribute("data-state", "active");
  });

  it("shows a tooltip on focus", async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <TooltipProvider>
        <Tooltip content="İpucu metni">
          <Button>İpucu</Button>
        </Tooltip>
      </TooltipProvider>,
    );
    await user.tab();
    expect((await screen.findAllByText("İpucu metni")).length).toBeGreaterThan(0);
  });
});

describe("data pieces", () => {
  it("counts down on the mock clock", async () => {
    __setMockDb(new MockDb(null));
    render(<Countdown to="2027-01-12T06:50:00.000Z" label="Onay süresi" />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(await screen.findByText(/sa/)).toBeInTheDocument();
  });
  it("copies a hash and confirms it", async () => {
    const user = userEvent.setup({ delay: null });
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<HashChip hash="9f2c4b7e0a1d3c5f6e8b9a0c1d2e3f40" label="hash" />);
    await user.click(screen.getByRole("button", { name: /kopyala/ }));
    expect(writeText).toHaveBeenCalledWith("9f2c4b7e0a1d3c5f6e8b9a0c1d2e3f40");
    expect(screen.getByText("kopyalandı")).toBeInTheDocument();
  });
  it("draws a labelled sparkline, and an empty one for too few points", () => {
    const { rerender } = render(<Sparkline values={[0, 0.01, -0.02, 0.03]} baseline={0} tone="north" label="Eğri" />);
    expect(screen.getByRole("img", { name: "Eğri" }).querySelector("path")).not.toBeNull();
    rerender(<Sparkline values={[1]} label="Tek" />);
    expect(screen.getByRole("img", { name: "Tek" }).querySelector("path")).toBeNull();
  });
});

describe("static primitives", () => {
  it("renders panels, headers and states", () => {
    const retry = vi.fn();
    render(
      <>
        <PageHeader kicker="Masa" title="Onay kuyruğu" meta="3 bekliyor" actions={<Kbd>K</Kbd>} />
        <Panel raised tone="critical">
          <PanelHeader code="R07" title="Pozisyon" meta="v1" actions={<span>a</span>} />
          <PanelBody>gövde</PanelBody>
          <PanelFooter>alt</PanelFooter>
        </Panel>
        <EmptyState title="Boş" body="Açıklama" action={<span>eylem</span>} />
        <ErrorState message="Olmadı" onRetry={retry} />
        <SkeletonLines lines={2} />
        <SampleNote />
        <LlmNote />
        <SeverityBadge severity="veto" />
        <FixtureBadge />
        <TemsiliBadge />
        <Wordmark />
        <Compass north spin={10} />
        <InkRule />
        <Disclaimer />
      </>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Onay kuyruğu" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Pozisyon" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Yükleniyor" })).toBeInTheDocument();
    screen.getByRole("button", { name: "Yeniden dene" }).click();
    expect(retry).toHaveBeenCalled();
    expect(screen.getByText("örnek değer · gerçek sonuç değil")).toBeInTheDocument();
    expect(screen.getByText("DEMO FİKSTÜRÜ")).toBeInTheDocument();
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
      notify.event("Dolum", "ORNEK 1.240 lot", { label: "Aç", onClick: () => undefined });
    });
    expect(await screen.findByText("Dolum")).toBeInTheDocument();
    expect(screen.getByText("Hata")).toBeInTheDocument();
  });
});
