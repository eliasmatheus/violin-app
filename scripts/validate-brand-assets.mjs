import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

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

console.log("SVG, ícones públicos e ícones desktop estão sincronizados.");
