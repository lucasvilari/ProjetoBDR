# Project Map

## Purpose
Banco PostgreSQL de eleições brasileiras (TSE, IBGE, Atlas, survey de ideologia e
painel da Câmara) que responde a dez perguntas sobre seis estados (AP, MG, MS, PB,
RO, RR). Próxima etapa: uma interface (site) para as perguntas.

## Requirements
- Respostas restritas aos seis estados do grupo (banco já filtrado na carga).
- Textos do repositório não citam o dossiê nem uma versão nacional reduzida.
- Interface (decidido pelo aprendiz, não confirmado): site estático para as perguntas 1, 2, 8 e 10.
  Páginas: inicial (apresentação, objetivos, delimitações, fontes), Mapa (perguntas 1, 2, 8;
  conjunto dos seis estados, nível estadual e, se relevante, municipal), Partido, Político
  (pergunta 10, todos os 437.509 políticos). Sem página Cargo.

## Components
- `crawler/` (implementado): baixa os arquivos nacionais das fontes para `crawler/dados/`.
- `banco/` (implementado): `01_tabelas.sql` (17 tabelas), `02_indices_visoes.sql`
  (índices e visões), `carga.py` (carga por etapas, filtro de UFs), `03_validacao.sql`,
  `sql/` (18 consultas p01–p10c), `evidencias.sh` + `print_sessao.py`.
- `scripts/` (implementado): `gera_dump.sh`, `restaura_dump.sh`.
- `docs/modelo/` (implementado): página HTML estática do D.E.R. e das tabelas.
- `site/` (implementado em 2026-10-09): páginas inicial, Mapa, Partido, Político em HTML/JS puros
  com D3 e Observable Plot; `gera_dados.py` exporta `site/dados/` (políticos do banco `eleicoes`;
  mapa, partidos e destaque do banco `eleicoes_nacional`; contornos do IBGE);
  publicação por `.github/workflows/site.yml` (GitHub Pages, fonte "GitHub Actions" a configurar).

## Main Flow
fontes (TSE, IBGE, Ipeadata, Dataverse) --crawler--> crawler/dados/*.csv
crawler/dados --carga.py (filtra UFs)--> PostgreSQL `eleicoes`
`eleicoes` --pg_dump--> eleicoes.dump --Release do GitHub--> colegas (restaura_dump.sh)
`eleicoes` --banco/sql/*.sql (psql)--> evidencias/ (.txt, .png, .csv)
Escolhido, não implementado:
`eleicoes` (6 estados) --script Python de exportação--> site/dados/*.json (carreiras em
  fragmentos de ~1.000, índice de nomes por 3 letras, id sequencial público)
banco nacional separado (carga `--ufs todas`) --mesmo script--> agregados nacionais das perguntas 1, 2 e 8
malhas do IBGE (simplificadas) --> contornos do Mapa
site/ (estático: inicial, Mapa, Partido, Político) --hospedagem de páginas estáticas--> navegador
Front-end escolhido (não implementado): HTML + JS puros com módulos ES, D3/Observable Plot via CDN, uma página por seção; publicação de site/ no GitHub Pages via GitHub Actions (repositório público).

## Data and Trust Boundaries
- Banco local PostgreSQL 16 (`eleicoes`, ~1,7 GB); dump de 162 MB publicado como Release.
- Dados pessoais no banco (CPF, título eleitoral, data de nascimento); evidências ocultam o título.
- Repositório público desde 2026-10-09; site/dados/ será público (sem título eleitoral nem CPF).

## Build and Deployment
- Carga: `banco/.venv/bin/python banco/carga.py [--etapas ...] [--ufs ...]`
- Validação: `psql -d eleicoes -f banco/03_validacao.sql`
- Evidências: `cd banco && ./evidencias.sh`
- Dump: `scripts/gera_dump.sh` / `scripts/restaura_dump.sh eleicoes.dump`

## Unknowns
- Formato detalhado dos JSON e granularidade municipal de cada pergunta.
