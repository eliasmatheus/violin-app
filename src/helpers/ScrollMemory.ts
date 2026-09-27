/**
 * Memória de rolagem compartilhada da aplicação.
 *
 * Páginas são desmontadas/reanexadas a cada troca de módulo — por `v-if`
 * interno (liturgia) ou pelo destaque do KeepAlive (os demais). O browser não
 * mantém `scrollTop` de um nó sem caixa de rolagem: ao reanexar, a posição
 * volta ao topo. Por isso a posição vive em módulo (sobrevive à evicção do
 * cache de 4 telas) e é salva no próprio evento `scroll`: guardar em hook de
 * desmontagem pegaria o root já destacado do documento, e `scrollTop` de
 * elemento destacado lê 0.
 *
 * Chaves por namespace: `liturgy:*`, `musics:*`, `container:<moduleId>`.
 */
const posicoes = new Map<string, number>();

export function setScrollPosition(chave: string, top: number): void {
  posicoes.set(chave, top);
}

export function getScrollPosition(chave: string): number {
  return posicoes.get(chave) ?? 0;
}
