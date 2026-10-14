# Learning Progress

## Interface: arquitetura de dados
- Introduced (Claude explicou): três formas de um site acessar dados (API sobre o banco,
  dados pré-calculados em site estático, banco no navegador via WebAssembly); volumes da
  pergunta 10; dados pessoais em arquivos públicos; fragmentação (sharding) e carga sob
  demanda em sites estáticos.
- Demonstrated understanding: escolheu site estático porque perguntas e dados não mudam,
  então não há necessidade de servidor/banco em execução.
- Needs reinforcement: ainda não tratou dados pessoais (título eleitoral como identificador)
  nem como buscar 437 mil políticos sem baixar tudo.

## Decisões confirmadas (Design checkpoint, arquitetura do site)
- Do aprendiz: site estático; páginas inicial, Mapa, Partido, Político (sem Cargo); Mapa com
  perguntas 1, 2 e 8 em nível nacional (país inteiro), estadual e municipal onde fizer sentido;
  Político com a pergunta 10 e todos os políticos disponíveis.
- Propostas do Claude aceitas: carga nacional nova num banco separado (`--ufs todas`), só
  agregados no site; Político com os 437 mil do banco dos seis estados; script Python que
  exporta JSON para `site/dados/`; id sequencial público (sem título eleitoral); índice de
  nomes por 3 primeiras letras; homônimos com UF, último cargo e anos; carreiras em
  arquivos de ~1.000 políticos; contornos das malhas do IBGE simplificados.
- Nada implementado ainda.

## Tecnologia do front-end
- Introduced (Claude explicou, a pedido): opções e trade-offs de base (HTML/JS puro, Vite,
  React/Svelte, Astro, Observable Framework, Evidence), mapa (D3/Plot, Leaflet, MapLibre),
  gráficos (Plot, Chart.js, ECharts) e hospedagem (GitHub Pages exige plano pago em repo
  privado; Vercel/Netlify/Cloudflare gratuitos).

## Decisões confirmadas (Design checkpoint, tecnologia do front-end)
- Do aprendiz: HTML + JS puros, D3/Observable Plot, GitHub Pages; tornou o repositório público.
- Propostas do Claude aceitas: módulos ES nativos (um por página + um compartilhado), D3/Plot
  por CDN jsDelivr com versão fixa, publicação de site/ via GitHub Actions, uma página HTML
  por seção, teste local com python3 -m http.server.
- Nada implementado ainda.

## Plano de construção (decidido pelo aprendiz)
- Ordem: 1 carga nacional -> 3 esqueleto do site -> 2 script de exportação -> 5 Político
  -> 4 Mapa -> 6 Partido -> 7 publicação.
- Passo 1 aprovado para implementação: banco novo `eleicoes_nacional` com `--ufs todas`,
  sem tocar em `eleicoes` nem `eleicoes_brasil`; validar com 03_validacao.sql.

## Pending decision
- Decisão: próximo passo (3, esqueleto do site) após a carga nacional.
- Etapa: awaiting reasoning (Build checkpoint), depois do relatório do passo 1.
