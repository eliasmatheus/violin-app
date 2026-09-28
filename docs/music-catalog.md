# Catálogo de músicas

As buscas de música, a liturgia, a paleta de comandos e o controle remoto usam
as regras puras de `config/musicCatalog.mjs`. O renderer acompanha preferências
reativas em `useMusicCatalog`.

- Álbuns desativados não participam dos resultados, nomes ou números pesquisáveis.
  Músicas com mais de um vínculo continuam disponíveis pelos álbuns ativos.
- O ano explícito do álbum tem prioridade; em sua ausência, o ano vem do subtítulo
  das categorias ou do nome. Intervalos usam o maior ano. As edições conhecidas
  do Hinário Adventista são 2022 (álbum 712) e 1996 (álbum 629).
- Os maiores anos aparecem primeiro, com os títulos em ordem alfabética dentro
  do mesmo ano. Metadados de categorias ausentes não impedem o uso do catálogo.
- Consultas só com dígitos buscam o número exato do hino. Uma faixa de CD comum
  não conta como número de hino. O número mostrado vem do vínculo com o hinário,
  no formato “Hino nº 123 - Nome da música” (ou nome do álbum no campo de álbum).
- Músicas personalizadas conservam o título original e mostram “Coletânea
  personalizada” no campo do álbum, traduzido para o idioma ativo.

O filtro é uma projeção para exibição: não modifica o cache do banco nem apaga
músicas ou itens já salvos na liturgia. Favoritos, histórico e playlists recebem
metadados do catálogo sem alterar sua ordem salva. Reordenar favoritos mantém
as referências ocultas; a reprodução sequencial ou aleatória pula músicas de
álbuns desativados e reconsulta sua disponibilidade entre músicas.
