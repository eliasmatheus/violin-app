'use strict';
/**
 * Lê as fontes usadas por um .pptx SEM abrir o PowerPoint.
 * O .pptx é um ZIP de XMLs: procuramos <a:latin typeface="..."> e <a:sym typeface="...">
 * em slides, layouts, mestres, gráficos e SmartArt, além das fontes do tema.
 *
 * Retorna: { fonts: ["Montserrat Black", ...], embedded: ["Fonte Embutida", ...] }
 */
const fs = require('fs/promises');
const JSZip = require('jszip');

const ATTR_RE = /<a:(latin|sym)\b[^>]*?\btypeface="([^"]*)"/g;
const EMBED_RE = /<p:embeddedFont>\s*<p:font\b[^>]*?\btypeface="([^"]*)"/g;

function decodeXml(s) {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
          .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

async function readPptxFonts(filePath) {
  const data = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(data);
  const found = new Set();
  const embedded = new Set();

  const xmlFiles = Object.keys(zip.files).filter(n => n.startsWith('ppt/') && n.endsWith('.xml'));
  for (const name of xmlFiles) {
    const xml = await zip.file(name).async('string');
    let m;
    ATTR_RE.lastIndex = 0;
    while ((m = ATTR_RE.exec(xml))) {
      const face = decodeXml(m[2]).trim();
      // "+mj-lt" / "+mn-lt" são referências ao tema (já lidas no theme*.xml)
      if (!face || face.startsWith('+')) continue;
      found.add(face);
    }
    if (name === 'ppt/presentation.xml') {
      EMBED_RE.lastIndex = 0;
      while ((m = EMBED_RE.exec(xml))) embedded.add(decodeXml(m[1]).trim());
    }
  }
  return { fonts: [...found].sort((a, b) => a.localeCompare(b)), embedded: [...embedded] };
}

/**
 * Tira de dentro do .pptx as fontes EMBUTIDAS (ppt/fonts/*.fntdata, formato EOT/MTX)
 * e devolve como .ttf normal, pronto para instalar.
 *   → [{ typeface: 'Brich', style: 'regular', ttf: Buffer, fsType: 0 }]
 */
async function extractEmbeddedFonts(filePath, onlyTypefaces = null) {
  const { eotToTtf } = require('mtx-decompressor');
  const zip = await JSZip.loadAsync(await fs.readFile(filePath));
  const pres = zip.file('ppt/presentation.xml');
  const relsF = zip.file('ppt/_rels/presentation.xml.rels');
  if (!pres || !relsF) return [];
  const xml = await pres.async('string');
  const rels = await relsF.async('string');
  const target = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*?\bId="([^"]+)"[^>]*?\bTarget="([^"]+)"/g)) target[m[1]] = m[2];
  for (const m of rels.matchAll(/<Relationship\b[^>]*?\bTarget="([^"]+)"[^>]*?\bId="([^"]+)"/g)) target[m[2]] = m[1];
  const wanted = onlyTypefaces ? new Set(onlyTypefaces) : null;
  const out = [];
  for (const block of xml.matchAll(/<p:embeddedFont>([\s\S]*?)<\/p:embeddedFont>/g)) {
    const face = (/<p:font\b[^>]*?\btypeface="([^"]*)"/.exec(block[1]) || [])[1];
    if (!face) continue;
    const typeface = decodeXml(face);
    if (wanted && !wanted.has(typeface)) continue;
    for (const st of block[1].matchAll(/<p:(regular|bold|italic|boldItalic)\b[^>]*?r:id="([^"]+)"/g)) {
      const t = target[st[2]];
      if (!t) continue;
      const part = zip.file(t.startsWith('/') ? t.slice(1) : `ppt/${t.replace(/^\.\//, '')}`);
      if (!part) continue;
      try {
        const eot = await part.async('uint8array');
        const fsType = eot.length > 34 ? (eot[32] | (eot[33] << 8)) : 0;   // permissão de uso gravada na fonte
        const ttf = Buffer.from(eotToTtf(eot));
        out.push({ typeface, style: st[1], ttf, fsType });
      } catch { /* fonte corrompida ou formato desconhecido: ignora */ }
    }
  }
  return out;
}

module.exports = { readPptxFonts, extractEmbeddedFonts };
