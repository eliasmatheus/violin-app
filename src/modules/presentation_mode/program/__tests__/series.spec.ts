import { describe, expect, it } from "vitest";
import { newSeries, playedInCycle, progressOf, splitPath, withNewCycle, withPlay, withoutPlay } from "../series";

const files = ["01 Água.mp4", "02 Sono.mp4", "03 Sol.mp4"];
const T = (d: number) => `2026-09-${String(d).padStart(2, "0")}T19:30:00Z`;

describe("série", () => {
  it("o próximo é o primeiro da pasta que ainda não passou", () => {
    let doc = newSeries("Momento Saúde", "restart", T(1));
    expect(progressOf(doc, files)).toEqual({ next: "01 Água.mp4", played: 0, total: 3, completed: false });
    doc = withPlay(doc, "01 Água.mp4", "a", T(3));
    doc = withPlay(doc, "03 Sol.mp4", "b", T(6));
    expect(progressOf(doc, files)).toEqual({ next: "02 Sono.mp4", played: 2, total: 3, completed: false });
  });

  it("desmarcar devolve o vídeo à lista", () => {
    let doc = withPlay(newSeries("S", "restart", T(1)), "01 Água.mp4", "a", T(3));
    doc = withoutPlay(doc, "01 Água.mp4", T(4));
    expect(progressOf(doc, files).next).toBe("01 Água.mp4");
  });

  it("todos passaram: série concluída; novo ciclo libera todos e guarda o histórico", () => {
    let doc = newSeries("S", "restart", T(1));
    files.forEach((f, i) => (doc = withPlay(doc, f, String(i), T(i + 2))));
    expect(progressOf(doc, files)).toMatchObject({ next: null, completed: true });
    doc = withNewCycle(doc, T(10));
    expect(progressOf(doc, files)).toMatchObject({ next: "01 Água.mp4", played: 0 });
    expect(doc.plays).toHaveLength(3);
    expect(playedInCycle(doc).size).toBe(0);
  });

  it("separa pasta e arquivo no Windows e no macOS", () => {
    expect(splitPath("C:\\Igreja\\Saúde\\01.mp4")).toEqual({ dir: "C:\\Igreja\\Saúde", file: "01.mp4" });
    expect(splitPath("/Users/x/Saúde/01.mp4")).toEqual({ dir: "/Users/x/Saúde", file: "01.mp4" });
  });
});
