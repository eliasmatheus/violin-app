# Responsividade do web Android

## Objetivo e limites

Tornar a interface web/PWA utilizável com toque em telefone Android, de 320 a
412 CSS px, sem alterar o comportamento do Electron e de telas desktop. O
controle remoto (`/remote`) e as janelas de projeção conservam seus papéis;
a Shell principal precisa funcionar no telefone por si mesma. O trabalho cobre
navegação, busca, Bíblia, músicas, liturgia, biblioteca de mídia, opções,
diálogos e controles de reprodução. Novas telas devem seguir o mesmo contrato.

## Diagnóstico inicial

Em Chromium móvel a 360×800, a Shell usava 166px no cabeçalho e a liturgia
recolhida tirava 28px de largura. Com um módulo aberto, a barra de abas somava
30px. A Bíblia media 369px de conteúdo em 332px disponíveis, e o menu de
opções media 416px em 304px de área visível: campos e ações ficavam cortados.
O catálogo de mídia exigia no mínimo 700px. O player fixo de 88px tinha grupos
que não encolhiam. Essas medidas são a linha de base, não critérios finais.

## Direção de interface

- Manter a identidade existente: azul marinho, superfícies claras e acento
  laranja. Não introduzir uma segunda linguagem visual para o web móvel.
- Navegação principal e ferramentas com alvos de toque de pelo menos 44px.
  As abas podem rolar horizontalmente; seleção e ações precisam permanecer
  descobríveis e alcançáveis por toque.
- Priorizar conteúdo enquanto não se usa a ribbon. O usuário abre as ações
  da página quando precisa delas, sem perder a aba ativa ou o estado do módulo.
- Painéis e diálogos devem caber na largura útil; listas densas podem rolar
  dentro do próprio módulo, mas controles essenciais não podem ficar cortados.
- Suportar a altura dinâmica do Chrome Android, teclado virtual, rotação e
  PWA instalada. Não depender de hover para expor uma ação.

## Etapas de execução

1. **Estrutura:** ajustar altura da Shell, navegação, ribbon, liturgia lateral,
   abas abertas, contêiner de módulo, diálogos e menu de opções. Restringir
   regras aos breakpoints móveis para proteger o desktop.
2. **Fluxos principais:** adaptar música/playlist, Bíblia, biblioteca de mídia,
   liturgia, player e formulários com cortes comprovados. Preferir componentes
   compartilhados e preservar os dados e comandos existentes.
3. **Acessibilidade:** nomes de botões só com ícone, foco visível, ordem de
   navegação e áreas de toque. Sem ações dependentes de gesto escondido.
4. **Verificação:** medir geometria e testar taps em 320×568, 360×800,
   390×844 e 412×915; altura curta de 320×400 (simulação de teclado virtual), tablet
   768×1024, paisagem 800×360 e desktop 1024, 1366 e 1920px.
   Exercitar desenvolvimento e build web/PWA. Rodar typecheck, lint, testes,
   validações do projeto e comparação do bundle desktop.

   Comandos automatizados: `npm run test:e2e:mobile` e
   `npm run test:e2e:mobile:build`. O segundo gera o bundle web e o serve em
   preview isolado; a CI executa essa verificação além da paridade desktop.

## Critérios de aceite

- Documento e Shell sem rolagem horizontal global nas larguras alvo.
- Todo controle necessário para concluir os fluxos principais aparece ou é
  acessível por uma navegação explícita, inclusive com teclado aberto.
- Conteúdo de módulos, abas e diálogos dentro da área visível; rolagem local
  tem início e fim alcançáveis. A barra de reprodução não encobre ações.
- Estado de módulo, seleção e projeção não muda ao adaptar o layout.
- Layout e interações desktop mantêm a geometria e os testes existentes.
- Validação em Chrome Android físico e PWA instalada é uma etapa distinta da
  emulação Playwright; registrar o resultado antes de afirmar cobertura física.

## Cobertura implementada

- Shell web, navegação, menu, opções, abas, ribbon, lateral de Liturgia,
  contêineres e diálogos com rolagem e alvos de toque.
- Música e playlists, Bíblia e busca, Liturgia, mídia local, coletâneas
  pessoais, agenda, editor de slides e Anúncios receberam ajustes mobile.
- Rodapé de reprodução, sobreposições, fundo, som, recados e sorteio usam a
  altura e a largura úteis, inclusive com controles fixos abertos.
- Os testes Playwright usam Chromium com emulação de toque e repetem os fluxos
  principais no servidor de desenvolvimento e no bundle web de produção.
  `test:e2e:build` protege a aparência do desktop e a ribbon de vídeo.

## Resultado local em 29/09/2026

- `npm run test:e2e:mobile`: 14/14 cenários; `npm run test:e2e:mobile:build`:
  14/14 cenários no bundle web.
- `npm run test:e2e:build`: 2/2 cenários de paridade desktop.
- `npm test`: 235 arquivos passaram, 2.704 testes passaram e 6 ficaram
  ignorados. `npm run build`, `npm run typecheck`, `npm run lint`,
  `npm run validate:agent-context` e `npm run validate:manifests` passaram.
- Não havia aparelho Android conectado. O AVD disponível iniciou, mas seu
  Chrome não expôs uma atividade iniciável. A validação Android física ou em
  navegador do emulador, incluindo PWA instalada e teclado real, segue como
  verificação de distribuição; o resultado acima é de Chromium emulado.

## Preparação para eventual app React Native

Preservar regras de domínio, modelos e validação de dados fora dos componentes
Vue. A UI nativa será uma nova camada; manifests com componentes Vue, estilos
CSS, Pinia e APIs de navegador não são reutilizáveis diretamente. Comandos de
projeção, agenda da liturgia e estado de apresentação podem servir de contrato
quando expostos por adaptadores de plataforma. Não criar abstrações nativas
especulativas durante este trabalho de interface web.
