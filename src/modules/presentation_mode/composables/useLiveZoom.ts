import { computed, ref, watch } from "vue";
import Broadcast from "@/helpers/Broadcast";
import { BROADCAST_TYPE } from "@/helpers/BroadcastTypes";
import {
  clampZoom,
  zoomStyle,
  ZOOM_MAX,
  ZOOM_MIN,
  type ProjectionZoom,
} from "@/helpers/ProjectionZoom";
import { useLiveContent } from "./useLiveContent";
import { usePdfDeck } from "./usePdfDeck";

/**
 * Zoom da imagem ou da página de PDF que está no ar. O operador amplia no
 * visor (botões, roda do mouse, arrastar, mapa) ou com + − 0; a tela
 * principal e o retorno seguem o mesmo recorte. Trocou de arquivo ou virou a
 * página: volta a 100%.
 */

const STEP = 1.25;

const _zoom = ref<ProjectionZoom | null>(null);
let _installed = false;

function install(): void {
  if (_installed) return;
  _installed = true;
  const live = useLiveContent();
  const deck = usePdfDeck();

  // Outra mídia ou outra página: o recorte antigo não vale mais.
  watch(
    () => {
      const file = live.current.value === "file" ? live.file.value : null;
      if (!file || (file.type !== "image" && file.type !== "pdf")) return null;
      return `${file.playback_id ?? file.url}|${file.type === "pdf" ? deck.page.value : 1}`;
    },
    () => {
      if (_zoom.value) set(null);
    }
  );

  // Tela que abriu (ou recarregou) no meio do zoom pede o recorte atual.
  Broadcast.listen((msg) => {
    if (msg.type === BROADCAST_TYPE.REQUEST_FILE_PROJECTION_ZOOM) send();
  });
}

function send(): void {
  const z = _zoom.value;
  Broadcast.send(BROADCAST_TYPE.FILE_PROJECTION_ZOOM, z ? { ...z } : { key: "" });
}

function set(next: ProjectionZoom | null): void {
  _zoom.value = next && next.scale > ZOOM_MIN ? clampZoom(next) : null;
  send();
}

export function useLiveZoom() {
  install();
  const live = useLiveContent();
  const deck = usePdfDeck();

  /** A mídia que aceita zoom agora: imagem ou PDF no ar. */
  const target = computed(() => {
    const file = live.current.value === "file" ? live.file.value : null;
    if (!file || (file.type !== "image" && file.type !== "pdf")) return null;
    return {
      key: file.playback_id ?? file.url,
      page: file.type === "pdf" ? deck.page.value : 1,
      type: file.type as "image" | "pdf",
      url: file.url,
    };
  });

  /** O recorte de agora (o guardado só vale para a mídia e a página de agora). */
  const current = computed<ProjectionZoom | null>(() => {
    const t = target.value;
    const z = _zoom.value;
    return t && z && z.key === t.key && z.page === t.page ? z : null;
  });

  const scale = computed(() => current.value?.scale ?? 1);

  function base(): ProjectionZoom | null {
    const t = target.value;
    if (!t) return null;
    return current.value ?? { key: t.key, page: t.page, scale: 1, cx: 0.5, cy: 0.5 };
  }

  /** Amplia (fator > 1) ou reduz mantendo parado o ponto `at` (frações do elemento). */
  function zoomBy(factor: number, at?: { x: number; y: number }): void {
    const z = base();
    if (!z) return;
    const nextScale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z.scale * factor));
    if (nextScale === z.scale) return;
    let { cx, cy } = z;
    if (at) {
      // O ponto sob o cursor fica sob o cursor: o centro anda na proporção do zoom.
      const px = z.cx + (at.x - 0.5) / z.scale;
      const py = z.cy + (at.y - 0.5) / z.scale;
      cx = px - (at.x - 0.5) / nextScale;
      cy = py - (at.y - 0.5) / nextScale;
    }
    set({ ...z, scale: nextScale, cx, cy });
  }

  /** Arrasta o recorte: `dx`/`dy` em frações do visor (arrastar para a direita mostra o que está à esquerda). */
  function panBy(dx: number, dy: number): void {
    const z = current.value;
    if (!z) return;
    set({ ...z, cx: z.cx - dx / z.scale, cy: z.cy - dy / z.scale });
  }

  /** Mapa do recorte: o centro vai para o ponto clicado (frações da imagem inteira). */
  function centerAt(x: number, y: number): void {
    const z = current.value;
    if (!z) return;
    set({ ...z, cx: x, cy: y });
  }

  return {
    target,
    current,
    scale,
    zoomIn: (at?: { x: number; y: number }) => zoomBy(STEP, at),
    zoomOut: (at?: { x: number; y: number }) => zoomBy(1 / STEP, at),
    zoomBy,
    fit: () => set(null),
    panBy,
    centerAt,
    /** O estilo da mídia nos espelhos do módulo (visor, miniaturas). */
    style: computed(() => zoomStyle(current.value, target.value?.key, target.value?.page ?? 1)),
  };
}

/** Só para testes. */
export function _resetLiveZoom(): void {
  _zoom.value = null;
}
