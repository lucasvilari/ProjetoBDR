# Tutorial: baixar o banco e executar as consultas

O banco não fica no repositório: ele é publicado como arquivo `eleicoes.dump` na
página de **Releases** do GitHub. Com ele você monta o banco em menos de um minuto,
sem precisar do crawler nem dos 33 GB de CSV. O banco cobre seis estados: AP, MG, MS,
PB, RO e RR.

Os comandos são para Linux. No Windows, use o WSL (Ubuntu) e siga os mesmos passos.

## 1. Instalar o PostgreSQL e criar o seu usuário no banco

```bash
sudo apt install postgresql
```

```bash
sudo -u postgres createuser --createdb $USER
```

O segundo comando cria um papel (usuário do banco) com o seu nome de usuário do
sistema e permissão para criar bancos. É preciso o PostgreSQL 16 ou mais recente
(`psql --version` mostra a versão).

## 2. Baixar o dump

Pela página do repositório: **Releases** → release mais recente → clique em
`eleicoes.dump` e salve o arquivo na pasta do repositório clonado.

Ou pelo terminal, com o [GitHub CLI](https://cli.github.com/) já autenticado
(`gh auth login`):

```bash
gh release download -R lucasvilari/ProjetoBDR -p eleicoes.dump
```

## 3. Montar o banco

Na pasta do repositório:

```bash
scripts/restaura_dump.sh eleicoes.dump
```

O script confere a instalação antes de começar e, se faltar algo, mostra o comando
que resolve. Ao final existe um banco chamado `eleicoes`. Para conferir:

```bash
psql -d eleicoes -c "SELECT count(*) AS municipios FROM municipio"
```

O resultado deve ser 1238.

## 4. Executar as consultas

As consultas das dez perguntas ficam em `banco/sql/`, uma por arquivo. Os parâmetros
são passados com `-v nome=valor`:

```bash
psql -d eleicoes -v cod_tse=20516 -f banco/sql/p03a_indices_municipio.sql
```

| Arquivo | Pergunta | Parâmetros (exemplo) |
|---|---|---|
| `p01_custo_cadeira.sql` | 1. Custo de uma cadeira | nenhum |
| `p02_taxa_por_patrimonio.sql` | 2. Sucesso por patrimônio | `-v "cargo=DEPUTADO FEDERAL"` |
| `p03a_indices_municipio.sql` | 3. Índices do município | `-v cod_tse=20516` (João Pessoa) |
| `p03b_partidos_municipio.sql` | 3. Partidos mais vitoriosos | `-v cod_tse=20516` |
| `p03c_indices_por_partido.sql` | 3. Índices pelo partido do prefeito | `-v ano=2024` |
| `p04a_escolaridade_sucesso.sql` | 4. Escolaridade e eleição | nenhum |
| `p04b_escolaridade_municipio.sql` | 4. Escolaridade de eleitores e votados | `-v ano=2024 -v cargo=VEREADOR` |
| `p05_eleitos_legenda.sql` | 5. Eleitos por votos de legenda | `-v sigla=PT` |
| `p06a_alternancia.sql` | 6. Alternância de poder | nenhum |
| `p06b_jovem_vota_jovem.sql` | 6. Jovem vota no jovem? | `-v ano=2024 -v cargo=VEREADOR` |
| `p07_vies_ideologico.sql` | 7. Viés ideológico | `-v nivel=uf` (ou `regiao`, `municipio`) |
| `p07b_ideologia_coligacoes.sql` | 7. Ideologia pelas coligações | `-v ano=2024 -v sigla=` |
| `p08_dependencia_publica.sql` | 8. Dependência de recursos públicos | nenhum |
| `p09a_gasto_por_tipo.sql` | 9. Gasto por tipo de despesa | `-v ano=2024 -v sq_candidato=` |
| `p09b_nuvem_palavras.sql` | 9. Palavras das despesas | `-v ano=2024 -v sq_candidato=` |
| `p10a_linha_do_tempo.sql` | 10. Carreira de um político | `-v titulo=...` (ver abaixo) |
| `p10b_resumo_carreira.sql` | 10. Resumo da carreira | `-v titulo=...` |
| `p10c_trajetoria_ideologica.sql` | 10. Trajetória ideológica | `-v titulo=...` |

Um parâmetro vazio (como `-v sigla=`) significa "todos". O código de um município
está na tabela `municipio`:

```bash
psql -d eleicoes -c "SELECT cod_tse, nome, uf FROM municipio WHERE nome = 'Campo Grande'"
```

As consultas da pergunta 10 pedem o título eleitoral, que pode ser buscado pelo nome:

```bash
T=$(psql -d eleicoes -At -c "SELECT titulo_eleitoral FROM politico WHERE nome = 'RICARDO VIEIRA COUTINHO'")
```

```bash
psql -d eleicoes -v titulo=$T -f banco/sql/p10a_linha_do_tempo.sql
```

### Dicas

- Resultado longo abre um paginador: as setas rolam e **`q`** sai. Para desligá-lo,
  acrescente `-P pager=off`.
- Para salvar o resultado como planilha, acrescente `--csv` e redirecione:
  `psql -d eleicoes --csv -v sigla=PT -f banco/sql/p05_eleitos_legenda.sql > p05.csv`.
- Para explorar o banco com interface gráfica, use o
  [DBeaver](https://dbeaver.io/): nova conexão PostgreSQL com host `localhost`,
  banco `eleicoes` e o seu usuário.

## 5. Executar todas de uma vez (evidências)

O script abaixo roda as 18 consultas com parâmetros fixos e grava, em
`banco/evidencias/`, a sessão do psql, um print e o CSV de cada uma:

```bash
cd banco
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
./evidencias.sh
```

## Para quem mantém o repositório

Depois de refazer a carga, gere o dump novo e substitua o arquivo da Release:

```bash
scripts/gera_dump.sh
```

```bash
gh release upload dados-2026-10-02 eleicoes.dump --clobber
```

Na primeira publicação, crie a Release:
`gh release create dados-2026-10-02 eleicoes.dump --title "Banco: AP, MG, MS, PB, RO e RR"`.
