# Banco de dados do projeto

Redução do D.E.R. do dossiê (seção 3) a tabelas (seção 4) e carga dos arquivos
baixados pelo crawler (`../crawler/dados`) num PostgreSQL 16.

| Arquivo | O que faz |
|---|---|
| `01_tabelas.sql` | Cria as 16 tabelas da seção 4.4, com chaves, restrições e colunas geradas |
| `02_indices_visoes.sql` | Índices, visões (`vw_candidatura`, `vw_patrimonio`, `vw_qt_mandatos`) e `nivel_escolaridade()` |
| `carga.py` | Executa `01`, carrega os dados e executa `02` |
| `03_validacao.sql` | Confere a carga contra os totais dos arquivos do TSE |
| `sql/`, `evidencias.sh` | Consultas da seção 6 e geração das evidências da seção 6.11 |

## Como executar

```bash
python3 -m venv .venv && .venv/bin/pip install "psycopg[binary]>=3.2"
```

```bash
.venv/bin/python carga.py
```

A carga completa leva cerca de 45 minutos e recria tudo do zero. Uma etapa isolada
pode ser refeita com `--etapas` (por exemplo `--etapas despesa`). O banco padrão é
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

Regras da seção 4.3 aplicadas: leitura em latin-1 com `;`; `#NULO#`, `#NE`, `-1`,
`-3` e `-4` gravados como NULL; situação final do último turno; PIB × 1000;
população do Censo em 2022; `ST_REELEICAO` como booleano; partido com id próprio
por par (número, sigla).

## Resultado (carga de 25/09/2026)

| Tabela | Linhas | Tabela | Linhas |
|---|---:|---|---:|
| eleicao | 25 | municipio | 5.571 |
| vaga | 33.793 | idhm_municipio | 16.692 |
| politico | 2.054.818 | indicador_anual | 55.708 |
| partido | 76 | apuracao | 104.552 |
| ideologia_partido | 77 | perfil_comparecimento | 7.890.183 |
| candidatura | 3.336.441 | votos_cand | 19.748.670 |
| bem | 2.107.560 | votos_part | 1.294.128 |
| receita | 4.951.883 | despesa | 9.015.206 |

O banco ocupa 7.491 MB (7,3 GiB). Conferências de `03_validacao.sql`:

- eleitos coincidem com as vagas (513 deputados federais, 1.035 estaduais, 27
  governadores); as diferenças em prefeito e vereador são eleições anuladas e
  refeitas em suplementar;
- receitas e despesas somam de 99,3% a 100% do total dos CSVs; o restante é de
  candidaturas não carregadas (suplementares ou sem título);
- os aptos do perfil de comparecimento coincidem com os da apuração.

## Ajustes em relação ao dossiê

Os dados reais do TSE contradizem alguns pontos do modelo. Cada ajuste abaixo foi
o menor possível; só o 12 exigiu mudar uma consulta da seção 6 (a da pergunta 5).
Todos estão incorporados ao dossiê (seções 1, 2, 4 e 5).

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
8. **Só eleições ordinárias**, como diz o dicionário (5.1). Cada turno tem seu
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

## Consultas da seção 6 e evidências (6.11)

As 16 consultas do dossiê ficam em `sql/`. O script abaixo as executa com
parâmetros fixos e grava, em `evidencias/`, a sessão do psql (`.txt`), o print
(`.png`), o resultado completo (`.csv`) e o `quadro.csv` com linhas e tempo:

```bash
./evidencias.sh
```

A primeira execução revelou três problemas no SQL do dossiê, já corrigidos em
`sql/` e na seção 6:

- **6.1:** as vagas eram somadas por código de eleição, e 2020 tem duas eleições
  ordinárias (Macapá votou em data própria); agora são somadas por ano.
- **6.3.1:** o `CROSS JOIN eleicao` devolvia uma linha por código de eleição do
  ano (turnos e abrangências), 15 em vez de 4; agora só entram as eleições com
  apuração no município.
- **6.5:** usa os válidos oficiais e converte a UF para `VARCHAR`. Sem a
  conversão, a junção com `candidatura` não usava o índice e a consulta levava
  13,5 minutos; agora leva 3 segundos.

Limitação da fonte, não corrigível: o arquivo de candidatos de 2006 não traz o
resultado da eleição presidencial, e esses candidatos ficam sem situação final.

## Dados complementares do Atlas (perguntas 4 e 6)

O crawler baixa `ipea_atlas/escolaridade_municipios.csv` e
`ipea_atlas/envelhecimento_municipios.csv`. O dossiê usa esses indicadores como
verificação externa, fora do modelo relacional, como a tabela 10061 do Censo; por
isso a carga não os grava no banco.
