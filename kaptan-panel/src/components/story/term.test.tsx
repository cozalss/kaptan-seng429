import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Term } from "./term";

const user = () => userEvent.setup({ delay: null });

describe("Term", () => {
  it("is a button in the sentence that opens one plain line on a click", async () => {
    const u = user();
    render(
      <p>
        Şirket bir <Term word="bildirim">bildirim</Term> gönderdi.
      </p>,
    );
    await u.click(screen.getByRole("button", { name: "bildirim: ne demek?" }));
    expect(await screen.findByRole("dialog", { name: "bildirim: anlamı" })).toHaveTextContent("resmî açıklama");
  });

  it("opens with the keyboard and closes with Escape, returning focus", async () => {
    const u = user();
    render(<Term word="geri alım">geri alımı</Term>);
    const word = screen.getByRole("button", { name: "geri alımı: ne demek?" });
    word.focus();
    await u.keyboard("{Enter}");
    expect(await screen.findByRole("dialog", { name: "geri alım: anlamı" })).toBeInTheDocument();
    await u.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(word).toHaveFocus();
  });

  it("defaults its text to the word itself", () => {
    render(<Term word="aracı kurum" />);
    expect(screen.getByRole("button", { name: "aracı kurum: ne demek?" })).toHaveTextContent("aracı kurum");
  });
});
