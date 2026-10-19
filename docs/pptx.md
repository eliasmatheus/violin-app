# PowerPoint fiel

Um `.pptx` costuma "quebrar" no computador do culto: quem fez os slides usou
fontes que não estão instaladas ali, e o texto aparece com outra fonte, outro
tamanho e fora do lugar.

A Biblioteca de Mídia aceita PowerPoint (`.pptx`, `.ppsx`, `.pptm`, `.ppt`,
`.pps`, `.odp`) e resolve isso antes de projetar:

1. lê as fontes que o arquivo usa, sem abrir o PowerPoint (o `.pptx` é um ZIP
   de XMLs: `<a:latin typeface>`, `<a:sym typeface>` e o tema);
2. as fontes **embutidas** no arquivo (`ppt/fonts/*.fntdata`, EOT com
   compressão MTX) são extraídas e instaladas, respeitando a permissão gravada
   na fonte (`fsType` 2 não instala; 4 instala só na sessão do Windows);
3. as que ainda faltam são buscadas no **Google Fonts** e instaladas — com a
   tabela `name` reescrita para os nomes que o Windows espera
   ("Bricolage Grotesque ExtraBold");
4. o **próprio programa de apresentação** desenha os slides: o PowerPoint
   exporta cada slide como imagem (1920 px, JPEG 92) e o PDF é montado só com
   essas imagens (`imagesPdf.js`); o LibreOffice salva direto como PDF;
5. o PDF entra na biblioteca com o nome do `.pptx` e segue pela projeção de
   arquivo que já existe: telão (`file_projection`) e retorno (`file_return`).

Tudo instala só para o usuário atual, sem pedir administrador.

## Quem converte

| Sistema | Conversor                         | Fontes do usuário                                  |
| ------- | --------------------------------- | -------------------------------------------------- |
| Windows | PowerPoint (PowerShell + COM)     | `%LOCALAPPDATA%\Microsoft\Windows\Fonts` + HKCU    |
| macOS   | PowerPoint (AppleScript)          | `~/Library/Fonts`                                  |
| Linux   | LibreOffice (`soffice --headless`) | `~/.local/share/fonts/louvorja` + `fc-cache`       |

Sem PowerPoint, Windows e macOS também usam o LibreOffice, se estiver
instalado. Sem nenhum dos dois, a biblioteca explica o que instalar.

O PowerPoint só enxerga fonte nova depois de reiniciar. Se ele estava aberto
**sem** apresentação, é reiniciado sozinho; com apresentação aberta, a
conversão segue e o operador é avisado (o PDF não entra no cache).

No macOS o PowerPoint roda em sandbox: o arquivo é copiado para o container
dele antes de abrir, senão o sistema pede "Conceder acesso" a cada arquivo. Na
primeira vez o macOS pergunta se o LouvorJA pode controlar o PowerPoint
(Ajustes → Privacidade e Segurança → Automação).

### Por que imagens, e não o PDF do PowerPoint

O PDF que o PowerPoint salva traz as fontes embutidas como CID TrueType. O
pdf.js 6 da projeção, no Electron 41, não desenhou essas fontes (o título caiu
numa fonte genérica) e perdeu formas do slide — o worker do pdf.js chama
`Math.sumPrecise`, que o Chromium do Electron 41 ainda não tem. Com uma imagem
por página não existe fonte nem vetor a interpretar: o telão mostra o pixel que
o PowerPoint gerou.

## Onde fica

```
<dados>/files/pptx/
├── <hash do arquivo>-<assinatura das fontes>-<conversor>-v2.pdf
├── <mesmo nome>.json      metadado (arquivo de origem, fontes, data)
└── fonts/                 fontes extraídas/baixadas (embedded/, google/)
```

A assinatura das fontes muda quando uma fonte que faltava passa a existir:
o mesmo arquivo é convertido de novo. `storage.js` trata `files/pptx` como
conteúdo do operador — `clearFiles`, `clearUnused` e `enforceQuota` não
apagam.

## Código

| Arquivo                                   | Papel                                               |
| ----------------------------------------- | --------------------------------------------------- |
| `electron/main/pptx/index.js`             | fluxo completo, cache, fila (uma conversão por vez) |
| `electron/main/pptx/pptxFonts.js`         | fontes do `.pptx` e extração das embutidas          |
| `electron/main/pptx/systemFonts.js`       | fontes instaladas e instalação por sistema          |
| `electron/main/pptx/googleFonts.js`       | catálogo e download do Google Fonts                 |
| `electron/main/pptx/fontRename.js`        | renomeia pesos de fontes variáveis                  |
| `electron/main/pptx/converters.js`        | PowerPoint (Win/Mac) e LibreOffice                  |
| `electron/main/pptx/imagesPdf.js`         | PDF com uma imagem de slide por página             |
| `electron/main/pptx/windowsScript.js`     | script PowerShell (fontes + COM)                    |
| `src/modules/media_library/pptxImport.ts` | validação da resposta e textos de andamento         |

IPC: `pptx:status`, `pptx:convert` (`{ path }`) e o evento `pptx:progress`.
O caminho é validado no main (extensão, existência, tamanho).

## Modo nativo: animações, vídeos e áudios

O modo imagem não leva animações nem mídias: cada slide é uma página parada.
Ao preparar o arquivo, o LouvorJA conta os slides com animação (`presetClass`
entr/exit/emph/path) e as mídias em `ppt/media/`; se houver, a janela de
andamento e o painel do operador oferecem **Apresentar com o PowerPoint**.

Nesse modo (`electron/main/pptx/nativeShow.js`, Windows + PowerPoint):

- um PowerShell fica aberto durante a apresentação, falando com o PowerPoint
  por COM (comandos em JSON pela entrada padrão);
- o PowerPoint abre o `.pptx` original (cópia sem a marca "baixado da
  internet", com as fontes já resolvidas) em tela cheia **no monitor do PA**
  (`file_projection`) — sem monitor de projeção definido, não abre;
- o painel continua servindo: Próximo/Anterior, clique na miniatura (vai para
  o slide), Tela preta e Encerrar; o main consulta o slide atual a cada 700 ms
  e publica `pptx:native-state`, então avançar pelo próprio PowerPoint também
  aparece no painel;
- cada início, falha e mudança de estado vai para `files/pptx/modo-nativo.log`
  (corta sozinho em ~200 KB): é o que pedir ao operador quando o PowerPoint se
  comportar diferente no computador dele.
- **o retorno continua sendo o do LouvorJA** (se "Exibir na tela de retorno" estiver
  ligado): a mesma janela do modo imagem, com o slide atual e o próximo tirados do
  PDF já gerado. A página acompanha o PowerPoint pela consulta de estado; o índice
  vem na conta do PDF (slides ocultos ficam de fora), então casa com as
  miniaturas. A animação não aparece no retorno — ele mostra a imagem final do slide.

IPC: `pptx:nativeStart` (`{ path, startIndex }`), `pptx:nativeNav`
(`{ action: next|prev|goto|black, index }`), `pptx:nativeEnd`,
`pptx:nativeState` e o evento `pptx:native-state`.

## Limites

- No modo imagem, animações, transições e vídeos não passam para o PDF: cada
  slide vira uma página estática. Para eles existe o modo nativo (acima),
  hoje só no Windows (o retorno mostra a imagem final de cada slide).
- Fontes pagas que não estão embutidas nem no Google Fonts continuam faltando;
  o operador recebe a lista para instalar à mão e adicionar de novo.
