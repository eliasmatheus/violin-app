import { test, expect } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("o Chromium real fornece script e posição para o diagnóstico de um frame bloqueado", async ({
  page,
}) => {
  await page.route("**/__responsiveness-fixture", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><script type="module" src="/__responsiveness-fixture.js"></script>',
    })
  );
  await page.route("**/__responsiveness-fixture.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
      import { animationFrameDiagnostic } from '/src/helpers/ResponsivenessContext.ts';
      window.measureBlockedFrame = () => new Promise((resolve) => {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration >= 1000) { observer.disconnect(); resolve(animationFrameDiagnostic(entry)); }
          }
        });
        observer.observe({type: 'long-animation-frame'});
        requestAnimationFrame(function diagnosticBlockedFrame() {
          const until = performance.now() + 1100;
          while (performance.now() < until) { /* controlled fixture */ }
          document.body.textContent = 'frame completed';
        });
      });
    `,
    })
  );
  await page.goto("/__responsiveness-fixture");
  await page.waitForFunction(() => typeof window.measureBlockedFrame === "function");
  const result = await page.evaluate(() => window.measureBlockedFrame());
  expect(result.attribution_scope).toBe("script_entry_points");
  expect(result.duration_ms).toBeGreaterThanOrEqual(1000);
  expect(result.scripts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        source_function: "diagnosticBlockedFrame",
        source_url: "http://localhost:5002/__responsiveness-fixture.js",
        source_char_position: expect.any(Number),
        duration_ms: expect.any(Number),
      }),
    ])
  );
});
