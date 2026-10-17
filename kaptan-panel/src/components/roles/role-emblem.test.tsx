import { render } from "@testing-library/react";
import { ROLES } from "@/lib/domain/user";
import { RoleEmblem } from "./role-emblem";

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

});
