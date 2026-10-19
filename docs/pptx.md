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
4. o **próprio programa de apresentação** salva o arquivo como PDF;
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

## Onde fica

```
<dados>/files/pptx/
├── <hash do arquivo>-<assinatura das fontes>-<conversor>.pdf
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
| `electron/main/pptx/windowsScript.js`     | script PowerShell (fontes + COM)                    |
| `src/modules/media_library/pptxImport.ts` | validação da resposta e textos de andamento         |

IPC: `pptx:status`, `pptx:convert` (`{ path }`) e o evento `pptx:progress`.
O caminho é validado no main (extensão, existência, tamanho).

## Limites

- Animações, transições e vídeos embutidos no `.pptx` não passam para o PDF:
  cada slide vira uma página estática.
- Fontes pagas que não estão embutidas nem no Google Fonts continuam faltando;
  o operador recebe a lista para instalar à mão e adicionar de novo.
