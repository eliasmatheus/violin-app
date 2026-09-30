// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { setupRoutes } = require("../routes.js");

describe("POST /api/bible: versão da seleção remota", () => {
  let handler;
  let send;
  beforeEach(() => {
    send = vi.fn();
    setupRoutes({
      get() {},
      post(route, callback) { if (route === "/api/bible") handler = callback; },
    }, {
      getMainWindow: () => ({ isDestroyed: () => false, webContents: { isDestroyed: () => false, send } }),
      getUserData: () => ({ id_bible_version: 1 }),
    });
  });

  function request(body) {
    const res = {
      code: 200,
      status(code) { this.code = code; return this; },
      json(body) { this.body = body; return this; },
    };
    handler({ body: { text: "Texto B", reference: "João 12:3", bookId: 43, chapter: 12, verse: 3, ...body } }, res);
    return res;
  }

  it("encaminha a versão escolhida no dispositivo junto com o texto", () => {
    expect(request({ versionId: 2 }).code).toBe(200);
    expect(send).toHaveBeenCalledExactlyOnceWith("http:song-slides", expect.objectContaining({
      action: "bible-verse", versionId: 2, text: "Texto B", verses: [3],
    }));
  });

  it("mantém o fallback para clientes antigos que omitem a versão", () => {
    expect(request({}).body.payload.versionId).toBe(1);
  });

  it.each([0, -1, 1.5, "2", {}, true, Number.MAX_SAFE_INTEGER + 1])("rejeita versionId inválido: %j", (versionId) => {
    expect(request({ versionId }).code).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });
});
