/** @category helper-puro — Número do hino de uma música. Sem APIs Vue.
 *
 * O número não vive na música: vive no vínculo dela com o álbum, e só vale
 * quando esse álbum é um hinário — a mesma música pode ser a faixa 3 de uma
 * coletânea e o hino 428 do Hinário Adventista.
 */
import { hymnalTracks, isHymnalTrack } from "@root/config/musicCatalog.mjs";
export { hymnalTracks, isHymnalTrack };
export default { hymnalTracks, isHymnalTrack };
