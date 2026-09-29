import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block", reducedMotion: "reduce" });

// Com playwright.build.config.js, a página da fixture usa o bundle desktop e
// esta segunda página usa o Vite dev. Na suíte comum, ambas usam o Vite dev.
const DEV_URL = "http://localhost:5002/ui";

async function captureStyles(page, selector) {
  return page.locator(selector).evaluateAll((roots) => {
    const properties = [
      "fontFamily",
      "fontSize",
      "fontWeight",
      "lineHeight",
      "color",
      "backgroundColor",
      "borderTopWidth",
      "borderTopStyle",
      "borderTopColor",
      "borderRadius",
      "boxShadow",
      "filter",
      "width",
      "height",
      "padding",
      "gap",
    ];
    return roots
      .flatMap((root) => [root, ...root.querySelectorAll("*")])
      .filter((element) => element.getBoundingClientRect().height > 0)
      .map((element) => {
        const style = getComputedStyle(element);
        // O catálogo avança o progresso por timer. A largura da barra e do
        // percentual descreve esse estado, não uma diferença de CSS.
        const measured = element.matches(".lj-progress__bar, .lj-progress__value")
          ? properties.filter((property) => property !== "width")
          : properties;
        return {
          element: `${element.tagName}.${element.getAttribute("class") ?? ""}`,
          styles: Object.fromEntries(measured.map((property) => [property, style[property]])),
        };
      });
  });
}

async function expectSizeContracts(page) {
  const controls = await page.locator('.cat__main [class*="lj-ui-size-"]').evaluateAll((elements) =>
    elements.map((element) => {
      const size = [...element.classList].find((name) => name.startsWith("lj-ui-size-")).slice(11);
      const style = getComputedStyle(element);
      return {
        size,
        height: parseFloat(style.height),
        expectedHeight: parseFloat(style.getPropertyValue(`--lj-ui-h-${size}`)),
        font: parseFloat(style.fontSize),
        expectedFont: parseFloat(style.getPropertyValue(`--lj-ui-font-${size}`)),
      };
    })
  );
  expect(new Set(controls.map((control) => control.size))).toEqual(
    new Set(["sm", "md", "lg", "touch"])
  );
  for (const control of controls) {
    expect(control.height).toBe(control.expectedHeight);
    expect(control.font).toBe(control.expectedFont);
  }
  for (const icon of await page.locator(".lj-card__icon, .lj-empty__icon").all()) {
    await expect(icon).toHaveCSS("filter", "none");
  }
}

async function expectSizesWithDifferentParentFont(page) {
  // Em outras telas a fonte herdada pode ser maior. Reusa o DOM real dos
  // controles e o CSS carregado, variando só o contexto e a classe de tamanho.
  const matrix = await page.locator(".cat__main").evaluate((catalog) => {
    const host = document.createElement("div");
    host.style.cssText = "position:absolute;left:-10000px;font:19px/1.7 Arial";
    catalog.append(host);
    const controls = [];
    try {
      for (const selector of [".lj-btn", ".lj-input", ".lj-select", ".lj-combobox__anchor"]) {
        const original = catalog.querySelector(selector);
        for (const size of ["sm", "md", "lg", "touch"]) {
          const element = original.cloneNode(true);
          for (const name of [...element.classList]) {
            if (name.startsWith("lj-ui-size-")) element.classList.remove(name);
          }
          element.classList.add(`lj-ui-size-${size}`);
          host.append(element);
          const style = getComputedStyle(element);
          controls.push({
            control: `${selector}/${size}`,
            font: parseFloat(style.fontSize),
            expectedFont: parseFloat(style.getPropertyValue(`--lj-ui-font-${size}`)),
            height: parseFloat(style.height),
            expectedHeight: parseFloat(style.getPropertyValue(`--lj-ui-h-${size}`)),
          });
        }
      }
    } finally {
      host.remove();
    }
    return controls;
  });
  for (const control of matrix) {
    expect(control.font, control.control).toBe(control.expectedFont);
    expect(control.height, control.control).toBe(control.expectedHeight);
  }
}

test("primitivos mantêm aparência, medidas e camadas no dev e no build", async ({
  page,
  browser,
}) => {
  const dev = await browser.newPage({
    viewport: { width: 1366, height: 768 },
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  try {
    await page.setViewportSize({ width: 1366, height: 768 });
    await Promise.all([page.goto("/ui"), dev.goto(DEV_URL)]);
    for (const current of [page, dev]) {
      await current.locator(".cat__main").waitFor();
      await current.evaluate(() => document.fonts.ready);
      // Compara o estado final dos controles, sem amostrar uma transição de
      // hover/foco em instantes diferentes nas duas páginas.
      await current.addStyleTag({
        content: "*, *::before, *::after { transition: none !important; }",
      });
    }

    for (const theme of ["blue", "dark"]) {
      for (const current of [page, dev]) {
        await current.locator(".cat__theme").getByText(theme, { exact: true }).click();
        await expect(current.locator("html")).toHaveAttribute("data-theme", theme);
        await current.mouse.move(0, 0);
        await expectSizeContracts(current);
        await expectSizesWithDifferentParentFont(current);
      }
      const baseline = await captureStyles(dev, ".cat__main");
      expect(baseline.length).toBeGreaterThan(100);
      expect(await captureStyles(page, ".cat__main")).toEqual(baseline);

      // Portais não ficam sob o componente: verifica também menus e campos
      // dentro de diálogos, onde o CSS compartilhado e o CSS lazy se encontram.
      for (const current of [page, dev]) {
        await current.getByRole("button", { name: "Abrir diálogo", exact: true }).click();
        await expect(current.getByRole("dialog")).toBeVisible();
        await current.getByRole("dialog").getByRole("combobox").click();
        await expect(current.getByRole("listbox")).toBeVisible();
        await current.mouse.move(0, 0);
      }
      const layers = '.lj-dialog__overlay, [role="dialog"], [role="listbox"]';
      const layerBaseline = await captureStyles(dev, layers);
      await expect.poll(() => captureStyles(page, layers)).toEqual(layerBaseline);
      for (const current of [page, dev]) {
        await current.keyboard.press("Escape");
        await expect(current.getByRole("listbox")).not.toBeVisible();
        await current
          .getByRole("dialog")
          .getByRole("button", { name: "Cancelar", exact: true })
          .click();
        await expect(current.locator(".lj-dialog, .lj-dialog__overlay")).toHaveCount(0);
        await current.evaluate(() => document.activeElement?.blur());
      }

      // HMR e imports lazy mudam a posição das folhas. Os contratos visuais
      // devem prevalecer em ambas as ordens, depois que os links recarregarem.
      for (const current of [page, dev]) {
        await current.evaluate(() => {
          const sheets = document.querySelectorAll(
            'style[data-vite-dev-id], link[rel="stylesheet"]'
          );
          [...sheets].reverse().forEach((sheet) => document.head.append(sheet));
        });
        await expect.poll(() => captureStyles(current, ".cat__main")).toEqual(baseline);
        await expectSizesWithDifferentParentFont(current);
      }
    }
  } finally {
    await dev.close();
  }
});
