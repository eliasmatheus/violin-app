"use strict";

/**
 * imagesPdf — monta um PDF com uma imagem por página (os slides exportados).
 *
 * Cada página tem o tamanho do slide (em pontos) e a imagem ocupa a página
 * inteira. Sem texto nem fonte: o pdf.js da projeção só desenha a figura, e o
 * resultado é o pixel que o PowerPoint gerou.
 */
const fs = require("fs/promises");

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
const JPG_MAGIC = [0xff, 0xd8, 0xff];

const _comeca = (buf, magic) => magic.every((b, i) => buf[i] === b);

/**
 * PNG → JPEG (qualidade 92) pelo `nativeImage` do Electron. Slide com foto em
 * PNG passa de 3 MB; em JPEG fica perto de 400 KB, sem diferença visível no
 * telão. Fora do Electron (testes em Node puro) devolve o PNG como veio.
 */
function _paraJpeg(bytes) {
  try {
    const { nativeImage } = require("electron");
    if (!nativeImage?.createFromBuffer) return bytes;
    const img = nativeImage.createFromBuffer(bytes);
    if (img.isEmpty()) return bytes;
    return img.toJPEG(92);
  } catch {
    return bytes;
  }
}

/**
 * @param {string[]} files  PNGs ou JPGs, na ordem dos slides
 * @param {string} output   caminho do PDF a gravar
 * @param {{width?: number, height?: number}} [slide]  tamanho do slide em pontos;
 *   sem ele, a página segue a proporção da imagem com 960 pt de largura
 * @returns {Promise<number>} páginas gravadas
 */
async function imagesToPdf(files, output, slide = {}) {
  const { PDFDocument } = require("pdf-lib");
  const pdf = await PDFDocument.create();
  for (const file of files) {
    let bytes = await fs.readFile(file);
    if (_comeca(bytes, PNG_MAGIC)) bytes = _paraJpeg(bytes);
    let img;
    if (_comeca(bytes, PNG_MAGIC)) img = await pdf.embedPng(bytes);
    else if (_comeca(bytes, JPG_MAGIC)) img = await pdf.embedJpg(bytes);
    else continue;
    let w = Number(slide.width);
    let h = Number(slide.height);
    if (!(w > 0 && h > 0)) {
      w = 960;
      h = (960 * img.height) / img.width;
    }
    const page = pdf.addPage([w, h]);
    page.drawImage(img, { x: 0, y: 0, width: w, height: h });
  }
  if (!pdf.getPageCount()) throw new Error("Nenhuma imagem de slide válida.");
  await fs.writeFile(output, await pdf.save());
  return pdf.getPageCount();
}

module.exports = { imagesToPdf };
