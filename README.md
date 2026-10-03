# Eleições brasileiras: custo, financiamento, perfil e desempenho

Projeto da disciplina de Bancos de Dados Relacionais.
Reúne dados abertos do TSE sobre candidaturas, votação, patrimônio e prestação de
contas de 1998 a 2024, cruzados com indicadores municipais do IBGE e do Atlas do
Desenvolvimento Humano e com uma classificação ideológica dos partidos, num banco
PostgreSQL que responde a dez perguntas sobre seis estados: Amapá, Mato Grosso do Sul,
Minas Gerais, Paraíba, Rondônia e Roraima.

Lucas Vilarinho, Raimundo Nonato, Matheus Carneiro e Gabriel Araújo.

## Estrutura

```
.
├── crawler/     baixa das fontes só os arquivos que as perguntas usam (python -m crawler)
├── banco/       esquema, carga, validação e as 18 consultas das perguntas
├── scripts/     geração e restauração do dump do banco
├── site/        site das perguntas (a construir)
└── docs/        página do modelo (D.E.R. e tabelas) e figuras do D.E.R.
```

## Como usar

Para só montar o banco e rodar as consultas, siga o [TUTORIAL.md](TUTORIAL.md), que
explica passo a passo como baixar o dump da página de Releases e executar cada
consulta. As seções abaixo detalham cada parte.

### Ver o modelo

Abra `docs/modelo/modelo_relacional.html` no navegador. A página tem os três diagramas
do D.E.R. e as 17 tabelas, com o mapeamento entre eles.

### Antes de montar o banco: PostgreSQL e um papel com permissão

Os dois caminhos abaixo precisam do PostgreSQL 16 ou mais recente. No PostgreSQL, quem
acessa o banco é um **papel** (usuário do banco), não o usuário do sistema, e uma
instalação nova só tem o papel administrador `postgres`. No Linux, as conexões locais
exigem um papel com o mesmo nome do seu usuário do sistema. Crie esse papel com
permissão para criar bancos, que é o mínimo necessário:

```bash
sudo apt install postgresql
```

```bash
sudo -u postgres createuser --createdb $USER
```

No Windows e no macOS, o instalador cria o `postgres` com uma senha, e a conexão é pela
rede. Informe-a nas variáveis padrão antes de rodar os scripts:

```bash
export PGHOST=localhost PGUSER=postgres PGPASSWORD=a-senha-escolhida
```

O `restaura_dump.sh` confere tudo isso antes de começar e, se faltar algo, mostra o
comando que resolve.

### Montar o banco a partir do dump

É o caminho rápido: não precisa do crawler nem dos 31 GB de CSV. Requer PostgreSQL 16.
Baixe o `eleicoes.dump` da página de Releases do repositório e restaure; leva menos
de um minuto:

```bash
scripts/restaura_dump.sh eleicoes.dump
```

Para gerar um dump novo depois de refazer a carga: `scripts/gera_dump.sh`.

### Montar o banco do zero

Requer Python 3.10+, PostgreSQL 16 e cerca de 40 GB livres (33 GB de arquivos e 1,7 GB
de banco). O download é de uns 6 GB.

```bash
cd crawler
python3 -m venv venv && venv/bin/pip install -r requirements.txt
venv/bin/python -m crawler
```

```bash
cd banco
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
createdb eleicoes
.venv/bin/python carga.py
psql -d eleicoes -f 03_validacao.sql
```

A carga leva cerca de 15 minutos. Os arquivos do TSE são nacionais, e a carga grava
só as UFs do projeto; outro conjunto pode ser escolhido com `--ufs` (veja
`banco/README.md`). O que cada etapa gravou e descartou fica na tabela
`carga.log`, e as decisões que os dados reais exigiram estão em `banco/README.md`.

### Responder às perguntas

As consultas ficam em `banco/sql/`, uma por pergunta (ou parte dela). O script abaixo
executa todas com parâmetros fixos e grava o resultado, um print e um CSV de cada uma
em `banco/evidencias/`:

```bash
cd banco && ./evidencias.sh
```

As perguntas sobre ideologia usam três medidas por partido (especialistas,
coligações e votações na Câmara), explicadas em
[`banco/README.md`](banco/README.md#ideologia-dos-partidos-três-medidas).

## Fontes

- **TSE**, Portal de Dados Abertos: candidaturas, bens, vagas, votação, prestação de
  contas e comparecimento.
- **IBGE**, APIs SIDRA e de Localidades: PIB, população, Censo 2022 e territórios.
- **Atlas do Desenvolvimento Humano** (PNUD, Ipea e FJP), pela API do Ipeadata: IDHM,
  escolaridade e envelhecimento.
- **Harvard Dataverse**, doi:10.7910/DVN/MFIXKW: classificação ideológica dos partidos
  por especialistas (Bolognesi, Codato, Ribeiro e Silva).
- **Painel Análise da Câmara dos Deputados** (dados-camara-dashboard-alpha.vercel.app):
  posição média dos partidos nas votações nominais da Câmara, copiada em
  `banco/fontes/espectro_camara.json`.
