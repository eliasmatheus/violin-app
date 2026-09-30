import { test, expect } from "@playwright/test";

test("liturgy announcement projects its slide and linked overlay", async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: "block" });
  await context.route("http://e2e.mock/**", (route) => route.fulfill({ json: [] }));

  try {
    const operator = await context.newPage();
    await operator.goto("/");
    await operator.locator('[data-testid="modules-ready"]').waitFor({ state: "attached" });

    await operator.evaluate(async () => {
      const { default: idb } = await import("/src/helpers/IndexedDB.ts");
      const { DB_TABLE } = await import("/src/constants/DbTables.ts");
      const { writeSlot } = await import("/src/helpers/Overlay.ts");
      const { createOverlaySlot } = await import("/src/types/Overlay.ts");
      const { default: Liturgy } = await import("/src/helpers/Liturgy.ts");
      const { default: WebRoles } = await import("/src/helpers/projection/WebRoles.ts");

      WebRoles.setRole("projection", "current");

      await idb.put(DB_TABLE.ANNOUNCEMENTS, {
        id: "linked-announcement-slide",
        nome: "Aviso do culto",
        ordem: 1,
        texto: "Slide do anúncio vinculado",
      });
      await writeSlot(
        createOverlaySlot({
          id: "linked-announcement-overlay",
          name: "Letreiro do anúncio",
          content: "Sobreposição projetada",
          enabled: false,
        })
      );
      Liturgy.add({
        tipo: "anuncios",
        item: "Anúncios com letreiro",
        anuncios_ids: ["linked-announcement-slide"],
        linked_overlay_id: "linked-announcement-overlay",
      });
    });

    await operator.getByRole("button", { name: "Editar liturgia" }).click();
    const card = operator.locator("[data-item-id]").filter({ hasText: "Anúncios com letreiro" });
    await expect(card).toBeVisible();

    const projectionOpening = context.waitForEvent("page");
    await card.locator(".lit-card-text").click();
    const projection = await projectionOpening;
    await expect(projection).toHaveURL(/\/projection\/announcements$/);
    await expect(projection.locator(".ann-root")).toBeVisible();

    await expect(projection.locator(".ann-text")).toHaveText("Slide do anúncio vinculado");
    await expect
      .poll(() =>
        operator.evaluate(async () => {
          const { readAllSlots } = await import("/src/helpers/Overlay.ts");
          return (await readAllSlots()).find((slot) => slot.id === "linked-announcement-overlay")
            ?.enabled;
        })
      )
      .toBe(true);
    await expect(projection.locator('[data-slot-id="linked-announcement-overlay"]')).toBeVisible();
    await expect(projection.locator('[data-slot-id="linked-announcement-overlay"]')).toHaveText(
      "Sobreposição projetada"
    );
  } finally {
    await context.close();
  }
});
