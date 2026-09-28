import { test, expect } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const hymn = (id, name, albumId, track) => ({
  id_music: id,
  name,
  duration: "00:02:00",
  has_instrumental_music: 1,
  albums: [
    {
      id_album: albumId,
      name: albumId === 629 ? "Hinário Adventista 1996" : "Hinário Adventista",
      type: "hymnal",
      pivot: { id_music: id, id_album: albumId, track },
    },
  ],
});
const catalog = [
  hymn(1, "Amor antigo", 629, 28),
  hymn(2, "Zelo novo", 712, 28),
  hymn(3, "Outra numeração", 712, 128),
  {
    id_music: 4,
    name: "CD recente",
    duration: "00:02:00",
    albums: [{ id_album: 10, name: "Meu Lugar", type: "collection", pivot: { track: 28 } }],
  },
  {
    id_music: 5,
    name: "Canção compartilhada",
    duration: "00:02:00",
    albums: [
      { id_album: 629, name: "Hinário Adventista 1996", type: "hymnal", pivot: { track: 285 } },
      { id_album: 10, name: "Meu Lugar", type: "collection", pivot: { track: 3 } },
    ],
  },
];

async function setAlbums(page, disabled, legacyEnabled = true) {
  await page.evaluate(
    async ({ disabled, legacyEnabled }) => {
      const { default: data } = await import("/src/helpers/UserData.ts");
      const { KEYS, moduleShowInMainMenu } = await import("/src/constants/UserDataKeys.ts");
      data.set(KEYS.OPTIONS.DISABLED_ALBUMS, disabled);
      data.set(moduleShowInMainMenu("hymnal_1996"), legacyEnabled);
    },
    { disabled, legacyEnabled }
  );
}

async function start(page) {
  await page.route("http://e2e.mock/**", (route) => route.fulfill({ json: [] }));
  await page.route("**/json_db/**", (route) => route.fulfill({ json: [] }));
  await page.route(/(?:pt_musics|\/db\/musics\/pt)/, (route) => route.fulfill({ json: catalog }));
  await page.route(/(?:pt_categories|\/db\/categories\/pt)/, (route) =>
    route.fulfill({ json: [{ albums: [{ id_album: 10, name: "Meu Lugar", subtitle: "2026" }] }] })
  );
  await page.goto("/");
  await page
    .locator('[data-testid="modules-ready"]')
    .waitFor({ state: "attached", timeout: 30000 });
  await setAlbums(page, []);
}

test("lista de músicas: ano, número exato e mudança de álbuns sem recarregar", async ({ page }) => {
  await start(page);
  await page.locator("#ribbon-tab-collections").click();
  await page.locator('[data-testid="ribbon-btn-musics"]').click();
  const rows = page.locator('[data-testid^="music-row-"]');
  await expect(rows).toHaveCount(5);
  await expect(rows.first()).toContainText("Canção compartilhada");

  const search = page.getByPlaceholder("Buscar por...");
  await search.fill("28");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Zelo novo");
  await expect(rows.first()).toContainText("Hino nº 28 - Hinário Adventista");
  await expect(rows.last()).toContainText("Amor antigo");

  await setAlbums(page, ["629"]);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Zelo novo");
  await search.fill("285");
  await expect(rows).toHaveCount(0);
  await search.fill("compartilhada");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Meu Lugar");
  await expect(rows.first()).not.toContainText("1996");

  await setAlbums(page, []);
  await search.fill("28");
  await expect(rows).toHaveCount(2);
});

test("busca rápida e paleta respeitam a edição recente e os álbuns desativados", async ({
  page,
}) => {
  await start(page);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("louvorja:open-music-search")));
  const input = page.locator(".music-search__bar input");
  await input.fill("28");
  const rows = page.locator(".music-search__table tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Zelo novo");
  await setAlbums(page, [629]);
  await expect(rows).toHaveCount(1);
  await input.fill("compartilhada");
  await expect(rows.first()).not.toContainText("1996");
  await page.keyboard.press("Escape");

  await page.keyboard.press("Control+k");
  await page.locator(".cmd-input").fill("28");
  await expect(page.locator(".cmd-item")).toHaveCount(1);
  await expect(page.locator(".cmd-item").first()).toContainText("Hino nº 28 - Zelo novo");
  await setAlbums(page, []);
  await expect(page.locator(".cmd-item")).toHaveCount(2);
  await expect(page.locator(".cmd-item").first()).toContainText("Zelo novo");
});

test("liturgia: álbum personalizado padronizado, número visível e filtro reativo", async ({
  page,
}) => {
  await start(page);
  await page.evaluate(async () => {
    const songs = await import("/src/helpers/CustomSongs.ts");
    await songs.saveSong(songs.newSong("DESPERTA"));
  });
  await page.getByRole("button", { name: "Editar liturgia" }).click();
  await expect(page.locator(".liturgy-page")).toBeVisible();
  await page.locator('[data-testid="liturgy-add-item"]').last().click();
  await page.locator('.lif-field--type [role="combobox"]').click();
  await page.getByRole("option", { name: "Música", exact: true }).click();
  await page.locator("label").filter({ hasText: "Escolher na hora do culto" }).click();
  const input = page.getByPlaceholder("Digite o título ou o número do hino...");
  await input.fill("desperta");
  const options = page.locator(".lj-combobox__item");
  await expect(options).toHaveCount(1);
  await expect(options.first().locator(".lj-combobox__label")).toHaveText("DESPERTA");
  await expect(options.first()).toContainText("Coletânea personalizada");
  await input.fill("28");
  await expect(options).toHaveCount(2);
  await expect(options.first()).toContainText("Zelo novo");
  await expect(options.first()).toContainText("Hino nº 28 - Hinário Adventista");
  await setAlbums(page, [629]);
  await expect(options).toHaveCount(1);
  await options.first().click();
  await page.locator('[data-testid="item-name"]').fill("Hino de abertura");
  await page.locator('[data-testid="item-save"]').click();
  await expect(page.locator(".liturgy-body")).toContainText("Hino nº 28 - Zelo novo");
  await expect(page.locator(".liturgy-body")).not.toContainText("Música Hino nº");
  await page.getByRole("button", { name: "Fechar: Liturgia", exact: true }).click();
  await page.locator("#ribbon-tab-collections").click();
  await page.locator('[data-testid="ribbon-btn-musics"]').click();
  await expect(page.locator(".liturgy-panel-body")).toContainText("Hino nº 28 - Zelo novo");
  await expect(page.locator(".liturgy-panel-body")).not.toContainText("Música Hino nº");
});

test("favoritos, histórico e playlists ocultam álbuns sem apagar as referências salvas", async ({
  page,
}) => {
  await start(page);
  await page.evaluate(async () => {
    const { default: favorites } = await import("/src/helpers/Favorites.js");
    const { default: history } = await import("/src/helpers/History.js");
    const { usePlaylists } = await import("/src/modules/musics/composables/usePlaylists.ts");
    for (const song of [
      { id_music: 1, name: "Amor antigo" },
      { id_music: 2, name: "Zelo novo" },
    ]) {
      favorites.add(song.id_music, song.name, true);
      history.add(song.id_music, song.name, true);
    }
    const lists = usePlaylists();
    await lists.hydrate();
    const list = await lists.createPlaylist("Culto");
    for (const song of [
      { id_music: 1, name: "Amor antigo" },
      { id_music: 2, name: "Zelo novo" },
    ]) {
      await lists.addSong(list.id, { ...song, duration: 120, has_instrumental_music: true });
    }
  });
  await setAlbums(page, [629]);
  await page.locator("#ribbon-tab-favorites").click();
  await page.locator('[data-testid="ribbon-btn-favorites"]').click();
  await expect(page.locator(".music-list-item-name")).toHaveText(["Hino nº 28 - Zelo novo"]);
  await page.locator('[data-testid="ribbon-btn-history"]').click();
  await expect(page.locator(".music-list-item-name:visible")).toHaveText([
    "Hino nº 28 - Zelo novo",
  ]);
  await page.locator("#ribbon-tab-collections").click();
  await page.locator('[data-testid="ribbon-btn-musics"]').click();
  await page.locator(".playlist-panel-item").filter({ hasText: "Culto" }).click();
  await expect(page.locator(".playlist-songs-item-name")).toHaveText(["Hino nº 28 - Zelo novo"]);
  await setAlbums(page, []);
  await expect(page.locator(".playlist-songs-item-name")).toHaveText([
    "Hino nº 28 - Amor antigo",
    "Hino nº 28 - Zelo novo",
  ]);
  const savedCounts = await page.evaluate(async () => {
    const { default: favorites } = await import("/src/helpers/Favorites.js");
    const { default: history } = await import("/src/helpers/History.js");
    return [favorites.list().length, history.list().length];
  });
  expect(savedCounts).toEqual([2, 2]);
});
