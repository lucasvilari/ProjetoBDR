# Site

Site estático que responde a cinco perguntas com os dados do banco:

| Página | Pergunta |
|---|---|
| `index.html` | apresentação do projeto, delimitações e fontes |
| `mapa.html` | quanto custa uma cadeira; patrimônio e vitória; dinheiro público e vitória; viés ideológico ao longo do tempo (Brasil, os seis estados do projeto e seus municípios) |
| `partido.html` | posição dos partidos segundo especialistas, alianças e votações na Câmara |
| `politico.html` | carreira de cada político de AP, MG, MS, PB, RO e RR, e dos candidatos a presidente, de 1998 a 2024 |

Não há servidor nem banco em funcionamento: as páginas leem arquivos JSON em `dados/`,
gerados uma vez a partir do banco. HTML, CSS e JavaScript puros, com módulos do
navegador; gráficos com [Observable Plot](https://observablehq.com/plot/) e mapa com
[D3](https://d3js.org/), ambos carregados do jsDelivr com versão fixa.

## Estrutura

```
site/
├── index.html, mapa.html, partido.html, politico.html
├── css/estilo.css          estilo comum
├── js/comum.js             cabeçalho, rodapé, leitura dos dados e formatos
├── js/<página>.js          uma por página
├── gera_dados.py           gera dados/ a partir do banco
└── dados/
    ├── partidos.json       medidas de ideologia e eleitos por partido
    ├── mapa/               perguntas 1, 2 e 8: brasil.json, municipios/<UF>.json e
    │                       candidatos/<UF ou BR>.json (recortes com até 20 candidatos)
    ├── vies/               pergunta 7: brasil.json (Brasil, regiões, UFs) e municipios/<UF>.json
    ├── geo/                contornos do IBGE (estados e municípios dos seis estados)
    └── politicos/          índice de busca, fichas e carreiras, em fatias
```

## Gerar os dados

O gerador usa dois bancos: o dos seis estados (`eleicoes`, o do dump) para os políticos e as
listas de candidatos, e um com o país inteiro para o mapa, os partidos e o viés, carregado com
`banco/carga.py --ufs todas` num banco separado:

```bash
createdb eleicoes_nacional
```

```bash
DATABASE_URL="dbname=eleicoes_nacional" banco/.venv/bin/python banco/carga.py --ufs todas
```

```bash
cd site && ../banco/.venv/bin/python gera_dados.py
```

Uma parte só: `--partes politicos` (ou `candidatos`, `mapa`, `geo`, `partidos`, `vies`). Título
eleitoral, CPF e data de nascimento não saem do banco: cada político recebe um número
sequencial próprio.

## Ver localmente

O navegador não lê os JSON de uma página aberta direto do disco; é preciso servi-la:

```bash
python3 -m http.server 8765 --directory site
```

Depois abra http://localhost:8765.

## Publicação

O workflow `.github/workflows/site.yml` publica esta pasta no GitHub Pages a cada push
na `main` que altere `site/`. Nas configurações do repositório, em Pages, a fonte deve
ser "GitHub Actions".
