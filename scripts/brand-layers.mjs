// Each top-level <g id="camada-*"> of the logo becomes one Icon Composer layer,
// in the same back-to-front order, on the logo's own canvas.
export const LAYERED_ICON = "build/icon-mac.icon";

/**
 * @param {string} source logo SVG
 * @param {string} sourceHash sha256 of the logo, stamped on every layer
 * @returns {Map<string, string>} path inside the .icon package → SVG
 */
export function macIconLayers(source, sourceHash) {
  const root = source.match(/<svg\b[^>]*\bviewBox="([^"]+)"[^>]*>([\s\S]*)<\/svg>\s*$/);
  if (!root) throw new Error("O SVG do logo precisa ter um viewBox.");
  const [, viewBox, body] = root;
  const [, , width, height] = viewBox.split(/[\s,]+/);
  const starts = [...body.matchAll(/^[ \t]*<g id="camada-([a-z-]+)"/gm)];
  if (starts.length === 0) throw new Error('O logo não tem grupos <g id="camada-*">.');
  const end = body.lastIndexOf("</g>") + "</g>".length;

  return new Map(
    starts.map((match, index) => {
      const group = body.slice(match.index, starts[index + 1]?.index ?? end).trimEnd();
      const name = `${String(index + 1).padStart(2, "0")}-${match[1]}.svg`;
      const svg = `<!-- brand-source-sha256: ${sourceHash} -->
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}" style="fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round;stroke-miterlimit:2;">
${group}
</svg>
`;
      return [`${LAYERED_ICON}/Assets/${name}`, svg];
    })
  );
}

export const LOGO_WITH_DEPTH = "src/assets/img/logo-profundidade.svg";

// Like the Icon Composer groups, each layer casts a shadow in its own darkened
// color onto the disc below it; outside the disc there is nothing to fall on.
const SHADOWS = {
  violino: { dy: 24, blur: 20, shade: 0.45 },
  cordas: { dy: 7, blur: 7, shade: 0.2 },
  clave: { dy: 24, blur: 20, shade: 0 },
  arco: { dy: 26, blur: 20, shade: 0.08 },
};

/** @param {string} source logo SVG */
export function logoWithDepth(source) {
  const fundo = source.match(/<g id="camada-fundo" transform="([^"]+)"/)?.[1];
  if (!fundo) throw new Error('O logo precisa do grupo <g id="camada-fundo">.');
  const defs = [
    `<defs>`,
    `  <clipPath id="sombra-disco"><use href="#amarelo" transform="${fundo}"/><use href="#azul-claro" transform="${fundo}"/></clipPath>`,
    ...Object.entries(SHADOWS).map(
      ([name, { dy, blur, shade }]) =>
        `  <filter id="sombra-${name}" x="-15%" y="-15%" width="130%" height="140%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceGraphic" stdDeviation="${blur}"/><feOffset dy="${dy}"/><feColorMatrix type="matrix" values="${shade} 0 0 0 0 0 ${shade} 0 0 0 0 0 ${shade} 0 0 0 0 0 0.55 0"/></filter>`
    ),
    `</defs>`,
  ].join("\n    ");
  let svg = source.replace(/(<svg\b[^>]*>)/, `$1\n    ${defs}`);
  for (const name of Object.keys(SHADOWS)) {
    const group = `<g id="camada-${name}"`;
    if (!svg.includes(group)) throw new Error(`O logo precisa do grupo ${group}>.`);
    svg = svg.replace(
      group,
      `<g clip-path="url(#sombra-disco)"><use href="#camada-${name}" filter="url(#sombra-${name})"/></g>\n    ${group}`
    );
  }
  return svg;
}
