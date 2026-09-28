// SemVer 2.0.0, aceitando também o prefixo v das tags de release.
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/;

/**
 * Nomes de branches e valores inválidos não podem virar versões do app.
 * Compartilhado pelo build e pelo renderer para manter a mesma validação.
 * @param {unknown} value
 * @returns {string} Versão normalizada, ou string vazia quando inválida.
 */
export function normalizeAppVersion(value) {
  if (typeof value !== "string") return "";
  const version = value.trim().replace(/^v(?=\d)/, "");
  const match = SEMVER.exec(version);
  if (!match) return "";
  // Identificadores numéricos de pré-release não permitem zeros à esquerda.
  if (match[4]?.split(".").some((part) => /^0\d+$/.test(part))) return "";
  return version;
}
