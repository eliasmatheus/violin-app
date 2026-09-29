"use strict";

const fs = require("fs-extra");
const { DATA_ENTRIES } = require("./dataMigration.js");

/** Pastas modernas nunca são candidatas à migração de mídia legada. */
function listLegacyMediaEntries(dir) {
  try {
    if (!fs.statSync(dir).isDirectory()) return [];
    return fs.readdirSync(dir).filter((name) =>
      !DATA_ENTRIES.some((entry) => [entry, `${entry}.bak`, `${entry}.tmp`].includes(name)) && !name.startsWith(".")
    );
  } catch (_) {
    return [];
  }
}

module.exports = { listLegacyMediaEntries };
