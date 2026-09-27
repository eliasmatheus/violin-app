import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

async function openVideoPage(page, moduleId) {
  await page.locator("#ribbon-tab-collections").click();
  await page.locator(`[data-testid="ribbon-btn-${moduleId}"]`).click();
  await page.locator(`#ribbon-tab-ctx_${moduleId}`).click();
  await expect(page.locator(".video-monitors")).toBeVisible();
}

async function expectControlsFit(page) {
  const geometry = await page.locator(".video-monitors").evaluate((controls) => {
    const content = controls.closest(".ribbon-group-content").getBoundingClientRect();
    const children = [...controls.querySelectorAll(".video-monitors-label, .lj-select, .lj-check")];
    return children.map((child) => {
      const rect = child.getBoundingClientRect();
      return {
        left: rect.left - content.left,
        right: rect.right - content.right,
        top: rect.top - content.top,
        bottom: rect.bottom - content.bottom,
      };
    });
  });

  for (const rect of geometry) {
    expect(rect.left).toBeGreaterThanOrEqual(-1);
    expect(rect.right).toBeLessThanOrEqual(1);
    expect(rect.top).toBeGreaterThanOrEqual(-1);
    expect(rect.bottom).toBeLessThanOrEqual(1);
  }
}

test("as duas páginas de vídeo usam controles de projeção legíveis e a mesma preferência", async ({
  page,
}) => {
  await page.route("**/json_db/**", (route) => route.fulfill({ json: [] }));
  await page.goto("/");
  await page.locator("#ribbon-tab-collections").waitFor({ state: "visible", timeout: 20_000 });

  await openVideoPage(page, "online_videos");
  await expect(page.locator('[data-testid="ribbon-btn-online_videos_settings"]')).toBeVisible();
  await expect(page.locator("#video-return-monitor")).toBeDisabled();

  await page.locator("#video-projection-monitor").click();
  await page.locator(".lj-select__item").filter({ hasText: "Projeção" }).click();
  await page.locator(".video-monitors .lj-check").click();
  await expect(page.locator("#video-return-monitor")).toBeEnabled();
  await page.locator("#video-return-monitor").click();
  await page.locator(".lj-select__item").filter({ hasText: "Retorno (Stage)" }).click();

  for (const width of [1366, 1024]) {
    await page.setViewportSize({ width, height: 768 });
    await expectControlsFit(page);
  }

  // Uma coleção larga pode deixar o ribbon rolado. A nova aba começa do início.
  await page.locator(".ribbon-body").evaluate((body) => (body.scrollLeft = 200));
  await openVideoPage(page, "custom_online_videos");
  await expect(page.locator(".ribbon-body")).toHaveJSProperty("scrollLeft", 0);
  await expect(page.locator("#video-projection-monitor")).toContainText("Projeção");
  await expect(page.locator("#video-return-monitor")).toContainText("Retorno (Stage)");
  await expect(page.locator("#video-return-monitor")).toBeEnabled();
  await expectControlsFit(page);
});
