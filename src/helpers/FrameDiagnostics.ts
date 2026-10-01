/**
 * Fluidez de animações e quadros lentos, agregados por minuto.
 *
 * Mede só enquanto alguma transição ou animação está em curso — o navegador já
 * produz esses quadros, então o custo é um callback a mais por quadro — e guarda
 * contadores, nunca um registro por quadro.
 * @category helper-puro — Sem APIs Vue; usa apenas DOM e Performance.
 */

const LABEL_LIMIT = 24;
const RUN_CAP_MS = 1_500;
const DEFAULT_FRAME_MS = 1000 / 60;

interface AnimationStat {
  runs: number;
  frames: number;
  dropped: number;
  worst_ms: number;
}

interface ScriptStat {
  count: number;
  total_ms: number;
  max_ms: number;
}

function emptyFrames() {
  return {
    count: 0,
    total_ms: 0,
    max_ms: 0,
    layout_ms: 0,
    script_ms: 0,
    forced_layout_ms: 0,
    in_animation: 0,
  };
}

function emptyRuns() {
  return { runs: 0, frames: 0, dropped: 0, worst_ms: 0 };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function elementLabel(target: EventTarget | null): string {
  if (!(target instanceof Element)) return "unknown";
  return (target.classList[0] || target.tagName.toLowerCase()).slice(0, 40);
}

function scriptLabel(script: Record<string, unknown>): string {
  const file =
    typeof script.sourceURL === "string"
      ? (script.sourceURL.split(/[?#]/)[0].split("/").pop() || "").replace(/-[\w-]{6,}\.js$/, ".js")
      : "";
  const fn = typeof script.sourceFunctionName === "string" ? script.sourceFunctionName : "";
  const invoker = typeof script.invoker === "string" ? script.invoker : "";
  return [file, fn, invoker]
    .filter(Boolean)
    .join(":")
    .replace(/[^a-zA-Z0-9_$.:<>#-]/g, "_")
    .slice(0, 100);
}

function bump<T>(map: Map<string, T>, key: string, create: () => T): T | null {
  let stat = map.get(key);
  if (!stat) {
    if (map.size >= LABEL_LIMIT) return null;
    stat = create();
    map.set(key, stat);
  }
  return stat;
}

export function createFrameDiagnostics() {
  let frameMs = DEFAULT_FRAME_MS;
  let frames = emptyFrames();
  let runs = emptyRuns();
  const animations = new Map<string, AnimationStat>();
  const scripts = new Map<string, ScriptStat>();

  let stopped = false;
  let active = 0;
  let sampling = false;
  let scrolling = false;
  let runStart = 0;
  let last = 0;
  let deltas: number[] = [];
  const labels = new Set<string>();
  let pickerOpenedAt = -1;
  let pickerClosedAt = -1;

  const visible = () => document.visibilityState === "visible";

  // Intervalo real do monitor: 60 Hz e 144 Hz perdem quadros em limiares diferentes.
  const calibrate = () => {
    const samples: number[] = [];
    let previous = 0;
    const step = (now: number) => {
      if (stopped) return;
      if (previous && visible()) samples.push(now - previous);
      previous = now;
      if (samples.length < 20) return void requestAnimationFrame(step);
      samples.sort((a, b) => a - b);
      const median = samples[samples.length >> 1];
      if (median >= 4 && median <= 50) frameMs = median;
    };
    requestAnimationFrame(step);
  };

  const finish = () => {
    sampling = false;
    scrolling = false;
    active = 0;
    let dropped = 0;
    let worst = 0;
    for (const delta of deltas) {
      dropped += Math.max(0, Math.round(delta / frameMs) - 1);
      if (delta > worst) worst = delta;
    }
    runs.runs++;
    runs.frames += deltas.length;
    runs.dropped += dropped;
    runs.worst_ms = Math.max(runs.worst_ms, worst);
    for (const label of labels) {
      const stat = bump(animations, label, emptyRuns);
      if (!stat) continue;
      stat.runs++;
      stat.frames += deltas.length;
      stat.dropped += dropped;
      stat.worst_ms = Math.max(stat.worst_ms, worst);
    }
    labels.clear();
    deltas = [];
  };

  const tick = (now: number) => {
    if (stopped) return;
    // Janela oculta tem o rAF estrangulado: o intervalo não é quadro perdido.
    if (!visible()) {
      labels.clear();
      deltas = [];
      sampling = false;
      scrolling = false;
      active = 0;
      return;
    }
    deltas.push(now - last);
    last = now;
    if (active > 0 && now - runStart < RUN_CAP_MS) requestAnimationFrame(tick);
    else finish();
  };

  const onStart = (event: Event) => {
    if (!visible()) return;
    const isAnimation = event.type === "animationstart";
    // Spinner e pulso giram sem parar; amostrá-los seria medir o tempo todo.
    if (
      isAnimation &&
      event.target instanceof Element &&
      getComputedStyle(event.target).animationIterationCount === "infinite"
    )
      return;
    const detail = isAnimation
      ? (event as AnimationEvent).animationName
      : (event as TransitionEvent).propertyName;
    if (labels.size < 4) labels.add(`${elementLabel(event.target)}:${detail}`.slice(0, 80));
    active++;
    if (sampling) return;
    sampling = true;
    runStart = last = performance.now();
    requestAnimationFrame(tick);
  };

  const onEnd = () => {
    if (active > 0) active--;
  };

  // A rolagem acontece fora da thread principal, mas o ritmo dos quadros dela
  // acompanha o do compositor: placa sobrecarregada aparece como intervalo longo.
  const onScroll = (event: Event) => {
    if (scrolling || !visible()) return;
    scrolling = true;
    const scroller = event.target instanceof Document ? document.scrollingElement : event.target;
    if (labels.size < 4) labels.add(`scroll:${elementLabel(scroller)}`);
    active++;
    if (sampling) return;
    sampling = true;
    runStart = last = performance.now();
    requestAnimationFrame(tick);
  };
  const onScrollEnd = () => {
    if (!scrolling) return;
    scrolling = false;
    onEnd();
  };

  const onClick = (event: Event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.type === "file") {
      pickerOpenedAt = performance.now();
      pickerClosedAt = -1;
    }
  };
  const onPickerClosed = (event: Event) => {
    const target = event.target;
    if (pickerOpenedAt >= 0 && target instanceof HTMLInputElement && target.type === "file")
      pickerClosedAt = performance.now();
  };

  const startEvents = ["transitionrun", "animationstart"];
  const endEvents = ["transitionend", "transitioncancel", "animationend", "animationcancel"];
  const options = { capture: true, passive: true } as const;
  for (const name of startEvents) document.addEventListener(name, onStart, options);
  for (const name of endEvents) document.addEventListener(name, onEnd, options);
  document.addEventListener("scroll", onScroll, options);
  document.addEventListener("scrollend", onScrollEnd, options);
  document.addEventListener("click", onClick, options);
  document.addEventListener("change", onPickerClosed, options);
  document.addEventListener("cancel", onPickerClosed, options);
  calibrate();

  return {
    /** Recebe cada `long-animation-frame` (o navegador só emite os de 50 ms ou mais). */
    noteFrame(entry: PerformanceEntry): void {
      const raw = entry as PerformanceEntry & Record<string, unknown>;
      const entryScripts = Array.isArray(raw.scripts) ? raw.scripts : [];
      // Sem script e sem bloqueio é janela que não estava pintando, não travamento.
      if (!entryScripts.length && !(Number(raw.blockingDuration) > 0)) return;
      const end = entry.startTime + entry.duration;
      const layoutStart = Number(raw.styleAndLayoutStart) || end;
      frames.count++;
      frames.total_ms += entry.duration;
      frames.max_ms = Math.max(frames.max_ms, entry.duration);
      frames.layout_ms += Math.max(0, end - layoutStart);
      if (sampling) frames.in_animation++;
      for (const script of entryScripts.slice(0, 20)) {
        if (!script || typeof script !== "object") continue;
        const duration = Number(script.duration) || 0;
        frames.script_ms += duration;
        frames.forced_layout_ms += Number(script.forcedStyleAndLayoutDuration) || 0;
        if (duration < 16) continue;
        const stat = bump(scripts, scriptLabel(script), () => ({
          count: 0,
          total_ms: 0,
          max_ms: 0,
        }));
        if (!stat) continue;
        stat.count++;
        stat.total_ms += duration;
        stat.max_ms = Math.max(stat.max_ms, duration);
      }
    },

    /** Um seletor de arquivo nativo esteve aberto durante o intervalo? */
    nativePickerOverlaps(startTime: number, duration: number): boolean {
      if (pickerOpenedAt < 0) return false;
      const closedAt = pickerClosedAt < 0 ? Infinity : pickerClosedAt;
      return startTime <= closedAt && startTime + duration >= pickerOpenedAt;
    },

    /** Agregado do período, ou null quando não houve nada que valha um log. */
    flush(): Record<string, unknown> | null {
      const worthIt = frames.count >= 3 || frames.total_ms >= 300 || runs.dropped >= 5;
      const report = worthIt
        ? {
            frame_interval_ms: round(frameMs),
            slow_frame_count: frames.count,
            slow_frame_total_ms: Math.round(frames.total_ms),
            slow_frame_max_ms: Math.round(frames.max_ms),
            slow_frame_layout_ms: Math.round(frames.layout_ms),
            slow_frame_script_ms: Math.round(frames.script_ms),
            slow_frame_forced_layout_ms: Math.round(frames.forced_layout_ms),
            slow_frames_in_animation: frames.in_animation,
            top_scripts: [...scripts]
              .sort((a, b) => b[1].total_ms - a[1].total_ms)
              .slice(0, 6)
              .map(([name, s]) => ({
                name,
                count: s.count,
                total_ms: Math.round(s.total_ms),
                max_ms: Math.round(s.max_ms),
              })),
            animation_runs: runs.runs,
            animation_frames: runs.frames,
            animation_dropped_frames: runs.dropped,
            animation_worst_frame_ms: round(runs.worst_ms),
            top_animations: [...animations]
              .sort((a, b) => b[1].dropped - a[1].dropped)
              .slice(0, 8)
              .map(([name, a]) => ({ name, ...a, worst_ms: round(a.worst_ms) })),
          }
        : null;
      frames = emptyFrames();
      runs = emptyRuns();
      animations.clear();
      scripts.clear();
      return report;
    },

    stop(): void {
      stopped = true;
      for (const name of startEvents) document.removeEventListener(name, onStart, options);
      for (const name of endEvents) document.removeEventListener(name, onEnd, options);
      document.removeEventListener("scroll", onScroll, options);
      document.removeEventListener("scrollend", onScrollEnd, options);
      document.removeEventListener("click", onClick, options);
      document.removeEventListener("change", onPickerClosed, options);
      document.removeEventListener("cancel", onPickerClosed, options);
    },
  };
}
