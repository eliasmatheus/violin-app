/** Uma versão do histórico quando o sincronizador criou cópias em conflito. */
export interface SeriesVersion {
  /** Nome do arquivo na pasta (o principal ou a cópia). */
  name: string;
  modifiedAt: string;
  plays: number;
  lastPlay: { file: string; at: string } | null;
}

/** Uma exibição de um vídeo da série. `undone`: o operador desmarcou (passou por engano). */
export interface SeriesPlay {
  id: string;
  /** Nome do arquivo dentro da pasta da série. */
  file: string;
  /** ISO 8601. */
  at: string;
  cycle: number;
  undone?: true;
}

/**
 * Histórico de uma série de vídeos (`.louvorja-serie.json` na própria pasta).
 * Ao fim da série: `restart` recomeça (Momento Saúde); `suggest_new` sugere
 * ao operador começar outra (Provai e Vede de outro ano).
 */
export interface SeriesDoc {
  version: 1;
  active: boolean;
  name: string;
  onEnd: "restart" | "suggest_new";
  cycle: number;
  updatedAt: string;
  plays: SeriesPlay[];
}
