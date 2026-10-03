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

## Ideologia pelas coligações e trajetória do político

Inspirado no cálculo ideológico da turma anterior, que reduzia a matriz deputado ×
votação a um eixo. Não há votações nominais nos dados do TSE, então a matriz aqui
é partido × partido, com o número de coligações para prefeito em que os dois
estiveram juntos. Nenhuma fonte nova: tudo sai de `candidatura.coligacao`.

- **Tabela `ideologia_coligacao`** (id_partido, ano, nota, coligacoes), gravada pela
  etapa `ideologia_coligacao` da carga (`carga.py --etapas ideologia_coligacao`,
  2 segundos, requer numpy). Em cada eleição municipal de 2000 a 2024, entram os
  partidos com pelo menos 50 coligações com outros partidos. A posição é o segundo
  autovetor da matriz de coligações normalizada pelo grau (o primeiro é trivial),
  o mesmo princípio da análise de correspondência. O sinal do autovetor é
  arbitrário e é orientado pelas notas dos especialistas, e a escala é convertida
  para a delas (mesma média e desvio padrão, limitada a 0–10).
- **Visão `vw_ideologia_partido`**: nota de cada partido em cada ano de eleição
  pelas duas réguas. Os partidos renomeados que mantiveram o número (PMDB, PFL,
  PPB, PRN, PSN, PSDC, PT do B, PTN e PEN) herdam a nota do nome atual, marcada em
  `nota_herdada`.
- **`sql/p07b_ideologia_coligacoes.sql`**: as duas notas lado a lado e a
  concordância do ano (correlação de Spearman entre as duas ordens).
- **`sql/p10c_trajetoria_ideologica.sql`**: nota do partido em cada candidatura do
  político, deslocamento em relação à anterior, média e amplitude da carreira.

Resultado: a concordância entre alianças e especialistas fica entre −0,08 e 0,11 de
2000 a 2016 e sobe para 0,61 em 2020 e 0,75 em 2024. Até 2016 o eixo das coligações
separa partidos grandes de pequenos, não esquerda de direita; por isso a
trajetória do político usa só a nota dos especialistas. Partidos federados (PT,
PCdoB e PV; PSDB e Cidadania; PSOL e Rede) coligam sempre juntos e recebem a mesma
nota em 2024.

## Dados complementares do Atlas (perguntas 4 e 6)

O crawler baixa `ipea_atlas/escolaridade_municipios.csv` e
`ipea_atlas/envelhecimento_municipios.csv`. Esses indicadores servem de verificação
externa, fora do modelo relacional, como a tabela 10061 do Censo; por isso a carga
não os grava no banco.
