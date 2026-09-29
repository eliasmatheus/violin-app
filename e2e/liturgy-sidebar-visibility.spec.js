import { test, expect } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("exibe a liturgia na lateral por padrão e permite desligar e religar a preferência", async ({
  page,
}) => {
  await page.route("http://e2e.mock/**", (route) => route.fulfill({ json: [] }));
  await page.goto("/");
  await page.locator('[data-testid="modules-ready"]').waitFor({ state: "attached" });

  const sidebar = page.locator(".shell-sidebar.liturgy-panel");
  const grid = page.locator(".shell-grid");
  const savedVisibility = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("user_data") || "{}")?.shell?.liturgy_visible);
  await expect(sidebar).toBeVisible();
  await expect(grid).toHaveClass(/shell-grid--with-sidebar/);

  // O atalho do painel abre o módulo; o controle de exibição fica no ribbon contextual.
  await sidebar.getByRole("button", { name: "Editar liturgia" }).click();
  await expect(page.locator(".liturgy-page")).toBeVisible();
  const ribbonSwitch = page
    .getByTestId("ribbon-btn-show_liturgy_sidebar")
    .getByRole("switch", { name: "Exibir liturgia na lateral" });
  await expect(ribbonSwitch).toBeChecked();
  await page.getByTestId("ribbon-btn-show_liturgy_sidebar").locator("label").click();
  await expect(ribbonSwitch).not.toBeChecked();

  await page.getByRole("button", { name: "Fechar: Liturgia", exact: true }).click();
  await expect(page.locator(".liturgy-page")).toHaveCount(0);
  await expect(sidebar).toHaveCount(0);
  await expect(grid).not.toHaveClass(/shell-grid--with-sidebar/);
  // UserData salva com debounce: só recarregar quando a preferência chegou ao disco local.
  await expect.poll(savedVisibility).toBe(false);

  // Em tela compacta a classe antiga reservaria espaço à direita mesmo sem painel.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.locator(".shell-center").evaluate((el) => getComputedStyle(el).marginRight))
    .toBe("0px");

  await page.reload();
  await page.locator('[data-testid="modules-ready"]').waitFor({ state: "attached" });
  await expect(sidebar).toHaveCount(0);
  await expect(grid).not.toHaveClass(/shell-grid--with-sidebar/);
  await expect
    .poll(() => page.locator(".shell-center").evaluate((el) => getComputedStyle(el).marginRight))
    .toBe("0px");

  // Configurações > Geral é um segundo caminho para recuperar o painel.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator(".app-menu-btn").click();
  const general = page.locator("#opt-sec-general");
  await expect(general).toBeVisible();
  const settingsCheckbox = general.getByRole("checkbox", {
    name: "Exibir liturgia na lateral da tela",
  });
  await expect(settingsCheckbox).not.toBeChecked();
  await settingsCheckbox.check();
  await expect(settingsCheckbox).toBeChecked();
  await expect(sidebar).toBeVisible();
  await expect(grid).toHaveClass(/shell-grid--with-sidebar/);
  await expect.poll(savedVisibility).toBe(true);

  await page.locator(".app-menu-back").click();
  await expect(general).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.locator(".shell-center").evaluate((el) => getComputedStyle(el).marginRight))
    .not.toBe("0px");
  await page.reload();
  await page.locator('[data-testid="modules-ready"]').waitFor({ state: "attached" });
  await expect(sidebar).toBeVisible();
  await expect(grid).toHaveClass(/shell-grid--with-sidebar/);
});
