# Banco de dados do projeto

Redução do D.E.R. a tabelas e carga dos arquivos baixados pelo crawler
(`../crawler/dados`) num PostgreSQL 16, com os dados de Amapá, Mato Grosso do Sul,
Minas Gerais, Paraíba, Rondônia e Roraima (ver "Escopo geográfico").

| Arquivo | O que faz |
|---|---|
| `01_tabelas.sql` | Cria as 17 tabelas, com chaves, restrições e colunas geradas |
| `02_indices_visoes.sql` | Índices, visões (`vw_candidatura`, `vw_patrimonio`, `vw_qt_mandatos`, `vw_ideologia_partido`) e `nivel_escolaridade()` |
| `carga.py` | Executa `01`, carrega os dados e executa `02` |
| `03_validacao.sql` | Confere a carga contra os totais dos arquivos do TSE |
| `fontes/espectro_camara.json` | Cópia da posição dos partidos nas votações da Câmara (ver "Ideologia") |
| `sql/`, `evidencias.sh` | Consultas das perguntas e geração das evidências de execução |

## Como executar

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

```bash
.venv/bin/python carga.py
```

A carga completa leva cerca de 15 minutos e recria tudo do zero. Uma etapa isolada
pode ser refeita com `--etapas` (por exemplo `--etapas despesa`), no escopo já
gravado no banco. Outro conjunto de estados é escolhido com `--ufs` (por exemplo
`--ufs PI,CE`). O banco padrão é
`dbname=eleicoes`; outro pode ser indicado em `DATABASE_URL`.

```bash
psql -d eleicoes -f 03_validacao.sql
```

## Como a carga funciona

Cada CSV é copiado sem transformação (`COPY`) para uma tabela de preparo no esquema
`stg`, com todas as colunas como texto. A limpeza e a gravação no modelo são feitas
em SQL. Os arquivos grandes são preparados um ano por vez. Ao final o esquema `stg`
é removido e fica só o registro `carga.log`, com o que cada etapa leu, gravou e
descartou (e por quê).

Regras aplicadas: leitura em latin-1 com `;`; `#NULO#`, `#NE`, `-1`,
`-3` e `-4` gravados como NULL; situação final do último turno; PIB × 1000;
população do Censo em 2022; `ST_REELEICAO` como booleano; partido com id próprio
por par (número, sigla).

## Escopo geográfico

O projeto responde às perguntas para AP, MG, MS, PB, RO e RR, que somam 1.238
municípios. Os arquivos do TSE e do IBGE são nacionais; o recorte é feito na carga:

- cada CSV do TSE é recortado pela coluna `SG_UF` logo depois de copiado para o
  esquema `stg`, e as linhas descartadas ficam em `carga.log` com o motivo "fora do
  escopo geográfico";
- os municípios são filtrados pela UF, e os indicadores do IBGE e do Atlas, pelos
  municípios carregados;
- as candidaturas a presidente (UF "BR") são mantidas, porque recebem votos nos
  municípios do escopo; seus bens, receitas e despesas são os da campanha nacional;
- as UFs carregadas ficam na tabela `carga.escopo`, e os totais dos CSVs de receitas
  e despesas dentro do escopo, em `carga.total_csv`, usada por `03_validacao.sql`.

Como o banco só tem os seis estados, todas as respostas se referem a eles. Na
pergunta 6, a mediana de idade que separa municípios mais velhos e mais jovens é a
dos municípios carregados.

## Resultado (carga de 02/10/2026)

| Tabela | Linhas | Tabela | Linhas |
|---|---:|---|---:|
| eleicao | 24 | municipio | 1.238 |
| vaga | 7.516 | idhm_municipio | 3.711 |
| politico | 437.509 | indicador_anual | 12.380 |
| partido | 59 | apuracao | 22.395 |
| ideologia_partido | 77 | perfil_comparecimento | 1.684.622 |
| ideologia_coligacao | 174 | | |
| candidatura | 707.384 | votos_cand | 4.806.536 |
| bem | 445.599 | votos_part | 276.694 |
| receita | 1.338.349 | despesa | 1.883.090 |

O banco ocupa 1.688 MB. Conferências de `03_validacao.sql`:

- eleitos coincidem com as vagas (97 deputados federais, 209 estaduais, 6
  governadores e todas as cadeiras de vereador); faltam 14 prefeitos em 2020 e 7 em
  2024, de eleições anuladas e refeitas em suplementar;
- receitas e despesas somam de 99,5% a 100% do total dos CSVs no escopo; o restante
  é de candidaturas não carregadas (suplementares);
- os aptos do perfil de comparecimento coincidem com os da apuração.

## Decisões impostas pelos dados

Os dados reais do TSE obrigaram às decisões abaixo, marcadas com "AJUSTE" em
`01_tabelas.sql` quando mexem no esquema. A 12 afeta a consulta da pergunta 5.

1. **`sq_candidato` antes de 2018.** De 2000 a 2008 o `SQ_CANDIDATO` se repete
   dentro do próprio ano (em 2000, 399 mil candidaturas têm 3.131 valores); de
   2010 a 2016 se repete entre anos. De 2018 a 2024 é único. A carga mantém o SQ
   do TSE de 2018 em diante e grava um identificador **negativo** sintético nas
   eleições anteriores, que só servem à pergunta 10.
2. **1994 e 1996 ficam fora.** O TSE não publica o título eleitoral nesses anos,
   e sem ele não há político (FK obrigatória). A pergunta 10 cobre 1998 a 2024.
3. **Receitas e despesas são somadas por documento.** `SQ_RECEITA` e `SQ_DESPESA`
   identificam o documento; as linhas repetidas são seus itens (uma nota com seis
   produtos aparece em seis linhas). Fonte, origem, doador, tipo e fornecedor
   nunca variam dentro do documento, então a soma não perde informação e mantém
   a chave primária. A descrição guarda os textos dos itens separados por ` | `.
4. **Linhas com `SQ = -1` são descartadas.** São marcadores de prestação de
   contas zerada, sempre com valor R$ 0.
5. **`situacao_final` passou a `VARCHAR(50)`**, porque o TSE publica situações
   como "RENÚNCIA/FALECIMENTO/CASSAÇÃO ANTES DA ELEIÇÃO".
6. **Idade na posse.** `NR_IDADE_DATA_POSSE` não existe em 1994, 1996, 2014 e de
   2018 em diante; nesses anos a idade é calculada da data de nascimento (posse em
   1º de janeiro, ou 1º de fevereiro para deputados e senadores).
7. **Reeleição.** `ST_REELEICAO` não existe de 2018 em diante e, em 2004 e 2008,
   só marca prefeitos. A candidatura é marcada como reeleição quando o TSE diz
   "S" **ou** quando o político foi eleito para o mesmo cargo e unidade eleitoral
   na eleição anterior (8 anos antes para senador). Onde há o campo do TSE, a
   regra encontra de 83% a 89% dos prefeitos que ele marca como candidatos à
   reeleição. Em 1998 e 2000 a regra não se aplica, porque as eleições anteriores (1994 e 1996) não foram carregadas.
8. **Só eleições ordinárias**; as suplementares ficam fora. Cada turno tem seu
   próprio `CD_ELEICAO`; a candidatura fica no código do 1º turno.
9. **Votos no exterior (UF ZZ) ficam fora**, porque não pertencem a um município.
10. **Escolaridade** é convertida para os oito graus de `nivel_escolaridade()`
    ("1º GRAU COMPLETO" vira "ENSINO FUNDAMENTAL COMPLETO", etc.).
11. **Perfil de comparecimento sem `CD_ELEICAO`.** O arquivo do TSE só traz o ano.
    O perfil é ligado a toda eleição apurada no município e turno; nos anos gerais
    isso repete o perfil na eleição federal e na estadual, que têm o mesmo
    eleitorado.
12. **Votos válidos oficiais em `apuracao`.** A coluna `validos` guarda
    `QT_TOTAL_VOTOS_VALIDOS`. A conta `aptos − abstenções − brancos − nulos`
    incluía os votos anulados (dados a candidatos com registro indeferido) e
    inflava o quociente eleitoral da pergunta 5 em até 2%.

## Consultas e evidências

As 18 consultas ficam em `sql/`, uma por pergunta ou parte dela. O script abaixo as
executa com parâmetros fixos e grava, em `evidencias/`, a sessão do psql (`.txt`), o print
(`.png`), o resultado completo (`.csv`) e o `quadro.csv` com linhas e tempo:

```bash
./evidencias.sh
```

Três cuidados nas consultas:

- **`p01_custo_cadeira`:** as vagas são somadas por ano, e não por código de
  eleição, porque 2020 tem duas eleições ordinárias (Macapá votou em data própria).
- **`p03a_indices_municipio`:** só entram as eleições com apuração no município;
  um `CROSS JOIN eleicao` devolveria uma linha por código de eleição do ano (turnos
  e abrangências).
- **`p05_eleitos_legenda`:** usa os válidos oficiais e converte a UF para `VARCHAR`.
  Sem a conversão, a junção com `candidatura` não usa o índice e a consulta leva
  minutos em vez de segundos.

Limitação da fonte, não corrigível: o arquivo de candidatos de 2006 não traz o
resultado da eleição presidencial, e esses candidatos ficam sem situação final.

## Ideologia dos partidos: três medidas

O banco tem três medidas de ideologia por partido. Elas vêm de fontes diferentes,
usam escalas diferentes e respondem a perguntas diferentes, por isso ficam lado a
lado em vez de virar um número só.

| Medida | Onde fica | Escala | Variação no tempo | Origem |
|---|---|---|---|---|
| Especialistas | `ideologia_partido.nota` | 0 (esquerda) a 10 (direita) | edições 2018 e 2022 | survey de especialistas (Harvard Dataverse) |
| Coligações | `ideologia_coligacao.nota` | 0 a 10 | uma por eleição municipal, 2000 a 2024 | calculada pela carga a partir de `candidatura.coligacao` |
| Câmara | `partido.espectro_camara` | −100 (esquerda) a +100 (direita) | um valor só | votações nominais da Câmara, do painel da turma anterior |

### Especialistas

Cientistas políticos deram a cada partido uma nota de 0 a 10; a nota do partido é a
média delas (77 linhas na tabela: 39 de 2018 e 38 de 2022). É a medida de referência:
o índice e a classificação da pergunta 7 (Esquerda, Centro-esquerda, Centro,
Centro-direita e Direita) usam só ela. As colunas do survey (`ideol_18_mdb`,
`ideol_22_pt` etc.) são traduzidas para as siglas do TSE em `SIGLAS_SURVEY`, no
`carga.py`; PRD e Mobiliza, criados depois de 2022, recebem a média dos partidos que
os formaram.

### Coligações

É a posição revelada pelas alianças. O painel da Câmara reduz a matriz deputado ×
votação a um eixo; como os dados do TSE não têm votações nominais, a matriz aqui é
partido × partido, com o número de coligações para prefeito em que os dois
estiveram juntos.

- A etapa `ideologia_coligacao` da carga (`carga.py --etapas ideologia_coligacao`,
  2 segundos, requer numpy) monta a matriz de cada eleição municipal, com os
  partidos que participaram de pelo menos 50 coligações com outros partidos
  (coluna `coligacoes`).
- A posição é o segundo autovetor da matriz normalizada pelo grau (o primeiro é
  trivial), o mesmo princípio da análise de correspondência: partidos que se aliam
  entre si ficam próximos no eixo.
- O sinal do autovetor é arbitrário e é orientado pelas notas dos especialistas; a
  escala é convertida para a delas (mesma média e desvio padrão, limitada a 0–10).

A concordância com os especialistas (correlação de Spearman entre as ordens dos
partidos) fica entre −0,08 e 0,11 de 2000 a 2016 e sobe para 0,61 em 2020 e 0,75 em
2024. Até 2016 o eixo separa partidos grandes de pequenos, e não esquerda de direita.
Partidos federados (PT, PCdoB e PV; PSDB e Cidadania; PSOL e Rede) coligam sempre
juntos e recebem a mesma nota em 2024.

### Câmara

A coluna `partido.espectro_camara` guarda a posição média de cada partido no painel
[Análise da Câmara dos Deputados](https://dados-camara-dashboard-alpha.vercel.app/),
que reduz a matriz de 637 deputados × 1.549 votações nominais a um eixo (SVD de uma
dimensão, 25,4% da variância). Os valores vêm do arquivo de dados do painel e ficam
copiados em `fontes/espectro_camara.json`, com a data da cópia, para que a carga não
dependa do site. A etapa `espectro_camara` os grava nos 21 partidos atuais (com
candidatura de 2022 em diante); MISSÃO e os deputados sem partido não têm
correspondente no banco.

O eixo separa sobretudo quem vota com o governo de quem vota com a oposição. A ordem
dos partidos concorda só em parte com a dos especialistas (Spearman de 0,66): PSOL
(−37) e Rede (−5,8) ficam perto do centro, e União, Republicanos, MDB e PSD, do lado
esquerdo.

### A visão `vw_ideologia_partido`

Reúne as três medidas, com uma linha por partido e ano de eleição (1998 a 2024). É
por ela que as consultas leem a ideologia.

| Coluna | Como é preenchida |
|---|---|
| `nota_especialistas` | a edição do survey mais próxima do ano (de 2020 em diante, a de 2022) |
| `nota_herdada` | verdadeiro quando a nota veio do nome atual de um partido renomeado que manteve o número (PMDB → MDB, PFL → DEM, PPB → PP, PT do B → AVANTE etc.) |
| `nota_coligacoes` | a nota do próprio ano, nas eleições municipais; nos anos gerais, a média das duas municipais vizinhas |
| `espectro_camara` | o valor único do partido; nomes antigos de partidos que hoje estão na Câmara com o mesmo número (PMDB, PPB, PRB, PR, PPS, PTN, PT do B e SD) recebem o do nome atual |

Exemplos:

| Partido | Ano | Especialistas | Herdada | Coligações | Câmara |
|---|---|---:|:-:|---:|---:|
| PT | 2016 | 2,97 | não | 5,88 | −68,0 |
| PMDB | 2016 | 7,02 | sim (do MDB) | 5,01 | −29,5 |
| MDB | 2022 | 6,50 | não | 6,69 (média de 2020 e 2024) | −29,5 |
| PT | 2024 | 2,68 | não | 2,16 | −68,0 |
| PSOL | 2024 | 1,41 | não | 1,92 | −37,0 |
| PL | 2024 | 8,80 | não | 8,38 | +49,0 |

Em 2016 as coligações põem o PT perto do centro (5,88), porque o eixo ainda não media
ideologia; em 2024 as duas notas de 0 a 10 já estão próximas. A Câmara põe o MDB do
lado esquerdo.

### Onde cada medida entra

| Consulta | Uso |
|---|---|
| `sql/p07_vies_ideologico.sql` (pergunta 7) | `indice_ideologico` e `classificacao`: especialistas, média ponderada pelos votos; ao lado, `indice_camara` e `cobertura_camara_pct`, a parcela dos votos de partidos com posição na Câmara |
| `sql/p07b_ideologia_coligacoes.sql` | especialistas e coligações lado a lado por partido, a `concordancia` do ano e a posição na Câmara para comparação |
| `sql/p10c_trajetoria_ideologica.sql` (pergunta 10) | especialistas e Câmara do partido em cada candidatura do político, com o deslocamento a cada troca, a média e a amplitude da carreira; a nota das coligações fica de fora, porque antes de 2020 não mede ideologia |

### Cuidados de leitura

- As escalas não se somam nem se subtraem: a Câmara vai de −100 a +100 e as outras
  de 0 a 10. Para comparar medidas, use a ordem dos partidos (Spearman).
- Só a nota dos especialistas mede ideologia em todos os anos. A das coligações
  vale de 2020 em diante, e a da Câmara mistura ideologia e alinhamento com o
  governo; por isso o `indice_camara` é negativo nos seis estados, que os
  especialistas classificam como de direita.
- Um partido é o par (número, sigla). O PL de 2002 e o atual têm o mesmo par e,
  portanto, a mesma nota (8,80), embora fossem partidos diferentes.

## Dados complementares do Atlas (perguntas 4 e 6)

O crawler baixa `ipea_atlas/escolaridade_municipios.csv` e
`ipea_atlas/envelhecimento_municipios.csv`. Esses indicadores servem de verificação
externa, fora do modelo relacional, como a tabela 10061 do Censo; por isso a carga
não os grava no banco.
