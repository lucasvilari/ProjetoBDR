#!/usr/bin/env python3
"""Carga dos arquivos do crawler no banco do projeto (dossiê, seção 4.3).

Cada arquivo é copiado sem transformação (COPY) para uma tabela de preparo no
esquema stg, com todas as colunas como texto. A limpeza, a consolidação e a
gravação no modelo relacional são feitas em SQL a partir dessas tabelas. Os
arquivos grandes são preparados um ano por vez e descartados logo depois.

Cada etapa registra em carga.log quantas linhas leu, gravou e descartou.

Uso:
    python carga.py                      # carga completa, recriando as tabelas
    python carga.py --etapas despesa     # refaz só uma etapa
    DATABASE_URL="dbname=eleicoes" python carga.py
"""
import argparse
import csv
import os
import re
import sys
import time
import unicodedata
from collections import Counter, defaultdict
from itertools import combinations
from pathlib import Path

import psycopg

RAIZ = Path(__file__).resolve().parent
DADOS = RAIZ.parent / 'crawler' / 'dados'
TSE = DADOS / 'tse'
DSN = os.environ.get('DATABASE_URL', 'dbname=eleicoes')

ANOS_EP = (2018, 2020, 2022, 2024)
ANOS_CAND = tuple(range(1994, 2025, 2))
ELEITO = "('ELEITO', 'ELEITO POR QP', 'ELEITO POR MÉDIA')"


# --------------------------------------------------------------------------- utilidades

def log(msg):
    print(time.strftime('%H:%M:%S'), msg, flush=True)


def nome_coluna(cabecalho):
    s = unicodedata.normalize('NFKD', cabecalho).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '_', s).strip('_') or 'col'


def colunas_do_arquivo(arquivo, encoding):
    with open(arquivo, encoding='utf-8-sig' if encoding == 'UTF8' else 'latin-1', newline='') as fh:
        cab = next(csv.reader(fh, delimiter=';'))
    nomes, vistos = [], defaultdict(int)
    for c in cab:
        n = nome_coluna(c)
        vistos[n] += 1
        nomes.append(n if vistos[n] == 1 else f'{n}_{vistos[n]}')
    return nomes


class Carga:
    def __init__(self, conn):
        self.conn = conn

    def sql(self, texto, params=None, etapa=None, detalhe=None):
        t0 = time.time()
        with self.conn.cursor() as cur:
            cur.execute(texto, params)
            linhas = cur.rowcount
            resultado = cur.fetchall() if cur.description else None
        if etapa:
            self.registra(etapa, detalhe, linhas, time.time() - t0)
        return resultado if resultado is not None else linhas

    def um(self, texto, params=None):
        with self.conn.cursor() as cur:
            cur.execute(texto, params)
            return cur.fetchone()

    def registra(self, etapa, detalhe, linhas, segundos=0):
        self.sql('INSERT INTO carga.log (etapa, detalhe, linhas, segundos) VALUES (%s, %s, %s, %s)',
                 (etapa, detalhe, linhas, round(segundos, 1)))
        log(f'  {etapa:<22} {detalhe or "":<58} {linhas:>12,} linhas  {segundos:6.1f}s')

    def prepara(self, tabela, arquivo, encoding='LATIN1'):
        """Copia um CSV inteiro para stg.<tabela>, todas as colunas como texto."""
        t0 = time.time()
        cols = colunas_do_arquivo(arquivo, encoding)
        self.sql(f'DROP TABLE IF EXISTS stg.{tabela}')
        self.sql(f'CREATE UNLOGGED TABLE stg.{tabela} ({", ".join(f"{c} text" for c in cols)})')
        opcoes = f"FORMAT csv, HEADER true, DELIMITER ';', ENCODING '{encoding}'"
        with self.conn.cursor() as cur:
            with cur.copy(f'COPY stg.{tabela} FROM STDIN WITH ({opcoes})') as cp:
                with open(arquivo, 'rb') as fh:
                    if encoding == 'UTF8' and fh.read(3) != b'\xef\xbb\xbf':
                        fh.seek(0)
                    while bloco := fh.read(1 << 20):
                        cp.write(bloco)
        n = self.um(f'SELECT count(*) FROM stg.{tabela}')[0]
        self.registra('preparo', f'{arquivo.relative_to(DADOS)}', n, time.time() - t0)
        return set(cols)

    def unifica(self, destino, arquivos, mapa):
        """Prepara vários arquivos de layouts diferentes numa só tabela stg,
        com as colunas de `mapa` (destino -> coluna de origem; ausente vira NULL)."""
        self.sql(f'DROP TABLE IF EXISTS stg.{destino}')
        self.sql(f'CREATE UNLOGGED TABLE stg.{destino} ({", ".join(f"{c} text" for c in mapa)})')
        for arquivo in arquivos:
            cols = self.prepara('bruto', arquivo)
            sel = ', '.join(o if o in cols else 'NULL' for o in mapa.values())
            self.sql(f'INSERT INTO stg.{destino} ({", ".join(mapa)}) SELECT {sel} FROM stg.bruto')
        self.sql('DROP TABLE IF EXISTS stg.bruto')


# --------------------------------------------------------------------------- funções de limpeza

FUNCOES_STG = r"""
CREATE SCHEMA IF NOT EXISTS stg;
CREATE SCHEMA IF NOT EXISTS carga;
CREATE TABLE IF NOT EXISTS carga.log (
    id        SERIAL PRIMARY KEY,
    quando    TIMESTAMPTZ NOT NULL DEFAULT now(),
    etapa     TEXT NOT NULL,
    detalhe   TEXT,
    linhas    BIGINT,
    segundos  NUMERIC(10,1)
);

-- Seção 4.3: #NULO#, #NE, -1, -3 e -4 são dado ausente ou mascarado.
CREATE OR REPLACE FUNCTION stg.nulo(t TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT CASE WHEN btrim(t) IN ('', '#NULO#', '#NULO', '#NE#', '#NE', '-1', '-3', '-4')
                THEN NULL ELSE btrim(t) END
$$;

-- Números do TSE usam vírgula decimal; os do SIDRA, ponto.
CREATE OR REPLACE FUNCTION stg.num(t TEXT) RETURNS NUMERIC
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT CASE WHEN x ~ '^-?[0-9]+(\.[0-9]+)?$' THEN x::NUMERIC END
    FROM (SELECT CASE WHEN v LIKE '%,%' THEN replace(replace(v, '.', ''), ',', '.') ELSE v END AS x
          FROM (SELECT stg.nulo(t) AS v) a) b
$$;

CREATE OR REPLACE FUNCTION stg.int(t TEXT) RETURNS BIGINT
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT CASE WHEN v ~ '^-?[0-9]{1,18}$' THEN v::BIGINT END FROM (SELECT stg.nulo(t) AS v) a
$$;

-- Código TSE do município com 5 dígitos: os arquivos de votação omitem o zero à esquerda.
CREATE OR REPLACE FUNCTION stg.mun(t TEXT) RETURNS VARCHAR(5)
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT CASE WHEN btrim(t) ~ '^[0-9]{1,5}$' THEN lpad(btrim(t), 5, '0') END
$$;

-- Sem PARALLEL SAFE: o bloco EXCEPTION (datas como 31/02) abre subtransação.
CREATE OR REPLACE FUNCTION stg.data(t TEXT) RETURNS DATE
LANGUAGE plpgsql IMMUTABLE PARALLEL UNSAFE AS $$
BEGIN
    IF t ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' THEN
        RETURN to_date(t, 'DD/MM/YYYY');
    END IF;
    RETURN NULL;
EXCEPTION WHEN others THEN
    RETURN NULL;
END
$$;

-- As vagas escrevem "1. Suplente"; os candidatos, "1º SUPLENTE".
CREATE OR REPLACE FUNCTION stg.cargo(t TEXT) RETURNS VARCHAR(40)
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT CASE upper(btrim(t))
        WHEN '1. SUPLENTE' THEN '1º SUPLENTE'
        WHEN '2. SUPLENTE' THEN '2º SUPLENTE'
        ELSE upper(stg.nulo(t))
    END
$$;

-- Os oito graus reconhecidos por nivel_escolaridade(); rótulos antigos são convertidos.
CREATE OR REPLACE FUNCTION stg.escolaridade(t TEXT) RETURNS VARCHAR(40)
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT CASE upper(btrim(t))
        WHEN 'ANALFABETO'                    THEN 'ANALFABETO'
        WHEN 'LÊ E ESCREVE'                  THEN 'LÊ E ESCREVE'
        WHEN 'ENSINO FUNDAMENTAL INCOMPLETO' THEN 'ENSINO FUNDAMENTAL INCOMPLETO'
        WHEN 'FUNDAMENTAL INCOMPLETO'        THEN 'ENSINO FUNDAMENTAL INCOMPLETO'
        WHEN '1º GRAU INCOMPLETO'            THEN 'ENSINO FUNDAMENTAL INCOMPLETO'
        WHEN 'ENSINO FUNDAMENTAL COMPLETO'   THEN 'ENSINO FUNDAMENTAL COMPLETO'
        WHEN 'FUNDAMENTAL COMPLETO'          THEN 'ENSINO FUNDAMENTAL COMPLETO'
        WHEN '1º GRAU COMPLETO'              THEN 'ENSINO FUNDAMENTAL COMPLETO'
        WHEN 'ENSINO MÉDIO INCOMPLETO'       THEN 'ENSINO MÉDIO INCOMPLETO'
        WHEN 'MÉDIO INCOMPLETO'              THEN 'ENSINO MÉDIO INCOMPLETO'
        WHEN '2º GRAU INCOMPLETO'            THEN 'ENSINO MÉDIO INCOMPLETO'
        WHEN 'ENSINO MÉDIO COMPLETO'         THEN 'ENSINO MÉDIO COMPLETO'
        WHEN 'MÉDIO COMPLETO'                THEN 'ENSINO MÉDIO COMPLETO'
        WHEN '2º GRAU COMPLETO'              THEN 'ENSINO MÉDIO COMPLETO'
        WHEN 'SUPERIOR INCOMPLETO'           THEN 'SUPERIOR INCOMPLETO'
        WHEN 'SUPERIOR COMPLETO'             THEN 'SUPERIOR COMPLETO'
    END
$$;

-- "Eleição Ordinária" ou "ORDINÁRIA"; "Extraordinária" e "Suplementar" ficam de fora.
CREATE OR REPLACE FUNCTION stg.ordinaria(t TEXT) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT COALESCE(t ~* 'ordin' AND t !~* 'extra', FALSE)
$$;

-- Candidatos escrevem MUNICIPAL/ESTADUAL/FEDERAL; os arquivos de votação, M/E/F.
CREATE OR REPLACE FUNCTION stg.abrangencia(t TEXT) RETURNS VARCHAR(10)
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT CASE WHEN upper(left(btrim(t), 1)) = 'M' THEN 'MUNICIPAL' ELSE 'GERAL' END
$$;

-- "MÉDIA" é o rótulo antigo de "ELEITO POR MÉDIA".
CREATE OR REPLACE FUNCTION stg.situacao(t TEXT) RETURNS VARCHAR(50)
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT CASE upper(btrim(t)) WHEN 'MÉDIA' THEN 'ELEITO POR MÉDIA' ELSE upper(stg.nulo(t)) END
$$;
"""


# --------------------------------------------------------------------------- etapas

def etapa_esquema(c):
    """Recria o modelo do dossiê do zero."""
    log('== esquema')
    c.sql("""DROP TABLE IF EXISTS votos_part, votos_cand, perfil_comparecimento, apuracao,
             indicador_anual, idhm_municipio, municipio, despesa, receita, bem, candidatura,
             ideologia_coligacao, ideologia_partido, partido, politico, vaga, eleicao CASCADE""")
    c.sql('DROP FUNCTION IF EXISTS nivel_escolaridade(VARCHAR)')
    c.sql('DROP SCHEMA IF EXISTS stg CASCADE')
    c.sql('DROP SCHEMA IF EXISTS carga CASCADE')
    c.sql(FUNCOES_STG)
    c.sql((RAIZ / '01_tabelas.sql').read_text())
    c.registra('esquema', '01_tabelas.sql aplicado', 17)


def etapa_territorio(c):
    log('== território')
    c.sql('TRUNCATE municipio CASCADE')
    c.prepara('mun_tse_ibge', TSE / 'municipio_tse_ibge' / 'municipio_tse_ibge.csv')
    c.prepara('ibge_mun', DADOS / 'ibge' / 'territorio' / 'municipios.csv', 'UTF8')
    c.prepara('censo9515', DADOS / 'ibge' / 'censo2022' / 'idade_mediana_envelhecimento_tabela9515.csv', 'UTF8')
    c.sql("""
        INSERT INTO municipio (cod_tse, cod_ibge, nome, uf, regiao, idade_mediana, indice_envelhecimento)
        SELECT stg.mun(t.cd_municipio_tse),
               btrim(t.cd_municipio_ibge),
               COALESCE(i.municipio, initcap(t.nm_municipio_tse)),
               upper(btrim(t.sg_uf)),
               CASE left(btrim(t.cd_municipio_ibge), 1)
                   WHEN '1' THEN 'Norte'   WHEN '2' THEN 'Nordeste' WHEN '3' THEN 'Sudeste'
                   WHEN '4' THEN 'Sul'     WHEN '5' THEN 'Centro-Oeste' END,
               c.idade_mediana,
               c.indice_envelhecimento
        FROM stg.mun_tse_ibge t
        LEFT JOIN stg.ibge_mun i ON i.cod_ibge = btrim(t.cd_municipio_ibge)
        LEFT JOIN (SELECT municipio_codigo,
                          max(stg.num(valor)) FILTER (WHERE variavel_codigo = '10613') AS idade_mediana,
                          max(stg.num(valor)) FILTER (WHERE variavel_codigo = '10612') AS indice_envelhecimento
                   FROM stg.censo9515 GROUP BY municipio_codigo) c
               ON c.municipio_codigo = btrim(t.cd_municipio_ibge)
        WHERE stg.mun(t.cd_municipio_tse) IS NOT NULL AND btrim(t.cd_municipio_ibge) ~ '^[0-9]{7}$'
    """, etapa='municipio', detalhe='municipio_tse_ibge + IBGE Localidades + SIDRA 9515')

    c.prepara('idhm', DADOS / 'ipea_atlas' / 'idhm_municipios.csv', 'UTF8')
    c.sql("""
        INSERT INTO idhm_municipio (cod_tse, ano, idhm)
        SELECT m.cod_tse, stg.int(i.ano), round(stg.num(i.idhm), 3)
        FROM stg.idhm i JOIN municipio m ON m.cod_ibge = btrim(i.cod_ibge)
        WHERE stg.num(i.idhm) IS NOT NULL
    """, etapa='idhm_municipio', detalhe='Ipeadata ADH_IDHM (1991, 2000, 2010)')

    c.prepara('pib', DADOS / 'ibge' / 'pib' / 'pib_municipios_tabela5938.csv', 'UTF8')
    c.prepara('pop_est', DADOS / 'ibge' / 'populacao' / 'estimativas_populacao_tabela6579.csv', 'UTF8')
    c.prepara('pop_censo', DADOS / 'ibge' / 'populacao' / 'censo2022_populacao_tabela4709.csv', 'UTF8')
    c.sql("""
        WITH pib AS (SELECT municipio_codigo AS cod, stg.int(ano) AS ano, stg.num(valor) * 1000 AS pib
                     FROM stg.pib WHERE variavel_codigo = '37'),
             pop AS (SELECT municipio_codigo AS cod, stg.int(ano) AS ano, stg.int(valor) AS pop
                     FROM stg.pop_est WHERE variavel_codigo = '9324' AND stg.int(ano) <> 2022
                     UNION ALL
                     SELECT municipio_codigo, 2022, stg.int(valor)
                     FROM stg.pop_censo WHERE variavel_codigo = '93'),
             anos AS (SELECT cod, ano FROM pib UNION SELECT cod, ano FROM pop)
        INSERT INTO indicador_anual (cod_tse, ano, pib, populacao)
        SELECT m.cod_tse, a.ano, p.pib, q.pop
        FROM anos a
        JOIN municipio m ON m.cod_ibge = a.cod
        LEFT JOIN pib p ON p.cod = a.cod AND p.ano = a.ano
        LEFT JOIN pop q ON q.cod = a.cod AND q.ano = a.ano
    """, etapa='indicador_anual', detalhe='SIDRA 5938 (PIB x 1000), 6579 e 4709 (Censo em 2022)')
    for t in ('mun_tse_ibge', 'ibge_mun', 'censo9515', 'idhm', 'pib', 'pop_est', 'pop_censo'):
        c.sql(f'DROP TABLE stg.{t}')


MAPA_CAND = {
    'ano': 'ano_eleicao', 'nr_turno': 'nr_turno', 'cd_eleicao': 'cd_eleicao',
    'nm_tipo_eleicao': 'nm_tipo_eleicao', 'tp_abrangencia': 'tp_abrangencia', 'sg_ue': 'sg_ue',
    'ds_cargo': 'ds_cargo', 'sq_candidato': 'sq_candidato', 'nm_candidato': 'nm_candidato',
    'nr_cpf': 'nr_cpf_candidato', 'nr_titulo': 'nr_titulo_eleitoral_candidato',
    'dt_nascimento': 'dt_nascimento', 'ds_genero': 'ds_genero', 'ds_grau_instrucao': 'ds_grau_instrucao',
    'nr_partido': 'nr_partido', 'sg_partido': 'sg_partido', 'nm_partido': 'nm_partido',
    'ds_coligacao': 'ds_composicao_coligacao', 'ds_federacao': 'ds_composicao_federacao',
    'nr_idade_posse': 'nr_idade_data_posse', 'st_reeleicao': 'st_reeleicao',
    'ds_sit_tot_turno': 'ds_sit_tot_turno',
}
MAPA_VAGAS = {c: c for c in ('ano_eleicao', 'cd_eleicao', 'nm_tipo_eleicao', 'sg_ue', 'ds_cargo', 'qt_vaga')}
MAPA_DETALHE = {c: c for c in ('ano_eleicao', 'nr_turno', 'cd_eleicao', 'nm_tipo_eleicao', 'tp_abrangencia',
                               'sg_uf', 'cd_municipio', 'nr_zona', 'ds_cargo', 'qt_aptos', 'qt_abstencoes',
                               'qt_votos_brancos', 'qt_total_votos_nulos', 'qt_total_votos_validos')}
MAPA_VPART = {c: c for c in ('ano_eleicao', 'nr_turno', 'cd_eleicao', 'nm_tipo_eleicao', 'tp_abrangencia',
                             'sg_uf', 'cd_municipio', 'nr_zona', 'ds_cargo', 'nr_partido', 'sg_partido',
                             'nm_partido', 'qt_votos_nominais_validos', 'qt_votos_legenda_validos')}


def etapa_preparo(c):
    """Arquivos pequenos e médios que definem eleições, partidos e candidaturas."""
    log('== preparo dos arquivos-base')
    c.unifica('cand', [TSE / 'candidatos' / str(a) / f'consulta_cand_{a}_BRASIL.csv' for a in ANOS_CAND], MAPA_CAND)
    c.unifica('vagas', [TSE / 'vagas' / str(a) / f'consulta_vagas_{a}_BRASIL.csv' for a in ANOS_EP], MAPA_VAGAS)
    c.unifica('detalhe', [TSE / 'detalhe_votacao_munzona' / str(a) / f'detalhe_votacao_munzona_{a}_BRASIL.csv'
                          for a in ANOS_EP], MAPA_DETALHE)
    c.unifica('vpart', [TSE / 'votacao_partido_munzona' / str(a) / f'votacao_partido_munzona_{a}_BRASIL.csv'
                        for a in ANOS_EP], MAPA_VPART)


def etapa_nucleo(c):
    log('== núcleo eleitoral')
    c.sql('TRUNCATE eleicao, partido, politico CASCADE')

    # 1. Uma linha limpa por linha do arquivo de candidatos.
    c.sql('DROP TABLE IF EXISTS stg.cand_ok')
    c.sql("""
        CREATE UNLOGGED TABLE stg.cand_ok AS
        SELECT stg.int(ano)::SMALLINT                                      AS ano,
               stg.int(nr_turno)::SMALLINT                                 AS turno,
               stg.int(cd_eleicao)::INTEGER                                AS cod_eleicao,
               stg.ordinaria(nm_tipo_eleicao)                              AS ordinaria,
               stg.abrangencia(tp_abrangencia)                             AS abrangencia,
               CASE WHEN btrim(sg_ue) ~ '^[0-9]{1,5}$' THEN lpad(btrim(sg_ue), 5, '0')
                    ELSE upper(stg.nulo(sg_ue)) END                        AS ue,
               stg.cargo(ds_cargo)                                         AS cargo,
               stg.int(sq_candidato)                                       AS sq_tse,
               CASE WHEN btrim(nr_titulo) ~ '^[0-9]{5,12}$' THEN lpad(btrim(nr_titulo), 12, '0') END AS titulo,
               left(stg.nulo(nm_candidato), 120)                           AS nome,
               CASE WHEN btrim(nr_cpf) ~ '^[0-9]{1,11}$' THEN lpad(btrim(nr_cpf), 11, '0') END AS cpf,
               stg.data(dt_nascimento)                                     AS data_nasc,
               CASE WHEN upper(btrim(ds_genero)) IN ('MASCULINO', 'FEMININO')
                    THEN upper(btrim(ds_genero)) END                       AS genero,
               stg.escolaridade(ds_grau_instrucao)                         AS escolaridade,
               stg.int(nr_partido)::SMALLINT                               AS numero,
               upper(stg.nulo(sg_partido))                                 AS sigla,
               stg.nulo(nm_partido)                                        AS nome_partido,
               left(COALESCE(stg.nulo(ds_coligacao), stg.nulo(ds_federacao)), 250) AS coligacao,
               CASE WHEN stg.int(nr_idade_posse) BETWEEN 18 AND 120
                    THEN stg.int(nr_idade_posse)::SMALLINT END             AS idade_arquivo,
               CASE upper(btrim(st_reeleicao)) WHEN 'S' THEN TRUE WHEN 'N' THEN FALSE END AS reeleicao_arquivo,
               stg.situacao(ds_sit_tot_turno)                              AS situacao
        FROM stg.cand
    """)
    for motivo, cond in [
        ('eleição suplementar', 'NOT ordinaria'),
        ('1994 e 1996: TSE não publica título eleitoral', 'ordinaria AND ano < 1998'),
        ('sem título eleitoral válido', 'ordinaria AND ano >= 1998 AND titulo IS NULL'),
        ('sem partido', 'ordinaria AND ano >= 1998 AND titulo IS NOT NULL AND (numero IS NULL OR sigla IS NULL)'),
    ]:
        for ano, n in c.sql(f'SELECT ano, count(*) FROM stg.cand_ok WHERE {cond} GROUP BY ano ORDER BY ano'):
            c.registra('candidatura descarte', f'{ano}: {motivo}', n)

    # 2. Uma linha por candidatura. A partir de 2018 a candidatura é o SQ_CANDIDATO do TSE;
    #    antes, (ano, UE, cargo, título), porque o SQ não é confiável. Situação final vem
    #    do último turno; demais atributos, do primeiro.
    c.sql('DROP TABLE IF EXISTS stg.cand_final')
    c.sql(f"""
        CREATE UNLOGGED TABLE stg.cand_final AS
        WITH ok AS (
            SELECT *,
                   CASE WHEN ano >= 2018 THEN sq_tse::TEXT
                        ELSE concat_ws('|', ano, ue, cargo, titulo) END  AS chave,
                   COALESCE(situacao IN {ELEITO}, FALSE)                  AS venceu
            FROM stg.cand_ok
            WHERE ordinaria AND ano >= 1998 AND titulo IS NOT NULL AND numero IS NOT NULL
              AND sigla IS NOT NULL AND cargo IS NOT NULL AND ue IS NOT NULL AND cod_eleicao IS NOT NULL
              AND (ano < 2018 OR sq_tse IS NOT NULL)
        ),
        base AS (SELECT DISTINCT ON (chave) * FROM ok
                 ORDER BY chave, turno, venceu DESC, (situacao IS NOT NULL) DESC, sq_tse DESC NULLS LAST),
        fim  AS (SELECT DISTINCT ON (chave) chave, situacao FROM ok
                 ORDER BY chave, turno DESC, venceu DESC, (situacao IS NOT NULL) DESC, sq_tse DESC NULLS LAST)
        SELECT b.ano, b.cod_eleicao, b.abrangencia, b.ue, b.cargo, b.titulo, b.nome, b.cpf,
               CASE WHEN date_part('year', b.data_nasc) BETWEEN 1900 AND b.ano - 16 THEN b.data_nasc END AS data_nasc,
               b.genero, b.escolaridade, b.numero, b.sigla, b.nome_partido, b.coligacao,
               b.idade_arquivo, b.reeleicao_arquivo, f.situacao AS situacao_final, b.sq_tse,
               CASE WHEN b.ano >= 2018 THEN b.sq_tse
                    ELSE -(b.ano::BIGINT * 10000000 + row_number() OVER (PARTITION BY b.ano ORDER BY b.chave))
               END AS sq_candidato
        FROM base b JOIN fim f USING (chave)
    """)
    # Idade na posse: do arquivo quando existe; senão, calculada da data de nascimento
    # (posse em 1º de janeiro, ou 1º de fevereiro para deputados e senadores).
    c.sql("""
        ALTER TABLE stg.cand_final ADD idade_posse SMALLINT, ADD reeleicao_derivada BOOLEAN;
        UPDATE stg.cand_final SET idade_posse = COALESCE(idade_arquivo, CASE WHEN data_nasc IS NOT NULL THEN
            date_part('year', age(make_date(ano + 1,
                CASE WHEN cargo ~ '^(DEPUTADO|SENADOR|1º SUPLENTE|2º SUPLENTE)' THEN 2 ELSE 1 END, 1), data_nasc))
            END);
        UPDATE stg.cand_final SET idade_posse = NULL WHERE idade_posse NOT BETWEEN 18 AND 120;
        CREATE INDEX ON stg.cand_final (titulo, cargo, ue, ano);
    """)
    # Reeleição: ST_REELEICAO = 'S' ou eleito para o mesmo cargo e unidade eleitoral na
    # eleição anterior (8 anos antes para senador). O campo do TSE falta de 2018 em diante e,
    # em 2004 e 2008, só marca prefeitos; a regra derivada dá a mesma cobertura a todos os anos.
    c.sql(f"""
        UPDATE stg.cand_final c SET reeleicao_derivada = EXISTS (
            SELECT 1 FROM stg.cand_final p
            WHERE p.titulo = c.titulo AND p.cargo = c.cargo AND p.ue = c.ue
              AND p.ano = c.ano - CASE WHEN c.cargo = 'SENADOR' THEN 8 ELSE 4 END
              AND p.situacao_final IN {ELEITO})
    """)
    for ano, arq, der, n in c.sql("""
            SELECT ano, reeleicao_arquivo, reeleicao_derivada, count(*) FROM stg.cand_final
            WHERE reeleicao_arquivo IS NOT NULL GROUP BY 1, 2, 3 ORDER BY 1, 2, 3"""):
        c.registra('reeleicao validação', f'{ano}: arquivo={arq} derivada={der}', n)

    c.sql("""
        INSERT INTO eleicao (cod_eleicao, ano, abrangencia)
        SELECT cod, min(ano), CASE WHEN bool_or(abr = 'MUNICIPAL') THEN 'MUNICIPAL' ELSE 'GERAL' END
        FROM (SELECT cod_eleicao AS cod, ano, abrangencia AS abr FROM stg.cand_final
              UNION ALL
              SELECT stg.int(cd_eleicao), stg.int(ano_eleicao),
                     stg.abrangencia(tp_abrangencia)
              FROM stg.detalhe WHERE stg.ordinaria(nm_tipo_eleicao)
              UNION ALL
              SELECT stg.int(cd_eleicao), stg.int(ano_eleicao),
                     stg.abrangencia(tp_abrangencia)
              FROM stg.vpart WHERE stg.ordinaria(nm_tipo_eleicao)
              UNION ALL
              SELECT stg.int(cd_eleicao), stg.int(ano_eleicao),
                     CASE WHEN btrim(sg_ue) ~ '^[0-9]+$' THEN 'MUNICIPAL' ELSE 'GERAL' END
              FROM stg.vagas WHERE stg.ordinaria(nm_tipo_eleicao)) x
        WHERE cod IS NOT NULL
        GROUP BY cod
    """, etapa='eleicao', detalhe='eleições ordinárias, um código por turno')

    c.sql("""
        INSERT INTO partido (id_partido, numero, sigla, nome)
        SELECT row_number() OVER (ORDER BY numero, sigla), numero, sigla, COALESCE(nome, sigla)
        FROM (SELECT numero, sigla, (array_agg(nome ORDER BY ano DESC) FILTER (WHERE nome IS NOT NULL))[1] AS nome
              FROM (SELECT numero, sigla, nome_partido AS nome, ano FROM stg.cand_final
                    UNION ALL
                    SELECT stg.int(nr_partido), upper(stg.nulo(sg_partido)), stg.nulo(nm_partido), stg.int(ano_eleicao)
                    FROM stg.vpart WHERE stg.ordinaria(nm_tipo_eleicao)) x
              WHERE numero IS NOT NULL AND sigla IS NOT NULL
              GROUP BY numero, sigla) p
    """, etapa='partido', detalhe='um id por par (número, sigla)')

    c.sql("""
        INSERT INTO politico (titulo_eleitoral, cpf, nome, data_nasc, genero)
        SELECT titulo,
               (array_agg(cpf       ORDER BY ano DESC) FILTER (WHERE cpf       IS NOT NULL))[1],
               COALESCE((array_agg(nome ORDER BY ano DESC) FILTER (WHERE nome IS NOT NULL))[1], 'NÃO INFORMADO'),
               (array_agg(data_nasc ORDER BY ano DESC) FILTER (WHERE data_nasc IS NOT NULL))[1],
               (array_agg(genero    ORDER BY ano DESC) FILTER (WHERE genero    IS NOT NULL))[1]
        FROM stg.cand_final GROUP BY titulo
    """, etapa='politico', detalhe='dados da candidatura mais recente com o campo preenchido')

    c.sql("""
        INSERT INTO candidatura (sq_candidato, titulo_eleitoral, cod_eleicao, id_partido, ue, cargo,
                                 coligacao, escolaridade, idade_posse, reeleicao, situacao_final)
        SELECT f.sq_candidato, f.titulo, f.cod_eleicao, p.id_partido, f.ue, f.cargo, f.coligacao,
               f.escolaridade, f.idade_posse, COALESCE(f.reeleicao_arquivo, FALSE) OR COALESCE(f.reeleicao_derivada, FALSE),
               f.situacao_final
        FROM stg.cand_final f
        JOIN partido p ON p.numero = f.numero AND p.sigla = f.sigla
    """, etapa='candidatura', detalhe='1998-2024, turnos consolidados')

    c.sql("""
        INSERT INTO vaga (cod_eleicao, ue, cargo, qt_vagas)
        SELECT stg.int(cd_eleicao), CASE WHEN btrim(sg_ue) ~ '^[0-9]{1,5}$' THEN lpad(btrim(sg_ue), 5, '0')
                                         ELSE upper(btrim(sg_ue)) END,
               stg.cargo(ds_cargo), max(stg.int(qt_vaga))
        FROM stg.vagas
        WHERE stg.ordinaria(nm_tipo_eleicao) AND stg.int(qt_vaga) > 0
          AND stg.int(cd_eleicao) IN (SELECT cod_eleicao FROM eleicao)
        GROUP BY 1, 2, 3
    """, etapa='vaga', detalhe='eleições ordinárias 2018-2024')
    etapa_ideologia(c)


# Colunas ideol_AA_<slug> do survey -> siglas do TSE (já em maiúsculas).
SIGLAS_SURVEY = {
    'mdb': ['MDB'], 'ptb': ['PTB'], 'pdt': ['PDT'], 'pt': ['PT'], 'dem': ['DEM'],
    'p_cdo_b': ['PC DO B', 'PCDOB'], 'psb': ['PSB'], 'psdb': ['PSDB'], 'ptc': ['PTC'], 'psc': ['PSC'],
    'pmn': ['PMN'], 'prp': ['PRP'], 'pps': ['PPS'], 'pv': ['PV'], 'avante': ['AVANTE'],
    'progressistas': ['PP'], 'progre': ['PP'], 'pstu': ['PSTU'], 'pcb': ['PCB'], 'prtb': ['PRTB'],
    'phs': ['PHS'], 'dc': ['DC'], 'pco': ['PCO'], 'pode': ['PODE'], 'podemos': ['PODE'],
    'psl': ['PSL'], 'prb': ['PRB'], 'psol': ['PSOL'], 'pr': ['PR'], 'psd': ['PSD'], 'ppl': ['PPL'],
    'patri': ['PATRI', 'PATRIOTA'], 'pros': ['PROS'], 'sdd': ['SOLIDARIEDADE', 'SD'], 'novo': ['NOVO'],
    'rede': ['REDE'], 'pmb': ['PMB'], 'uniao': ['UNIÃO', 'UNIAO'], 'agir': ['AGIR'], 'cdd': ['CIDADANIA'],
    'rep': ['REPUBLICANOS'], 'pl': ['PL'], 'up': ['UP'],
}
# Partidos criados ou renomeados depois do survey de 2022 (seção 2.7): média dos antecessores.
MANUAL_2022 = {'PRD': ['ptb', 'patri'], 'MOBILIZA': ['pmn']}


def etapa_ideologia(c):
    c.sql('TRUNCATE ideologia_partido')
    notas = defaultdict(list)
    with open(DADOS / 'ideologia_partidos' / 'df_experts.csv', encoding='utf-8-sig', newline='') as fh:
        for linha in csv.DictReader(fh, delimiter=';'):
            for col, v in linha.items():
                m = re.fullmatch(r'ideol_(18|22)_(\w+)', col or '')
                if m and v and v.strip():
                    notas[(2000 + int(m.group(1)), m.group(2))].append(float(v.replace(',', '.')))
    media = {k: sum(v) / len(v) for k, v in notas.items()}
    for slug in {s for _, s in media} - SIGLAS_SURVEY.keys():
        c.registra('ideologia aviso', f'coluna do survey sem sigla mapeada: {slug}', 0)

    partidos = c.sql('SELECT id_partido, sigla FROM partido')
    linhas = []
    for id_partido, sigla in partidos:
        for (ano, slug), nota in media.items():
            if sigla in SIGLAS_SURVEY.get(slug, []):
                linhas.append((id_partido, ano, round(nota, 2)))
        if sigla in MANUAL_2022:
            base = [media[(2022, s)] for s in MANUAL_2022[sigla] if (2022, s) in media]
            if base:
                linhas.append((id_partido, 2022, round(sum(base) / len(base), 2)))
    with c.conn.cursor() as cur:
        cur.executemany('INSERT INTO ideologia_partido (id_partido, ano_survey, nota) VALUES (%s, %s, %s)',
                        linhas)
    c.registra('ideologia_partido', 'média dos especialistas por partido e edição', len(linhas))


def etapa_apuracao(c):
    log('== apuração')
    c.sql('TRUNCATE apuracao')
    fora = c.um("""SELECT count(*) FILTER (WHERE sg_uf = 'ZZ'),
                          count(*) FILTER (WHERE NOT stg.ordinaria(nm_tipo_eleicao))
                   FROM stg.detalhe""")
    c.registra('apuracao descarte', 'votos no exterior (UF ZZ)', fora[0])
    c.registra('apuracao descarte', 'eleições suplementares', fora[1])
    c.sql("""
        INSERT INTO apuracao (cod_eleicao, cod_tse, zona, turno, cargo, aptos, abstencoes, brancos, nulos,
                              validos)
        SELECT stg.int(cd_eleicao), stg.mun(cd_municipio), stg.int(nr_zona), stg.int(nr_turno), stg.cargo(ds_cargo),
               sum(COALESCE(stg.int(qt_aptos), 0)), sum(COALESCE(stg.int(qt_abstencoes), 0)),
               sum(COALESCE(stg.int(qt_votos_brancos), 0)), sum(COALESCE(stg.int(qt_total_votos_nulos), 0)),
               sum(COALESCE(stg.int(qt_total_votos_validos), 0))
        FROM stg.detalhe
        WHERE stg.int(cd_eleicao) IN (SELECT cod_eleicao FROM eleicao)
          AND stg.mun(cd_municipio) IN (SELECT cod_tse FROM municipio)
        GROUP BY 1, 2, 3, 4, 5
    """, etapa='apuracao', detalhe='detalhe_votacao_munzona 2018-2024, somado o voto em trânsito')


def etapa_votos_part(c):
    log('== votos por partido')
    c.sql('TRUNCATE votos_part')
    fora = c.um("""SELECT count(*) FILTER (WHERE sg_uf = 'ZZ'),
                          count(*) FILTER (WHERE NOT stg.ordinaria(nm_tipo_eleicao))
                   FROM stg.vpart""")
    c.registra('votos_part descarte', 'votos no exterior (UF ZZ)', fora[0])
    c.registra('votos_part descarte', 'eleições suplementares', fora[1])
    c.sql("""
        INSERT INTO votos_part (cod_eleicao, id_partido, cod_tse, zona, turno, cargo, votos_nominais, votos_legenda)
        SELECT v.cod_eleicao, p.id_partido, v.cod_tse, v.zona, v.turno, v.cargo, sum(v.nom), sum(v.leg)
        FROM (SELECT stg.int(cd_eleicao)::INTEGER AS cod_eleicao, stg.int(nr_partido) AS numero,
                     upper(stg.nulo(sg_partido)) AS sigla, stg.mun(cd_municipio) AS cod_tse,
                     stg.int(nr_zona) AS zona, stg.int(nr_turno) AS turno, stg.cargo(ds_cargo) AS cargo,
                     COALESCE(stg.int(qt_votos_nominais_validos), 0) AS nom,
                     COALESCE(stg.int(qt_votos_legenda_validos), 0) AS leg
              FROM stg.vpart) v
        JOIN partido p ON p.numero = v.numero AND p.sigla = v.sigla
        WHERE v.cod_eleicao IN (SELECT cod_eleicao FROM eleicao)
          AND v.cod_tse IN (SELECT cod_tse FROM municipio)
        GROUP BY 1, 2, 3, 4, 5, 6
    """, etapa='votos_part', detalhe='votacao_partido_munzona 2018-2024, somado o voto em trânsito')


def etapa_bem(c):
    log('== bens')
    c.sql('TRUNCATE bem')
    for ano in ANOS_EP:
        c.prepara('bruto', TSE / 'bens_candidatos' / str(ano) / f'bem_candidato_{ano}_BRASIL.csv')
        sem = c.um('SELECT count(*) FROM stg.bruto b WHERE NOT EXISTS '
                   '(SELECT 1 FROM candidatura c WHERE c.sq_candidato = stg.int(b.sq_candidato))')[0]
        c.registra('bem descarte', f'{ano}: candidatura não carregada', sem)
        c.sql("""
            INSERT INTO bem (sq_candidato, nr_ordem, tipo, descricao, valor)
            SELECT DISTINCT ON (sq, nr) sq, nr, left(stg.nulo(ds_tipo_bem_candidato), 120),
                   stg.nulo(ds_bem_candidato), COALESCE(stg.num(vr_bem_candidato), 0)
            FROM (SELECT *, stg.int(sq_candidato) AS sq, stg.int(nr_ordem_bem_candidato)::SMALLINT AS nr
                  FROM stg.bruto) b
            WHERE nr IS NOT NULL AND sq IN (SELECT sq_candidato FROM candidatura)
            ORDER BY sq, nr, stg.data(dt_ult_atual_bem_candidato) DESC NULLS LAST, hh_ult_atual_bem_candidato DESC
        """, etapa='bem', detalhe=f'{ano}')
    c.sql('DROP TABLE stg.bruto')


def etapa_receita(c):
    """SQ_RECEITA identifica o documento; as linhas repetidas são seus itens.
    Fonte, origem e doador são constantes no documento, então os itens são somados."""
    log('== receitas')
    c.sql('TRUNCATE receita')
    for ano in ANOS_EP:
        pasta = TSE / 'receitas_candidatos' / str(ano)
        c.prepara('bruto', pasta / f'receitas_candidatos_{ano}_BRASIL.csv')
        c.prepara('originario', pasta / f'receitas_candidatos_doador_originario_{ano}_BRASIL.csv')
        sem_id, sem_cand = c.um("""
            SELECT count(*) FILTER (WHERE stg.int(sq_receita) IS NULL),
                   count(*) FILTER (WHERE stg.int(sq_receita) IS NOT NULL AND NOT EXISTS
                       (SELECT 1 FROM candidatura c WHERE c.sq_candidato = stg.int(r.sq_candidato)))
            FROM stg.bruto r""")
        c.registra('receita descarte', f'{ano}: marcador de prestação zerada (SQ = -1, valor 0)', sem_id)
        c.registra('receita descarte', f'{ano}: candidatura não carregada', sem_cand)
        c.sql("""
            INSERT INTO receita (sq_receita, sq_candidato, fonte, origem, doador, valor)
            SELECT r.sq, min(r.cand), left(min(stg.nulo(r.ds_fonte_receita)), 40),
                   left(min(stg.nulo(r.ds_origem_receita)), 80),
                   left(COALESCE(min(o.doador), min(stg.nulo(r.nm_doador))), 200),
                   sum(COALESCE(stg.num(r.vr_receita), 0))
            FROM (SELECT *, stg.int(sq_receita) AS sq, stg.int(sq_candidato) AS cand FROM stg.bruto) r
            LEFT JOIN (SELECT DISTINCT ON (stg.int(sq_receita)) stg.int(sq_receita) AS sq,
                              stg.nulo(nm_doador_originario) AS doador
                       FROM stg.originario
                       ORDER BY stg.int(sq_receita), stg.num(vr_receita) DESC NULLS LAST) o ON o.sq = r.sq
            WHERE r.sq IS NOT NULL AND r.cand IN (SELECT sq_candidato FROM candidatura)
            GROUP BY r.sq
            ON CONFLICT (sq_receita) DO NOTHING
        """, etapa='receita', detalhe=f'{ano}: itens somados por SQ_RECEITA')
    c.sql('DROP TABLE stg.bruto, stg.originario')


def etapa_despesa(c):
    """Mesma lógica das receitas: SQ_DESPESA é o documento, as linhas são itens."""
    log('== despesas')
    c.sql('TRUNCATE despesa')
    for ano in ANOS_EP:
        c.prepara('bruto', TSE / 'despesas_contratadas_candidatos' / str(ano)
                  / f'despesas_contratadas_candidatos_{ano}_BRASIL.csv')
        sem_id, sem_cand = c.um("""
            SELECT count(*) FILTER (WHERE stg.int(sq_despesa) IS NULL),
                   count(*) FILTER (WHERE stg.int(sq_despesa) IS NOT NULL AND NOT EXISTS
                       (SELECT 1 FROM candidatura c WHERE c.sq_candidato = stg.int(d.sq_candidato)))
            FROM stg.bruto d""")
        c.registra('despesa descarte', f'{ano}: marcador de prestação zerada (SQ = -1, valor 0)', sem_id)
        c.registra('despesa descarte', f'{ano}: candidatura não carregada', sem_cand)
        c.sql("""
            INSERT INTO despesa (sq_despesa, sq_candidato, tipo, descricao, fornecedor, valor)
            SELECT d.sq, min(d.cand), left(min(stg.nulo(d.ds_origem_despesa)), 120),
                   string_agg(stg.nulo(d.ds_despesa), ' | '),
                   left(min(stg.nulo(d.nm_fornecedor)), 200),
                   sum(COALESCE(stg.num(d.vr_despesa_contratada), 0))
            FROM (SELECT *, stg.int(sq_despesa) AS sq, stg.int(sq_candidato) AS cand FROM stg.bruto) d
            WHERE d.sq IS NOT NULL AND d.cand IN (SELECT sq_candidato FROM candidatura)
            GROUP BY d.sq
            ON CONFLICT (sq_despesa) DO NOTHING
        """, etapa='despesa', detalhe=f'{ano}: itens somados por SQ_DESPESA')
    c.sql('DROP TABLE stg.bruto')


def etapa_votos_cand(c):
    log('== votos por candidatura')
    c.sql('TRUNCATE votos_cand')
    for ano in ANOS_EP:
        c.prepara('bruto', TSE / 'votacao_candidato_munzona' / str(ano)
                  / f'votacao_candidato_munzona_{ano}_BRASIL.csv')
        zz, sem_cand = c.um("""
            SELECT count(*) FILTER (WHERE sg_uf = 'ZZ'),
                   count(*) FILTER (WHERE sg_uf <> 'ZZ' AND NOT EXISTS
                       (SELECT 1 FROM candidatura c WHERE c.sq_candidato = stg.int(v.sq_candidato)))
            FROM stg.bruto v""")
        c.registra('votos_cand descarte', f'{ano}: votos no exterior (UF ZZ)', zz)
        c.registra('votos_cand descarte', f'{ano}: candidatura não carregada (suplementar ou sem título)', sem_cand)
        c.sql("""
            INSERT INTO votos_cand (sq_candidato, cod_tse, zona, turno, votos)
            SELECT sq, cod_tse, zona, turno, sum(votos)
            FROM (SELECT stg.int(sq_candidato) AS sq, stg.mun(cd_municipio) AS cod_tse,
                         stg.int(nr_zona) AS zona, stg.int(nr_turno) AS turno,
                         COALESCE(stg.int(qt_votos_nominais), 0) AS votos
                  FROM stg.bruto) v
            WHERE sq IN (SELECT sq_candidato FROM candidatura)
              AND cod_tse IN (SELECT cod_tse FROM municipio)
            GROUP BY 1, 2, 3, 4
        """, etapa='votos_cand', detalhe=f'{ano}: somado o voto em trânsito')
    c.sql('DROP TABLE stg.bruto')


def etapa_perfil(c):
    """O arquivo de comparecimento não traz CD_ELEICAO. O perfil é ligado a toda eleição
    apurada naquele município e turno; nos anos gerais isso inclui a eleição federal e a
    estadual, que têm o mesmo eleitorado."""
    log('== perfil de comparecimento')
    c.sql('TRUNCATE perfil_comparecimento')
    for ano in ANOS_EP:
        c.prepara('bruto', TSE / 'comparecimento_abstencao' / str(ano)
                  / f'perfil_comparecimento_abstencao_{ano}_BRASIL.csv')
        c.registra('perfil descarte', f'{ano}: exterior (UF ZZ)',
                   c.um("SELECT count(*) FROM stg.bruto WHERE sg_uf = 'ZZ'")[0])
        c.sql("""
            INSERT INTO perfil_comparecimento (cod_eleicao, cod_tse, zona, turno, faixa_etaria, escolaridade,
                                               aptos, comparecimento)
            SELECT m.cod_eleicao, a.cod_tse, a.zona, a.turno, a.faixa, a.esc, a.aptos, a.comp
            FROM (SELECT stg.mun(cd_municipio) AS cod_tse, stg.int(nr_zona) AS zona, stg.int(nr_turno) AS turno,
                         COALESCE(stg.nulo(ds_faixa_etaria), 'NÃO INFORMADO') AS faixa,
                         COALESCE(stg.nulo(ds_grau_escolaridade), 'NÃO INFORMADO') AS esc,
                         sum(COALESCE(stg.int(qt_aptos), 0)) AS aptos,
                         sum(COALESCE(stg.int(qt_comparecimento), 0)) AS comp
                  FROM stg.bruto WHERE sg_uf <> 'ZZ'
                  GROUP BY 1, 2, 3, 4, 5) a
            JOIN (SELECT DISTINCT ap.cod_eleicao, ap.cod_tse, ap.turno
                  FROM apuracao ap JOIN eleicao e ON e.cod_eleicao = ap.cod_eleicao
                  WHERE e.ano = %s) m
              ON m.cod_tse = a.cod_tse AND m.turno = a.turno
        """, (ano,), etapa='perfil_comparecimento', detalhe=f'{ano}: somados gênero, raça e demais cortes')
    c.sql('DROP TABLE stg.bruto')


def etapa_indices(c):
    log('== índices, visões e estatísticas')
    c.sql('DROP VIEW IF EXISTS vw_ideologia_partido, vw_qt_mandatos, vw_patrimonio, vw_candidatura')
    c.sql('DROP FUNCTION IF EXISTS nivel_escolaridade(VARCHAR)')
    for idx in ('idx_candidatura_eleicao', 'idx_candidatura_politico', 'idx_receita_candidato',
                'idx_despesa_candidato', 'idx_votos_cand_mun', 'idx_votos_part_mun'):
        c.sql(f'DROP INDEX IF EXISTS {idx}')
    t0 = time.time()
    c.sql((RAIZ / '02_indices_visoes.sql').read_text())
    c.registra('indices', '02_indices_visoes.sql aplicado', 6, time.time() - t0)
    t0 = time.time()
    c.sql('ANALYZE')
    c.registra('analyze', 'estatísticas do planejador', 0, time.time() - t0)


# Um partido entra no cálculo do ano se participou de pelo menos tantas coligações
# para prefeito com outros partidos; abaixo disso a posição dele é instável.
MIN_COLIGACOES = 50


def siglas_coligacao(texto):
    """'PP / PSD / Federação PSDB CIDADANIA (45-PSDB / 23-CIDADANIA)' -> PP, PSD, PSDB, CIDADANIA"""
    for parte in re.split(r'\s*/\s*(?![^()]*\))', texto):
        if parte.upper().startswith('FEDERA'):
            yield from (s.strip().upper() for s in re.findall(r'\d+\s*-\s*([^/()]+)', parte))
        elif parte.strip():
            yield parte.strip().upper()


def etapa_ideologia_coligacao(c):
    """Posição de cada partido pelas coligações para prefeito (acréscimo ao dossiê).

    Em cada eleição municipal, monta a matriz partido x partido com o número de
    coligações em que os dois estiveram juntos. O segundo autovetor da matriz
    normalizada (o primeiro é trivial) ordena os partidos de modo que os que se
    coligam entre si fiquem próximos: é o eixo revelado pelas alianças. O sinal
    do autovetor é arbitrário e é orientado pelas notas dos especialistas; a escala
    é convertida para a delas (mesma média e desvio padrão), de 0 a 10.
    """
    import numpy as np

    log('== ideologia pelas coligações')
    if c.um("SELECT to_regclass('vw_ideologia_partido')")[0] is None:
        ddl = (RAIZ / '01_tabelas.sql').read_text()
        c.sql(re.search(r'CREATE TABLE ideologia_coligacao .*?\n\);', ddl, re.S).group(0)
              .replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS'))
        visoes = (RAIZ / '02_indices_visoes.sql').read_text()
        c.sql(re.search(r'CREATE VIEW vw_ideologia_partido .*?\) col ON TRUE;', visoes, re.S).group(0))
    c.sql('TRUNCATE ideologia_coligacao')

    coligacoes = defaultdict(set)   # ano -> {(ue, título, texto)}: uma por candidato, mesmo com 2º turno
    for ano, ue, titulo, texto in c.sql("""
            SELECT DISTINCT e.ano, c.ue, c.titulo_eleitoral, c.coligacao
            FROM candidatura c JOIN eleicao e USING (cod_eleicao)
            WHERE c.cargo = 'PREFEITO' AND c.coligacao IS NOT NULL"""):
        coligacoes[ano].add((ue, titulo, texto))

    linhas = []
    for ano in sorted(coligacoes):
        ids = dict(c.sql("""SELECT DISTINCT ON (upper(pa.sigla)) upper(pa.sigla), pa.id_partido
                            FROM candidatura c JOIN eleicao e USING (cod_eleicao)
                            JOIN partido pa USING (id_partido)
                            WHERE e.ano = %s
                            GROUP BY 1, 2 ORDER BY 1, count(*) DESC""", (ano,)))
        pares, n, sem_partido = Counter(), Counter(), 0
        for _, _, texto in coligacoes[ano]:
            siglas = set(siglas_coligacao(texto))
            sem_partido += len(siglas - ids.keys())
            partidos = sorted(ids[s] for s in siglas if s in ids)
            if len(partidos) < 2:
                continue
            n.update(partidos)
            pares.update(combinations(partidos, 2))
        if sem_partido:
            c.registra('ideologia_coligacao descarte', f'{ano}: sigla da coligação sem partido no ano', sem_partido)

        P = sorted(p for p in n if n[p] >= MIN_COLIGACOES)
        pos = {p: i for i, p in enumerate(P)}
        M = np.zeros((len(P), len(P)))
        for (a, b), v in pares.items():
            if a in pos and b in pos:
                M[pos[a], pos[b]] = M[pos[b], pos[a]] = v
        grau = M.sum(axis=1)
        if len(P) < 5 or (grau == 0).any():
            c.registra('ideologia_coligacao aviso', f'{ano}: partidos insuficientes', len(P))
            continue
        _, vetores = np.linalg.eigh(M / np.sqrt(np.outer(grau, grau)))
        eixo = vetores[:, -2] / np.sqrt(grau)

        nota_esp = dict(c.sql("""SELECT id_partido, nota_especialistas FROM vw_ideologia_partido
                                 WHERE ano = %s AND nota_especialistas IS NOT NULL""", (ano,)))
        ref = [p for p in P if p in nota_esp]
        x = np.array([eixo[pos[p]] for p in ref])
        y = np.array([float(nota_esp[p]) for p in ref])
        if np.corrcoef(x, y)[0, 1] < 0:
            eixo, x = -eixo, -x
        nota = np.clip(y.mean() + y.std() * (eixo - x.mean()) / x.std(), 0, 10)
        ordem = lambda v: np.searchsorted(np.sort(v), v)   # empates com a mesma posição, como RANK()
        spearman = np.corrcoef(ordem(np.round([nota[pos[p]] for p in ref], 2)), ordem(y))[0, 1]

        linhas += [(p, ano, round(float(nota[pos[p]]), 2), n[p]) for p in P]
        c.registra('ideologia_coligacao', f'{ano}: {len(P)} partidos, {len(coligacoes[ano])} coligações, '
                                          f'concordância {spearman:.2f}', len(P))
    with c.conn.cursor() as cur:
        cur.executemany('INSERT INTO ideologia_coligacao (id_partido, ano, nota, coligacoes) VALUES (%s, %s, %s, %s)',
                        linhas)
    c.sql('ANALYZE ideologia_coligacao')


def etapa_limpeza(c):
    c.sql('DROP SCHEMA stg CASCADE')
    c.registra('limpeza', 'esquema stg removido', 0)


ETAPAS = {
    'esquema': etapa_esquema,
    'territorio': etapa_territorio,
    'preparo': etapa_preparo,
    'nucleo': etapa_nucleo,
    'apuracao': etapa_apuracao,
    'votos_part': etapa_votos_part,
    'bem': etapa_bem,
    'receita': etapa_receita,
    'despesa': etapa_despesa,
    'votos_cand': etapa_votos_cand,
    'perfil': etapa_perfil,
    'indices': etapa_indices,
    'ideologia_coligacao': etapa_ideologia_coligacao,
    'limpeza': etapa_limpeza,
}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--etapas', help='lista separada por vírgula; padrão: todas, na ordem: ' + ', '.join(ETAPAS))
    args = ap.parse_args()
    etapas = args.etapas.split(',') if args.etapas else list(ETAPAS)
    desconhecidas = [e for e in etapas if e not in ETAPAS]
    if desconhecidas:
        sys.exit(f'etapas desconhecidas: {desconhecidas}')

    t0 = time.time()
    with psycopg.connect(DSN, autocommit=True) as conn:
        c = Carga(conn)
        c.sql("SET synchronous_commit = off; SET work_mem = '256MB'; SET maintenance_work_mem = '1GB'")
        c.sql(FUNCOES_STG)  # idempotente: permite refazer uma etapa depois da limpeza
        for nome in etapas:
            ETAPAS[nome](c)
    log(f'carga concluída em {(time.time() - t0) / 60:.1f} min')


if __name__ == '__main__':
    main()
