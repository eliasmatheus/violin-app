// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "module";
import { EventEmitter } from "events";
import os from "os";
import path from "path";
import fs from "fs";

const require = createRequire(import.meta.url);
const { createYoutubeAccount, toNetscape, isLoggedIn } = require("../onlineVideo/youtubeAccount.js");

const cookie = (name, domain, extra = {}) => ({ name, value: `v-${name}`, domain, path: "/", secure: true, expirationDate: 2000000000, ...extra });

describe("youtubeAccount", () => {
  let dir;
  beforeEach(() => (dir = fs.mkdtempSync(path.join(os.tmpdir(), "lj-yt-"))));
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("gera o arquivo Netscape só com cookies do YouTube e do Google", () => {
    const text = toNetscape([
      cookie("SAPISID", ".youtube.com"),
      cookie("SID", ".google.com", { httpOnly: true }),
      cookie("track", ".evil.com"),
    ]);
    expect(text).toContain(".youtube.com\tTRUE\t/\tTRUE\t2000000000\tSAPISID\tv-SAPISID");
    expect(text).toContain("#HttpOnly_.google.com");
    expect(text).not.toContain("evil");
  });

  it("logado só com cookie de sessão do YouTube", () => {
    expect(isLoggedIn([cookie("SAPISID", ".youtube.com")])).toBe(true);
    expect(isLoggedIn([cookie("PREF", ".youtube.com")])).toBe(false);
  });

  it("login: ao voltar para o YouTube, exporta os cookies e fecha a janela; sair apaga tudo", async () => {
    let jar = [];
    let cleared = false;
    const session = { cookies: { get: async () => jar }, clearStorageData: async () => ((cleared = true), (jar = [])) };
    const win = new EventEmitter();
    win.webContents = new EventEmitter();
    win.webContents.setWindowOpenHandler = () => {};
    win.loadURL = async () => {};
    win.isDestroyed = () => false;
    win.close = () => win.emit("closed");
    win.focus = () => {};
    const cookiesFile = path.join(dir, "youtube-cookies.txt");
    const account = createYoutubeAccount({ session: () => session, cookiesFile, createWindow: () => win });

    const done = account.login();
    jar = [cookie("SAPISID", ".youtube.com")];
    win.webContents.emit("did-navigate", {}, "https://www.youtube.com/");
    expect(await done).toEqual({ loggedIn: true });
    expect(fs.readFileSync(cookiesFile, "utf8")).toContain("SAPISID");
    expect(account.cookiesFor()).toBe(cookiesFile);

    expect(await account.logout()).toEqual({ loggedIn: false });
    expect(cleared).toBe(true);
    expect(fs.existsSync(cookiesFile)).toBe(false);
    expect(account.cookiesFor()).toBeUndefined();
  });
});
