"use strict";

const fs = require("fs-extra");
const path = require("path");

/**
 * Conta do YouTube para o yt-dlp. Quando o YouTube passa a pedir "confirme que
 * você não é um robô", o yt-dlp só volta a funcionar com a sessão de alguém
 * logado. O operador entra numa janela do próprio app — e resolve ali qualquer
 * verificação do Google —, e os cookies dessa sessão vão para um arquivo que o
 * yt-dlp lê em toda consulta (`--cookies`).
 *
 * O login roda numa sessão própria do Electron, separada do app. O arquivo de
 * cookies fica na pasta local do app, nunca na pasta de dados: ela pode estar
 * numa pasta compartilhada na nuvem, e esses cookies abrem a conta.
 */

const PARTITION = "persist:youtube-account";
const LOGIN_URL =
  "https://accounts.google.com/ServiceLogin?service=youtube&continue=" +
  encodeURIComponent("https://www.youtube.com/");
/** Cookies que só existem com alguém logado no YouTube. */
const SESSION_COOKIES = new Set(["SAPISID", "__Secure-3PAPISID", "LOGIN_INFO"]);
const COOKIE_DOMAIN_RE = /(^|\.)(youtube\.com|google\.com)$/i;

/**
 * Formato Netscape, o que o `--cookies` do yt-dlp lê.
 * @param {Array<{ domain: string, path?: string, secure?: boolean, expirationDate?: number, name: string, value: string, httpOnly?: boolean }>} cookies
 */
function toNetscape(cookies) {
  const lines = ["# Netscape HTTP Cookie File", "# Gerado pelo LouvorJA para o yt-dlp. Não compartilhe.", ""];
  for (const c of cookies) {
    const domain = String(c.domain || "").trim();
    if (!COOKIE_DOMAIN_RE.test(domain.replace(/^\./, ""))) continue;
    if (/[\t\n\r]/.test(`${c.name}${c.value}`)) continue;
    const host = domain.startsWith(".") ? domain : `.${domain}`;
    const expires = Math.max(0, Math.floor(Number(c.expirationDate) || 0));
    lines.push(
      [
        c.httpOnly ? `#HttpOnly_${host}` : host,
        "TRUE",
        c.path || "/",
        c.secure ? "TRUE" : "FALSE",
        String(expires),
        c.name,
        c.value,
      ].join("\t")
    );
  }
  return `${lines.join("\n")}\n`;
}

function isLoggedIn(cookies) {
  return cookies.some((c) => SESSION_COOKIES.has(c.name) && /youtube\.com$/i.test(String(c.domain || "")));
}

/**
 * @param {object} deps
 * @param {() => import("electron").Session} deps.session  sessão da partição de login
 * @param {string} deps.cookiesFile  onde o yt-dlp lê os cookies
 * @param {(opts: object) => import("electron").BrowserWindow} deps.createWindow
 */
function createYoutubeAccount(deps) {
  const { cookiesFile } = deps;
  let loginWindow = null;

  async function exportCookies() {
    const cookies = await deps.session().cookies.get({});
    const relevant = cookies.filter((c) => COOKIE_DOMAIN_RE.test(String(c.domain || "").replace(/^\./, "")));
    if (!isLoggedIn(relevant)) {
      await fs.remove(cookiesFile);
      return false;
    }
    await fs.ensureDir(path.dirname(cookiesFile));
    await fs.writeFile(cookiesFile, toNetscape(relevant), { mode: 0o600 });
    return true;
  }

  async function status() {
    const cookies = await deps.session().cookies.get({ domain: "youtube.com" });
    return { loggedIn: isLoggedIn(cookies) && (await fs.pathExists(cookiesFile)) };
  }

  /** Abre a janela de login; resolve quando ela fecha, com o estado da conta. */
  function login() {
    if (loginWindow && !loginWindow.isDestroyed()) {
      loginWindow.focus();
      return new Promise((resolve) => loginWindow.once("closed", () => void status().then(resolve)));
    }
    loginWindow = deps.createWindow({
      width: 480,
      height: 720,
      title: "YouTube",
      autoHideMenuBar: true,
      webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    const win = loginWindow;
    // Entrou e o Google devolveu para o YouTube: os cookies estão prontos.
    win.webContents.on("did-navigate", (_e, url) => {
      if (!/^https:\/\/(www\.|m\.)?youtube\.com\//i.test(url)) return;
      void exportCookies().then((ok) => {
        if (ok && !win.isDestroyed()) win.close();
      });
    });
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    void win.loadURL(LOGIN_URL);
    return new Promise((resolve) => {
      win.once("closed", () => {
        loginWindow = null;
        void exportCookies()
          .catch(() => false)
          .then(() => status())
          .then(resolve);
      });
    });
  }

  async function logout() {
    await deps.session().clearStorageData();
    await fs.remove(cookiesFile);
    return { loggedIn: false };
  }

  /** O arquivo, para o yt-dlp, só quando há alguém logado. */
  function cookiesFor() {
    return fs.pathExistsSync(cookiesFile) ? cookiesFile : undefined;
  }

  return { status, login, logout, cookiesFor, exportCookies };
}

module.exports = { createYoutubeAccount, toNetscape, isLoggedIn, PARTITION, LOGIN_URL };
