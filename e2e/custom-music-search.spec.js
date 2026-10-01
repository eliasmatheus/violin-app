import { test, expect } from "@playwright/test";

test.use({ serviceWorkers: "block" });

async function start(page, context) {
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (/(?:pt_musics|\/db\/musics\/pt)/.test(url.pathname))
      return route.fulfill({
        json: [{ id_music: 9, name: "Música oficial", albums: [{ id_album: 10, name: "CD" }] }],
      });
    if (url.pathname.includes("/json_db/") || url.origin === "http://e2e.mock")
      return route.fulfill({ json: [] });
    if (url.origin === "http://localhost:5002") return route.continue();
    return route.fulfill({ status: 204, body: "" });
  });
  await page.goto("/");
  await page.locator('[data-testid="modules-ready"]').waitFor({ state: "attached" });
  return page.evaluate(async () => {
    const songs = await import("/src/helpers/CustomSongs.ts");
    const { default: data } = await import("/src/helpers/UserData.ts");
    const { KEYS } = await import("/src/constants/UserDataKeys.ts");
    data.set(KEYS.OPTIONS.DISABLED_ALBUMS, [10]);
    const song = await songs.saveSong(songs.newSong("Esperança viva"));
    await songs.saveSong(songs.newSong("Canção avulsa"));
    for (const nome of ["Juventude sábado", "Equipe do culto"]) {
      const collection = songs.newCollection(nome);
      collection.song_ids = [song.id];
      await songs.saveCollection(collection);
    }
    return song.id;
  });
}

const surfaces = [
  {
    name: "busca rápida",
    open: (page) =>
      page.evaluate(() => window.dispatchEvent(new CustomEvent("louvorja:open-music-search"))),
    input: ".music-search__bar input",
    rows: ".music-search__table tbody tr",
    execute: (_page, row) => row.getByRole("button", { name: "Executar", exact: true }).click(),
  },
  {
    name: "Ctrl+K",
    open: (page) => page.keyboard.press("Control+k"),
    input: ".cmd-input",
    rows: ".cmd-item",
    execute: (page) => page.locator(".cmd-input").press("Enter"),
  },
];

for (const surface of surfaces) {
  test(`${surface.name}: título, coletânea, execução atualizada e exclusão`, async ({
    page,
    context,
  }) => {
    const id = await start(page, context);
    await surface.open(page);
    const input = page.locator(surface.input);
    const rows = page.locator(surface.rows);
    await input.fill("Esperança viva");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Coletânea personalizada");
    await expect(rows.first()).toContainText("Juventude sábado");
    await expect(rows.first()).toContainText("Equipe do culto");
    await expect(rows.first()).not.toContainText("Hino nº");
    await input.fill("Juventude");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Esperança viva");
    await input.fill("Canção avulsa");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Coletânea personalizada");

    // Os resultados já estão em memória; a execução deve reler a versão atual do documento.
    await input.fill("Esperança viva");
    await page.evaluate(async (id) => {
      const songs = await import("/src/helpers/CustomSongs.ts");
      const song = await songs.getSong(id);
      song.nome = "Renovação viva";
      song.slides[0].letra = "Capa revisada para o culto";
      await songs.saveSong(song);
    }, id);
    const projection = await context.newPage();
    await projection.goto("/projection");
    await expect(projection.locator(".projection-stage")).toBeVisible();
    await page.bringToFront();
    await surface.execute(page, rows.first());
    await expect(input).not.toBeVisible();
    await expect(projection.locator('[data-testid="slide-content"]')).toContainText(
      "Capa revisada para o culto"
    );
    await projection.close();

    await surface.open(page);
    await expect(input).toBeFocused();
    await input.fill("Renovação viva");
    await expect(input).toHaveValue("Renovação viva");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Renovação viva");
    await page.keyboard.press("Escape");
    await page.evaluate(async (id) => {
      const songs = await import("/src/helpers/CustomSongs.ts");
      await songs.deleteSong(id);
    }, id);
    await surface.open(page);
    await input.fill("Juventude");
    await expect(rows).toHaveCount(0);
    await input.fill("Canção avulsa");
    await expect(rows).toHaveCount(1);
  });
}

test("tela Músicas: título, coletânea e execução do acervo pessoal", async ({ page, context }) => {
  await start(page, context);
  await page.evaluate(async () => {
    const { default: modules } = await import("/src/helpers/Modules.js");
    modules.open("musics");
  });
  const input = page.locator(".musics-searchbar").getByRole("textbox");
  const rows = page.locator('[data-testid^="music-row-"]');
  await input.fill("Esperança viva");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Juventude sábado");
  await expect(rows.first()).toContainText("Equipe do culto");
  await input.fill("Juventude");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Esperança viva");

  const projection = await context.newPage();
  await projection.goto("/projection");
  await expect(projection.locator(".projection-stage")).toBeVisible();
  await page.bringToFront();
  await rows.first().getByRole("button", { name: "Executar", exact: true }).click();
  await expect(projection.locator('[data-testid="slide-content"]')).toBeVisible();
  await projection.close();
});
