import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataTable, sortRows, type Column } from "./table";
import { ConfirmDialog } from "./confirm-dialog";
import { RequiredComment, validateComment, COMMENT_MAX } from "./field";
import { Badge, EventBadge, RuleMark } from "./badge";
import { Stat } from "./primitives";

interface Row {
  id: string;
  name: string;
  n: number;
}
const rows: Row[] = [
  { id: "a", name: "Şeker", n: 2 },
  { id: "b", name: "Çay", n: 10 },
  { id: "c", name: "Ayran", n: 1 },
];
const cols: Column<Row>[] = [
  { key: "name", header: "Ad", cell: (r) => r.name, sortValue: (r) => r.name },
  { key: "n", header: "Sayı", cell: (r) => r.n, sortValue: (r) => r.n, align: "right" },
];

describe("sortRows", () => {
  it("sorts numbers numerically and strings with Turkish collation, without mutating", () => {
    const copy = [...rows];
    expect(sortRows(rows, cols[1], "asc").map((r) => r.n)).toEqual([1, 2, 10]);
    expect(sortRows(rows, cols[0], "asc").map((r) => r.name)).toEqual(["Ayran", "Çay", "Şeker"]);
    expect(sortRows(rows, cols[1], "desc").map((r) => r.n)).toEqual([10, 2, 1]);
    expect(rows).toEqual(copy);
  });
});

describe("DataTable", () => {
  it("sorts by header click and exposes aria-sort", async () => {
    const user = userEvent.setup({ delay: null });
    render(<DataTable caption="Örnek" columns={cols} rows={rows} getRowId={(r) => r.id} />);
    const table = screen.getByRole("table", { name: "Örnek" });
    await user.click(within(table).getByRole("button", { name: /Sayı/ }));
    const header = within(table).getAllByRole("columnheader")[1];
    expect(header).toHaveAttribute("aria-sort", "ascending");
    const firstCells = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((r) => within(r).getAllByRole("cell")[1]?.textContent);
    expect(firstCells).toEqual(["1", "2", "10"]);
  });
  it("opens a row from the keyboard", async () => {
    const user = userEvent.setup({ delay: null });
    const onRowClick = vi.fn();
    render(<DataTable caption="Örnek" columns={cols} rows={rows} getRowId={(r) => r.id} onRowClick={onRowClick} />);
    const row = screen.getAllByRole("row")[1] as HTMLElement;
    row.focus();
    await user.keyboard("{Enter}");
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });
  it("shows the empty slot when there are no rows", () => {
    render(<DataTable caption="Boş" columns={cols} rows={[]} getRowId={(r) => r.id} empty="Kayıt yok" />);
    expect(screen.getByText("Kayıt yok")).toBeInTheDocument();
  });
});

describe("comment validation", () => {
  it("requires text and caps the length", () => {
    expect(validateComment("   ")).not.toBeNull();
    expect(validateComment("Kanıt zayıf")).toBeNull();
    expect(validateComment("a".repeat(COMMENT_MAX + 1))).not.toBeNull();
    expect(validateComment("abc", 5)).not.toBeNull();
  });
  it("renders a labelled, required textarea with a live counter", async () => {
    const user = userEvent.setup({ delay: null });
    function Harness() {
      const [v, setV] = useState("");
      return <RequiredComment value={v} onChange={setV} />;
    }
    render(<Harness />);
    const box = screen.getByRole("textbox", { name: /Gerekçe/ });
    expect(box).toHaveAttribute("aria-required", "true");
    await user.type(box, "Tamam");
    expect(screen.getByText(`5/${COMMENT_MAX}`)).toBeInTheDocument();
  });
});

describe("ConfirmDialog", () => {
  function Harness({ onConfirm }: { onConfirm: (r: { comment: string; totp: string }) => void }) {
    const [open, setOpen] = useState(true);
    return (
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Tüm işlemleri durdur"
        phrase="DURDUR"
        confirmLabel="Durdur"
        requireComment
        requireTotp
        onConfirm={onConfirm}
      />
    );
  }

  it("stays disabled until the phrase, a comment and a 6-digit code are given", async () => {
    const user = userEvent.setup({ delay: null });
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    const dialog = screen.getByRole("dialog", { name: "Tüm işlemleri durdur" });
    const confirm = within(dialog).getByRole("button", { name: "Durdur" });
    expect(confirm).toBeDisabled();

    await user.type(within(dialog).getByRole("textbox", { name: /DURDUR/ }), "durdur");
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox", { name: /Gerekçe/ }), "Test durdurma");
    await user.type(within(dialog).getByLabelText(/kod/i), "123456");
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith({ comment: "Test durdurma", totp: "123456" });
  });
});

describe("badges and stats", () => {
  it("labels event codes in Turkish and maps FILTER to X (Ç-2)", () => {
    render(
      <>
        <EventBadge type="E3" />
        <EventBadge type="FILTER" compact />
      </>,
    );
    expect(screen.getByText("E3")).toBeInTheDocument();
    expect(screen.getByText("X")).toBeInTheDocument();
  });
  it("announces rule outcomes to screen readers", () => {
    render(
      <>
        <RuleMark passed label="R01" />
        <RuleMark passed={false} critical label="R04" />
      </>,
    );
    expect(screen.getByText("Geçti")).toBeInTheDocument();
    expect(screen.getByText("Geçmedi")).toBeInTheDocument();
  });
  it("sets percent signs apart from the Bodoni digits", () => {
    const { container } = render(<Stat label="Drawdown" value="−%5,2" tone="north" />);
    expect(container.textContent).toContain("−%5,2");
    expect(container.querySelectorAll("span.font-sans").length).toBe(2);
  });
  it("merges badge classes without losing the tone colour", () => {
    render(<Badge tone="north-solid" className="text-ui">Kritik</Badge>);
    expect(screen.getByText("Kritik").className).toContain("text-on-dark");
  });
});
