import { render } from "@testing-library/react";
import { ROLES } from "@/lib/domain/user";
import { renderWithDesk } from "@/components/harness.test-utils";
import { MockDb } from "@/lib/api/mock/db";
import { RoleEmblem } from "./role-emblem";
import { RolePicker } from "./role-picker";

vi.mock("next/navigation", async () => (await import("../nav.test-utils")).mockNavigation());

describe("role emblems", () => {
  it("draws a distinct, decorative emblem for every role", () => {
    const drawings = ROLES.map((role) => {
      const { container, unmount } = render(<RoleEmblem role={role} className="size-6" />);
      const svg = container.querySelector("svg");
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg).toHaveAttribute("data-emblem", role);
      expect(svg?.querySelectorAll("path, circle, rect").length).toBeGreaterThan(2);
      const html = svg?.innerHTML ?? "";
      unmount();
      return html;
    });
    expect(new Set(drawings).size).toBe(ROLES.length);
  });

  it("wears the current role's tone and emblem on the top-bar chip", () => {
    renderWithDesk(<RolePicker />, new MockDb(null), "admin");
    const chip = document.querySelector("[data-testid=role-picker]");
    expect(chip).toHaveClass("tone-admin");
    expect(chip?.querySelector("svg[data-emblem=admin]")).not.toBeNull();
  });
});
