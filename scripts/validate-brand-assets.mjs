import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { LAYERED_ICON, LOGO_WITH_DEPTH, logoWithDepth, macIconLayers } from "./brand-layers.mjs";

/** @typedef {{ source: string, desktop: Record<string, string>, mac: { source: string, files: Record<string, string> } | null }} BrandAssetsManifest */

const source = readFileSync("src/assets/img/logo.svg");
const checksum = (value) => createHash("sha256").update(value).digest("hex");
const hash = checksum(source);

for (const path of ["public/logo.svg", "public/ico/favicon.svg"]) {
  if (!readFileSync(path).equals(source)) {
    throw new Error(`${path} difere do SVG da interface. Rode npm run assets:brand.`);
  }
}

/** @type {BrandAssetsManifest} */
const manifest = JSON.parse(readFileSync("build/brand-assets.json", "utf8"));
const digest = /^[0-9a-f]{64}$/;
const desktopPaths = ["build/icon-512.png", "build/icon.ico"];
const macPaths = ["build/icon-mac.svg", "build/icon-mac.png", "build/icon-mac.icns"];
if (
  !digest.test(manifest?.source) ||
  !digest.test(manifest?.mac?.source) ||
  desktopPaths.some((path) => !digest.test(manifest?.desktop?.[path])) ||
  macPaths.some((path) => !digest.test(manifest?.mac?.files?.[path]))
) {
  throw new Error("O manifesto dos ícones está incompleto. Rode npm run assets:brand em um Mac.");
}
if (manifest.source !== hash) {
  throw new Error("Os ícones desktop não acompanham o SVG atual. Rode npm run assets:brand.");
}
if (manifest.mac?.source !== hash) {
  throw new Error("O ícone macOS precisa ser regenerado com iconutil em um Mac.");
}

const macSvg = readFileSync("build/icon-mac.svg", "utf8");
if (!macSvg.startsWith(`<!-- brand-source-sha256: ${hash} -->`)) {
  throw new Error("A composição macOS não acompanha o SVG atual. Rode npm run assets:brand.");
}

for (const [path, signature] of [
  ["build/icon-512.png", Buffer.from("89504e470d0a1a0a", "hex")],
  ["build/icon.ico", Buffer.from("00000100", "hex")],
  ["build/icon-mac.png", Buffer.from("89504e470d0a1a0a", "hex")],
  ["build/icon-mac.icns", Buffer.from("icns")],
]) {
  const actual = readFileSync(path);
  if (!actual.subarray(0, signature.length).equals(signature)) {
    throw new Error(`${path} não tem o formato de ícone esperado.`);
  }
  const expected = (path.startsWith("build/icon-mac") ? manifest.mac.files : manifest.desktop)?.[
    path
  ];
  if (checksum(actual) !== expected) {
    const onMac = path.startsWith("build/icon-mac") ? " em um Mac" : "";
    throw new Error(`${path} difere do ícone gerado. Rode npm run assets:brand${onMac}.`);
  }
}
if (checksum(Buffer.from(macSvg)) !== manifest.mac.files?.["build/icon-mac.svg"]) {
  throw new Error("A composição macOS difere do ícone gerado.");
}

if (readFileSync(LOGO_WITH_DEPTH, "utf8") !== logoWithDepth(source.toString("utf8"))) {
  throw new Error(`${LOGO_WITH_DEPTH} difere do logo com sombras. Rode npm run assets:brand.`);
}

const layers = macIconLayers(source.toString("utf8"), hash);
const layeredAssets = `${LAYERED_ICON}/Assets`;
const onDisk = existsSync(layeredAssets)
  ? readdirSync(layeredAssets).map((name) => `${layeredAssets}/${name}`)
  : [];
for (const path of new Set([...layers.keys(), ...onDisk])) {
  if (!existsSync(path) || readFileSync(path, "utf8") !== layers.get(path)) {
    throw new Error(`${path} não acompanha as camadas do logo. Rode npm run assets:brand.`);
  }
}
const icon = JSON.parse(readFileSync(`${LAYERED_ICON}/icon.json`, "utf8"));
const imageNames = (icon.groups || []).flatMap((group) =>
  (group.layers || []).map((layer) => layer["image-name"])
);
const missing = imageNames.filter((name) => !layers.has(`${layeredAssets}/${name}`));
if (imageNames.length === 0 || missing.length > 0) {
  throw new Error(`O icon.json referencia camadas que o logo não tem: ${missing.join(", ")}`);
}

console.log("SVG, ícones públicos, desktop e camadas macOS estão sincronizados.");
