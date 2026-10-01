/**
 * CustomSongPackage.ts — Leva uma música personalizada para arquivos .slja e de volta.
 *
 * Um .slja comporta uma faixa de áudio só. A música com cantado e playback sai
 * em dois pacotes, pareados pelo nome como o LouvorJA clássico (26.11+) faz na
 * pasta de uma coletânea personalizada: `Música.slja` e `Música -PB.slja`. Na
 * volta, os dois viram uma música só quando os slides são os mesmos.
 *
 * @category helper-puro — Sem APIs Vue; sem acesso ao store.
 */
import SljaConverter from "@/helpers/SljaConverter";
import AudioLibrary from "@/helpers/AudioLibrary";
import {
  hasPlayback,
  hasSung,
  slideTimes,
  type CustomSlide,
  type CustomSong,
  type ImagemPosicao,
  type SlideTipo,
} from "@/helpers/CustomSongs";

export interface SongPackageFile {
  fileName: string;
  blob: Blob;
}

export interface ImportResult {
  songs: CustomSong[];
  /** Arquivos que não puderam ser lidos. */
  failed: number;
  /** Arquivos .lja soltos, que trazem só os slides. */
  loose: number;
  /** Playbacks com slides diferentes do cantado de mesmo nome, importados à parte. */
  unmatched: number;
}

interface LoadedSlide {
  tipo: string;
  letra: string;
  letra_aux: string;
  tamanho_letra: number;
  tamanho_letra_aux: number;
  cor_letra: string;
  cor_letra_aux: string;
  cor_fundo: string;
  imagem: string;
  imagem_posicao: number;
  fundo_letra: boolean;
  tempo_seconds: number;
  text_align?: string;
}

interface LoadedPackage {
  meta: { nome?: string };
  slides: LoadedSlide[];
  audio: Blob | null;
  audioName: string | null;
  images: Map<string, Blob>;
  loose: boolean;
}

interface Part {
  /** Nome do arquivo sem extensão e sem o sufixo de playback: é a chave do par. */
  name: string;
  playback: boolean;
  data: LoadedPackage;
}

type StoreMedia = (_blob: Blob, _name: string) => Promise<string>;

interface MediaStore {
  audio: StoreMedia;
  image: StoreMedia;
}

const LIBRARY: MediaStore = {
  audio: (blob, name) => AudioLibrary.importAudio(blob, name),
  image: (blob, name) => AudioLibrary.importImage(blob, name),
};

/** Mídia de um arquivo aberto no editor: só vai para a biblioteca quando o operador salva. */
const SESSION: MediaStore = {
  audio: async (blob, name) => AudioLibrary.setSessionAudio(name, blob),
  image: async (blob, name) => AudioLibrary.setSessionImage(name, blob),
};

function fileStem(fileName: string): string {
  return String(fileName || "")
    .trim()
    .replace(/\.(slja|lja)$/i, "")
    .trim();
}

function pairName(fileName: string): { name: string; playback: boolean } {
  const stem = fileStem(fileName);
  const base = SljaConverter.playbackBaseName(stem);
  return { name: base ?? stem, playback: base !== null };
}

async function readPart(file: Blob, fileName: string): Promise<Part> {
  const data = (await SljaConverter.loadSlja(file)) as LoadedPackage;
  // Capa/abertura sem fundo herda a imagem do próximo slide que a tenha.
  SljaConverter.fillMissingImages(data.slides);
  return { ...pairName(fileName), data };
}

/** Nome: [Geral].nome → letra do 1º slide (capa) → nome do arquivo. */
function songName(part: Part): string {
  const resolved: string = SljaConverter.resolveSongName(part.data, part.name);
  if (!part.playback) return resolved;
  return SljaConverter.playbackBaseName(resolved) ?? resolved;
}

async function toSong(part: Part, store: MediaStore, fallbackName = ""): Promise<CustomSong> {
  const { data } = part;

  let audioToken = "";
  let audioName = "";
  if (data.audio) {
    audioName = (data.audioName || "audio.mp3").replace(/^audio\//, "");
    audioToken = await store.audio(data.audio, audioName);
  }

  const imageTokens = new Map<string, string>();
  for (const [path, blob] of data.images) {
    const name = path.replace(/^(imagens|images)\//, "");
    const token = await store.image(blob, name);
    imageTokens.set(name, token);
    imageTokens.set(path, token);
  }

  const slides = data.slides.map((s): CustomSlide => {
    const imageName = s.imagem ? s.imagem.split(/[\\/]/).pop() || "" : "";
    const imagem = imageName ? imageTokens.get(s.imagem) || imageTokens.get(imageName) || "" : "";
    if (s.imagem && !imagem) {
      console.warn(`[CustomSongPackage] imagem "${s.imagem}" referenciada mas ausente no pacote`);
    }
    return {
      id: crypto.randomUUID(),
      tipo: s.tipo as SlideTipo,
      letra: s.letra,
      letra_aux: s.letra_aux,
      tamanho_letra: s.tamanho_letra,
      tamanho_letra_aux: s.tamanho_letra_aux,
      cor_letra: s.cor_letra,
      cor_letra_aux: s.cor_letra_aux,
      cor_fundo: s.cor_fundo,
      imagem,
      imagem_posicao: s.imagem_posicao as ImagemPosicao,
      fundo_letra: s.fundo_letra,
      tempo_seconds: s.tempo_seconds,
      text_align: (s.text_align || "center") as CustomSlide["text_align"],
    };
  });
  if (!slides.some((slide) => slide.tempo_seconds > 0)) {
    console.warn("[CustomSongPackage] pacote sem tempos de sincronia (todos tempo_seconds=0)");
  }

  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    nome: songName(part) || fallbackName,
    audio_token: part.playback ? "" : audioToken,
    audio_name: part.playback ? "" : audioName,
    ...(part.playback ? { playback_token: audioToken, playback_name: audioName } : {}),
    slides,
    createdAt: now,
    updatedAt: now,
  };
}

const COMPARED: Array<keyof CustomSlide> = [
  "tipo",
  "letra",
  "letra_aux",
  "tamanho_letra",
  "tamanho_letra_aux",
  "cor_letra",
  "cor_letra_aux",
  "cor_fundo",
  "imagem",
  "imagem_posicao",
  "fundo_letra",
  "text_align",
];

/** Mesmos slides, fora os tempos: é o que permite guardar o playback como segunda faixa sem perder nada. */
function sameSlides(a: CustomSlide[], b: CustomSlide[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((slide, i) =>
    COMPARED.every((key) => {
      const [x, y] = [slide[key], b[i][key]];
      return key.startsWith("cor_") ? String(x).toLowerCase() === String(y).toLowerCase() : x === y;
    })
  );
}

function withPlayback(sung: CustomSong, playback: CustomSong): CustomSong {
  return {
    ...sung,
    playback_token: playback.playback_token || "",
    playback_name: playback.playback_name || "",
    slides: sung.slides.map((slide, i) => {
      const time = playback.slides[i].tempo_seconds;
      return time === slide.tempo_seconds ? slide : { ...slide, tempo_seconds_pb: time };
    }),
  };
}

/**
 * Importa um lote para a biblioteca, juntando `Música.slja` e `Música -PB.slja`
 * numa música com as duas faixas. As músicas voltam prontas, ainda não salvas.
 */
export async function importSongFiles(files: File[]): Promise<ImportResult> {
  // O par se decide pelo nome do arquivo, então dá para agrupar antes de abrir
  // qualquer pacote: só os arquivos de uma música ficam em memória por vez.
  const groups = new Map<string, File[]>();
  for (const file of files) {
    const key = pairName(file.name).name.toLowerCase();
    groups.set(key, [...(groups.get(key) || []), file]);
  }

  const result: ImportResult = { songs: [], failed: 0, loose: 0, unmatched: 0 };
  for (const group of groups.values()) {
    const sung: CustomSong[] = [];
    const playbacks: CustomSong[] = [];
    for (const file of group) {
      try {
        const part = await readPart(file, file.name);
        (part.playback ? playbacks : sung).push(await toSong(part, LIBRARY));
        if (part.data.loose) result.loose++;
      } catch {
        result.failed++;
      }
    }

    const [playback, ...extras] = playbacks;
    if (playback && sung.length) {
      if (sameSlides(sung[0].slides, playback.slides)) {
        sung[0] = withPlayback(sung[0], playback);
      } else {
        result.unmatched++;
        extras.unshift(playback);
      }
    } else if (playback) {
      extras.unshift(playback);
    }
    result.songs.push(...sung, ...extras);
  }
  return result;
}

/** Abre um arquivo no editor: a mídia fica na sessão até o operador salvar. */
export async function readSongFile(
  file: File,
  fallbackName = ""
): Promise<{ song: CustomSong; loose: boolean }> {
  const part = await readPart(file, file.name);
  return { song: await toSong(part, SESSION, fallbackName), loose: part.data.loose };
}

async function exportSlides(
  source: CustomSlide[]
): Promise<{ slides: CustomSlide[]; images: Map<string, Blob> }> {
  const images = new Map<string, Blob>();
  const slides: CustomSlide[] = [];
  for (const slide of source) {
    if (!slide.imagem) {
      slides.push(slide);
      continue;
    }
    const blob = await AudioLibrary.getImageBlob(slide.imagem);
    if (!blob) {
      console.warn(
        `[CustomSongPackage] imagem não encontrada (${slide.imagem}) — slide sairá sem fundo`
      );
      slides.push({ ...slide, imagem: "" });
      continue;
    }
    // O nome sai do token, que na biblioteca é o hash do conteúdo: a mesma
    // imagem em vários slides entra uma vez só no pacote.
    const stem = slide.imagem.replace(/^.*\//, "").replace(/\.[^.]+$/, "");
    const ext = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg");
    const path = `imagens/${stem}.${ext}`;
    if (!images.has(path)) images.set(path, blob);
    slides.push({ ...slide, imagem: path });
  }
  return { slides, images };
}

async function audioBlob(token: string | undefined, label: string): Promise<Blob | null> {
  if (!token) return null;
  const blob = await AudioLibrary.getAudioBlob(token);
  if (!blob) console.warn(`[CustomSongPackage] áudio ${label} não encontrado (${token})`);
  return blob;
}

/**
 * Pacotes de uma música: o cantado e, se houver, o playback com o sufixo que o
 * clássico reconhece.
 *
 * @param fileBase  Nome dos arquivos, sem extensão; por padrão o da música.
 */
export async function buildSongPackages(
  song: CustomSong,
  fileBase: string = song.nome
): Promise<SongPackageFile[]> {
  const { slides, images } = await exportSlides(song.slides);
  const base = (fileBase || "").replace(/[\\/:*?"<>|]/g, "_");
  const nome = song.nome || "";
  const sung = hasSung(song) ? await audioBlob(song.audio_token, "cantado") : null;
  const playback = hasPlayback(song) ? await audioBlob(song.playback_token, "de playback") : null;

  const files: SongPackageFile[] = [];
  // Só com playback o pacote cantado não sai: ele iria sem faixa e, no
  // clássico, tomaria o lugar do playback na lista e na reprodução em sequência.
  if (sung || !playback) {
    files.push({
      fileName: `${base}.slja`,
      blob: await SljaConverter.writeSlja({
        slides,
        audio: sung,
        audioName: song.audio_name || "audio.mp3",
        images,
        nome,
      }),
    });
  }
  if (playback) {
    const times = slideTimes(song.slides, true);
    files.push({
      fileName: `${base}${SljaConverter.PLAYBACK_SUFFIX}.slja`,
      blob: await SljaConverter.writeSlja({
        slides: slides.map((slide, i) => ({ ...slide, tempo_seconds: times[i] })),
        audio: playback,
        audioName: song.playback_name || "playback.mp3",
        images,
        nome,
      }),
    });
  }
  return files;
}

export async function downloadSongPackages(
  song: CustomSong,
  fileBase?: string
): Promise<SongPackageFile[]> {
  const files = await buildSongPackages(song, fileBase);
  for (const file of files) {
    const url = URL.createObjectURL(file.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.fileName;
    a.click();
    URL.revokeObjectURL(url);
  }
  return files;
}

export default { importSongFiles, readSongFile, buildSongPackages, downloadSongPackages };
