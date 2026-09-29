"use strict";

const fs = require("fs-extra");
const path = require("path");
const { isVideoId } = require("./ids.js");
const { moveMissing } = require("../dataMigration.js");

async function entries(dir) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

/** Move downloads antigos sem sobrescrever arquivos ou seguir links simbólicos. */
async function migrateDownloads(fromDir, toDir) {
  if (path.resolve(fromDir) === path.resolve(toDir)) return;
  const source = await entries(fromDir);

  // MP4 primeiro: a marca de manter só acompanha um vídeo que já está no destino.
  for (const extension of ["mp4", "keep"]) {
    for (const entry of source) {
      const match = /^([A-Za-z0-9_-]{11})\.(mp4|keep)$/.exec(entry.name);
      if (!entry.isFile() || !match || match[2] !== extension) continue;
      if (extension === "keep" && !(await fs.pathExists(path.join(toDir, `${match[1]}.mp4`)))) continue;
      const target = path.join(toDir, entry.name);
      if (await fs.pathExists(target)) continue;
      await fs.move(path.join(fromDir, entry.name), target, { overwrite: false });
    }
  }

  // Downloads interrompidos continuam retomáveis; trilhas de streaming antigas
  // são temporárias e não fazem parte dos vídeos guardados.
  const partials = source.find((entry) => entry.name === ".partial" && entry.isDirectory());
  if (partials) {
    const partialRoot = path.join(fromDir, ".partial");
    for (const entry of await entries(partialRoot)) {
      if (!entry.isDirectory() || !isVideoId(entry.name)) continue;
      const target = path.join(toDir, ".partial", entry.name);
      if (await fs.pathExists(target)) continue;
      await fs.move(path.join(partialRoot, entry.name), target, { overwrite: false });
    }
  }
  for (const name of [".stream", ".ytdlp-cache"]) {
    await moveMissing(path.join(fromDir, name), path.join(toDir, name));
  }
}

module.exports = { migrateDownloads };
