import { expect, test } from "@playwright/test";
import { loginApi, visit } from "./helpers";
import { SCREENS } from "./screens";

/** A tablet held upright: the top bar must fit one row and no screen may scroll sideways. */
test.describe("at 768 px", () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  for (const s of SCREENS) {
    test(`${s.path} does not scroll sideways`, async ({ page }) => {
      await loginApi(page);
      await visit(page, s.path);
      await s.ready(page);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over).toBeLessThanOrEqual(0);
      const bar = await page.locator(".bar__row").boundingBox();
      expect(bar && bar.x + bar.width).toBeLessThanOrEqual(768);
      await expect(page.getByRole("button", { name: "Hesabım" })).toBeInViewport();
    });
  }
});
