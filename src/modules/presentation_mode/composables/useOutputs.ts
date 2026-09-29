import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import Broadcast from "@/helpers/Broadcast";
import Platform from "@/helpers/Platform";
import Telemetry from "@/helpers/Telemetry";
import { BROADCAST_TYPE } from "@/helpers/BroadcastTypes";
import {
  closeProjectionWindows,
  openMediaWindow,
} from "@/helpers/ProjectionWindows";
import { isWebWindowOpen } from "@/helpers/projection/webWindow";
import { PROJECTION_TYPE } from "@/constants/Projection";
import { useDisplays } from "@/composables/useDisplays";

/**
 * As duas saídas do Modo apresentação: a tela principal e o retorno de palco.
 *
 * "Tela principal" não é uma janela só: música, Bíblia, arquivo e vídeo
 * on-line abrem cada um a sua no mesmo monitor. Ela está no ar se qualquer
 * uma delas (ou o retorno) estiver aberta — as mesmas que "Parar" fecha.
 * Projeção de fundo e anúncios têm botão próprio nos seus módulos.
 *
 * A tela limpa é estado da janela principal, anunciado às janelas de
 * projeção. Quem responde às janelas recém-abertas é um ouvinte fixo, e não o
 * componente: o módulo fica em KeepAlive e os ouvintes do componente pausam
 * quando o operador troca de aba — justo quando uma janela pode abrir.
 */

const MAIN_SCREEN_FEATURES = [
  PROJECTION_TYPE.MUSIC,
  PROJECTION_TYPE.RETURN,
  PROJECTION_TYPE.BIBLE,
  PROJECTION_TYPE.FILE,
  PROJECTION_TYPE.ONLINE_VIDEO,
];

/** Janelas abertas não avisam quando fecham sozinhas; o botão Projetar também pergunta a cada 2 s. */
const POLL_MS = 2000;

const _cleared = ref(false);
export { _cleared as cleared };
const _showing = ref(false);
const _busy = ref(false);
let _responderInstalled = false;

function _installResponder(): void {
  if (_responderInstalled) return;
  _responderInstalled = true;
  Broadcast.listen(
    (msg) => {
      if (msg.type === BROADCAST_TYPE.REQUEST_PROJECTION_CLEAR) {
        Broadcast.send(BROADCAST_TYPE.PROJECTION_CLEAR, { active: _cleared.value });
      }
    },
    { replay: false }
  );
}

async function _openFeatures(): Promise<string[]> {
  if (Platform.isDesktop && Platform.windows?.listOpen) {
    try {
      return (await Platform.windows.listOpen()) as string[];
    } catch {
      /* cai no caminho da web */
    }
  }
  return MAIN_SCREEN_FEATURES.filter((f) => isWebWindowOpen(f));
}

export async function refreshShowing(): Promise<void> {
  const open = await _openFeatures();
  _showing.value = MAIN_SCREEN_FEATURES.some((f) => open.includes(f));
}

export function setCleared(value: boolean): void {
  _installResponder();
  _cleared.value = value;
  Broadcast.send(BROADCAST_TYPE.PROJECTION_CLEAR, { active: value });
}

export async function startOutputs(): Promise<void> {
  if (_busy.value) return;
  _busy.value = true;
  try {
    await openMediaWindow("projection", "music", { explicit: true });
    await openMediaWindow("return", "music", { explicit: true });
    Telemetry.track("presentation_outputs_started", {});
  } catch (e) {
    Telemetry.captureException(e, { source: "presentation_mode.outputs.start" });
  } finally {
    _busy.value = false;
    await refreshShowing();
  }
}

export async function stopOutputs(): Promise<void> {
  if (_busy.value) return;
  _busy.value = true;
  try {
    await closeProjectionWindows();
    if (_cleared.value) setCleared(false);
    Telemetry.track("presentation_outputs_stopped", {});
  } catch (e) {
    Telemetry.captureException(e, { source: "presentation_mode.outputs.stop" });
  } finally {
    _busy.value = false;
    await refreshShowing();
  }
}

export function useOutputs() {
  _installResponder();
  const { displays, roles } = useDisplays();

  let timer: ReturnType<typeof setInterval> | null = null;
  onMounted(() => {
    void refreshShowing();
    timer = setInterval(() => void refreshShowing(), POLL_MS);
  });
  onBeforeUnmount(() => {
    if (timer) clearInterval(timer);
    // Fechar o módulo não pode deixar o telão preso no fundo.
    if (_cleared.value) setCleared(false);
  });

  /** Número do monitor do papel ("projection" / "stage"), ou `null` sem monitor. */
  function monitorNumber(role: string): number | null {
    const displayId = roles.value.find((r) => r.role === role)?.displayId;
    if (displayId == null) return null;
    const display = displays.value.find((d) => String(d.id) === String(displayId));
    return display?.number ?? null;
  }

  const mainMonitor = computed(() => monitorNumber("projection"));
  const stageMonitor = computed(() => monitorNumber("stage"));

  return {
    cleared: _cleared,
    showing: _showing,
    busy: _busy,
    mainMonitor,
    stageMonitor,
    start: startOutputs,
    stop: stopOutputs,
    toggleCleared: () => setCleared(!_cleared.value),
  };
}
