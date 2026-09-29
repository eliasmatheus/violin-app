/**
 * Regenerate the browser, PWA and desktop icons from src/assets/img/logo.svg.
 * Requires the project's Playwright browser. macOS additionally needs iconutil.
 */
import { chromium } from "playwright";
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const source = readFileSync("src/assets/img/logo.svg", "utf8");
const paths = [...source.matchAll(/<path\b[^>]*\/>/g)].map(([path]) => path);
const circlePath = source.match(/<path id="circulo-amarelo"[^>]* d="([^"]+)"\/>/)?.[1];
if (paths.length !== 5 || !circlePath) throw new Error("O SVG do logo precisa ter as cinco camadas esperadas.");

writeFileSync("public/logo.svg", source);
writeFileSync("public/ico/favicon.svg", source);

// Electron expects a flattened .icns, so this SVG composes the macOS-only
// depth and highlights around the exact five paths of the supplied artwork.
// The square canvas has a transparent margin for older macOS Dock versions.
const macSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="plate" x1=".05" y1="0" x2=".95" y2="1" gradientUnits="objectBoundingBox">
      <stop stop-color="#FFFFFF"/><stop offset=".20" stop-color="#FBFEFF"/>
      <stop offset=".68" stop-color="#F3F9FE"/><stop offset="1" stop-color="#E5F1F9"/>
    </linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2=".85" y2="1">
      <stop stop-color="#FFFFFF" stop-opacity=".76"/>
      <stop offset=".36" stop-color="#FFFFFF" stop-opacity=".10"/>
      <stop offset=".74" stop-color="#E7F5FF" stop-opacity=".04"/>
      <stop offset="1" stop-color="#BCD9ED" stop-opacity=".22"/>
    </linearGradient>
    <linearGradient id="markLight" x1="0" y1="0" x2=".8" y2="1">
      <stop stop-color="#FFFFFF" stop-opacity=".31"/>
      <stop offset=".28" stop-color="#FFFFFF" stop-opacity=".10"/>
      <stop offset=".62" stop-color="#FFFFFF" stop-opacity="0"/>
      <stop offset="1" stop-color="#001F5E" stop-opacity=".25"/>
    </linearGradient>
    <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#FFFFFF" stop-opacity="1"/>
      <stop offset=".42" stop-color="#CAE3F1" stop-opacity=".58"/>
      <stop offset="1" stop-color="#91B8CD" stop-opacity=".82"/>
    </linearGradient>
    <filter id="plateShadow" x="-.15" y="-.15" width="1.3" height="1.4">
      <feGaussianBlur stdDeviation="15"/>
    </filter>
    <filter id="markShadow" x="-.2" y="-.2" width="1.4" height="1.5">
      <feDropShadow dx="0" dy="17" stdDeviation="17" flood-color="#001129" flood-opacity=".65"/>
      <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#001129" flood-opacity=".32"/>
    </filter>
    <clipPath id="plateClip"><rect x="99" y="99" width="826" height="826" rx="201"/></clipPath>
  </defs>
  <rect x="105" y="116" width="814" height="814" rx="200" fill="#346785" opacity=".28" filter="url(#plateShadow)"/>
  <rect x="99" y="99" width="826" height="826" rx="201" fill="url(#plate)"/>
  <g clip-path="url(#plateClip)">
    <rect x="99" y="99" width="826" height="826" fill="url(#glass)"/>
    <path d="M111 330 C237 90 508 100 723 153 C574 159 412 219 306 342 C235 424 171 501 100 518 Z" fill="#D9EEFA" opacity=".28"/>
    <path d="M111 731 C306 861 655 826 914 619 L925 926 H99 Z" fill="#B9D7E9" opacity=".16"/>
  </g>
  <svg x="165" y="171" width="694" height="681" viewBox="0 0 1138 1115" overflow="visible">
    <g filter="url(#markShadow)">${paths.join("")}</g>
    <path d="${circlePath}" fill="url(#markLight)"/>
    <path d="${circlePath}" fill="none" stroke="url(#edge)" stroke-width="4" opacity=".58"/>
  </svg>
  <rect x="100.5" y="100.5" width="823" height="823" rx="199.5" fill="none" stroke="url(#edge)" stroke-width="3"/>
</svg>`;
writeFileSync("build/icon-mac.svg", macSvg);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
async function render(svg, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}svg{display:block;width:100%;height:100%}</style>${svg}`);
  return page.screenshot({ omitBackground: true, animations: "disabled" });
}

const pngs = new Map();
for (const size of [16, 32, 48, 144, 152, 180, 192, 256, 512, 1200]) {
  pngs.set(size, await render(source, size));
}
for (const size of [16, 32, 144, 152, 180, 192, 512]) {
  writeFileSync(`public/ico/favicon-${size}x${size}.png`, pngs.get(size));
}
writeFileSync("public/ico/favicon.png", pngs.get(512));
writeFileSync("public/logo_violin.png", pngs.get(1200));
writeFileSync("build/icon-512.png", pngs.get(512));

// ICO stores PNG entries, which Windows supports from Vista onward.
function ico(sizes) {
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((size, index) => {
    const entry = 6 + index * 16;
    const png = pngs.get(size);
    header.writeUInt8(size === 256 ? 0 : size, entry);
    header.writeUInt8(size === 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...sizes.map((size) => pngs.get(size))]);
}
writeFileSync("public/favicon.ico", ico([16, 32, 48, 256]));
writeFileSync("build/icon.ico", ico([16, 32, 48, 256]));

if (process.platform === "darwin") {
  const iconset = mkdtempSync(join(tmpdir(), "louvorja-icon-")) + ".iconset";
  // iconutil requires the .iconset extension on the directory itself.
  const { renameSync } = await import("node:fs");
  const tmp = iconset.slice(0, -8);
  renameSync(tmp, iconset);
  try {
    const sizes = [16, 32, 64, 128, 256, 512, 1024];
    const rendered = new Map();
    for (const size of sizes) rendered.set(size, await render(macSvg, size));
    writeFileSync("build/icon-mac.png", rendered.get(1024));
    for (const size of [16, 32, 128, 256, 512]) {
      writeFileSync(join(iconset, `icon_${size}x${size}.png`), rendered.get(size));
      writeFileSync(join(iconset, `icon_${size}x${size}@2x.png`), rendered.get(size * 2));
    }
    // Both 16/32 and their Retina variants matter for Finder and the Dock.
    execFileSync("iconutil", ["-c", "icns", iconset, "-o", "build/icon-mac.icns"]);
  } finally {
    rmSync(iconset, { recursive: true, force: true });
  }
}
await browser.close();
console.log("Logo, PWA, Windows, Linux e macOS: assets gerados.");
