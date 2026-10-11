#!/usr/bin/env python3
"""Gera os arquivos JSON que o site lê, em site/dados/.

O site é estático: não consulta o banco. Este script roda as consultas uma vez
e grava os resultados em arquivos pequenos.

    politicos  carreiras e índice de busca (banco dos seis estados)
    mapa       perguntas 1, 2 e 8 no Brasil, por estado e por município (banco nacional)
    geo        contornos dos estados e municípios (API de malhas do IBGE)
    vies       pergunta 7: índice ideológico ponderado pelos votos no Brasil, nas regiões,
               nas UFs e nos municípios dos seis estados (banco nacional)
    candidatos candidatos a presidente, governador, senador e prefeito, um a um, para os
               recortes com poucos candidatos no mapa (banco dos seis estados)

Uso (com o ambiente de banco/.venv):
    ../banco/.venv/bin/python gera_dados.py                 # tudo
    ../banco/.venv/bin/python gera_dados.py --partes politicos
Bancos: --banco (padrão dbname=eleicoes) e --nacional (padrão dbname=eleicoes_nacional).

Título eleitoral, CPF e data de nascimento não saem do banco: cada político
recebe um número sequencial próprio.
"""
import argparse
import gzip
import json
import re
import shutil
import time
import unicodedata
import urllib.request
from collections import defaultdict
from pathlib import Path

import psycopg

DADOS = Path(__file__).resolve().parent / 'dados'
UFS_PROJETO = ('AP', 'MG', 'MS', 'PB', 'RO', 'RR')
POR_ARQUIVO = 1000                       # políticos por arquivo de carreira
PALAVRAS_IGNORADAS = {'DA', 'DE', 'DI', 'DO', 'DU', 'DAS', 'DOS', 'E', 'D'}


def log(msg):
    print(time.strftime('%H:%M:%S'), msg, flush=True)


def grava(caminho, obj):
    caminho = DADOS / caminho
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    return caminho.stat().st_size


def tamanho_pasta(p):
    return sum(f.stat().st_size for f in p.rglob('*') if f.is_file())


def normaliza(texto):
    """'Ricardo Vieira Coutinho' -> 'RICARDO VIEIRA COUTINHO' (sem acentos, só letras e espaços)."""
    t = unicodedata.normalize('NFKD', texto).encode('ascii', 'ignore').decode().upper()
    return re.sub(r'[^A-Z ]+', ' ', t).split()


def num(v):
    """NUMERIC do banco -> número JSON (None continua None)."""
    return None if v is None else float(v)


# --------------------------------------------------------------------------- políticos

SQL_CANDIDATURAS = """
WITH bens AS (SELECT sq_candidato, SUM(valor) AS total FROM bem GROUP BY 1),
     rec AS (SELECT sq_candidato, SUM(valor) AS total,
                    SUM(valor) FILTER (WHERE UPPER(fonte) LIKE 'FUNDO%') AS publica
             FROM receita GROUP BY 1),
     des AS (SELECT sq_candidato, SUM(valor) AS total FROM despesa GROUP BY 1)
SELECT v.titulo_eleitoral, v.ano, v.cargo, v.ue, COALESCE(m.uf, v.ue) AS uf,
       v.id_partido, v.situacao_final, v.eleito, v.reeleicao,
       CASE WHEN v.ano >= 2018 THEN COALESCE(b.total, 0) END AS patrimonio,
       r.total, r.publica, d.total
FROM vw_candidatura v
LEFT JOIN municipio m ON m.cod_tse = v.ue
LEFT JOIN bens b ON b.sq_candidato = v.sq_candidato
LEFT JOIN rec r  ON r.sq_candidato = v.sq_candidato
LEFT JOIN des d  ON d.sq_candidato = v.sq_candidato
ORDER BY v.titulo_eleitoral, v.ano, v.cargo
"""

# Cada candidatura é uma lista nesta ordem. cargo, partido e situação são índices das
# listas de tabelas.json; local é a UF (cargos estaduais), BR (presidente) ou o código
# do município; os valores em reais são inteiros; campos vazios no fim são omitidos.
CAMPOS_CANDIDATURA = ['ano', 'cargo', 'local', 'partido', 'situacao', 'reeleicao',
                      'patrimonio', 'receita', 'receita_publica', 'despesa']
# Ficha de busca: o suficiente para listar e distinguir homônimos.
CAMPOS_FICHA = ['nome', 'uf', 'ultimo_cargo', 'primeiro_ano', 'ultimo_ano', 'vitorias']
POR_FICHA = 2000                         # políticos por arquivo de fichas


class Tabela:
    """Troca valores repetidos por índices de uma lista."""
    def __init__(self):
        self.lista, self.pos = [], {}

    def __call__(self, valor):
        if valor not in self.pos:
            self.pos[valor] = len(self.lista)
            self.lista.append(valor)
        return self.pos[valor]


def inteiro(v):
    return None if v is None else round(v)


def sem_vazios_no_fim(linha):
    while linha and linha[-1] is None:
        linha.pop()
    return linha


def diferencas(ids):
    """[5, 9, 30] -> [5, 4, 21]: números menores no JSON; o site soma de volta."""
    ids = sorted(ids)
    return [ids[0]] + [b - a for a, b in zip(ids, ids[1:])]


def parte_politicos(conn):
    log('políticos: lendo nomes e candidaturas')
    cargos, situacoes = Tabela(), Tabela()
    with conn.cursor() as cur:
        cur.execute('SELECT titulo_eleitoral, nome FROM politico ORDER BY nome, titulo_eleitoral')
        politicos = cur.fetchall()
        cur.execute("SELECT cod_tse, nome || ' (' || uf || ')' FROM municipio")
        municipios = dict(cur.fetchall())
        cur.execute('SELECT id_partido, sigla FROM partido ORDER BY id_partido')
        partidos = dict(cur.fetchall())
        # notas ideológicas por partido e ano: "id_partido|ano" -> [especialistas, câmara]
        cur.execute('SELECT id_partido, ano, nota_especialistas, espectro_camara FROM vw_ideologia_partido '
                    'WHERE nota_especialistas IS NOT NULL OR espectro_camara IS NOT NULL')
        notas = {f'{i}|{a}': [num(e), num(c)] for i, a, e, c in cur.fetchall()}
        cur.execute(SQL_CANDIDATURAS)
        por_titulo = defaultdict(list)
        for (titulo, ano, cargo, local, uf, id_partido, situacao, eleito, reel,
             patrimonio, receita, publica, despesa) in cur:
            linha = [ano, cargos(cargo), local, id_partido, situacoes(situacao or 'SEM SITUAÇÃO'), int(reel),
                     inteiro(patrimonio), inteiro(receita), inteiro(publica), inteiro(despesa)]
            por_titulo[titulo].append((uf, bool(eleito), sem_vazios_no_fim(linha)))

    pasta = DADOS / 'politicos'
    shutil.rmtree(pasta, ignore_errors=True)
    palavras = defaultdict(lambda: defaultdict(list))   # prefixo de 3 letras -> palavra -> ids
    carreiras = defaultdict(dict)                       # arquivo -> {id: [nome, candidaturas]}
    fichas = defaultdict(dict)                          # arquivo -> {id: ficha}
    for pid, (titulo, nome) in enumerate(politicos, start=1):
        cands = por_titulo.get(titulo, [])
        if not cands:
            continue
        ultimo_uf, _, ultimo = cands[-1]
        anos = [c[0] for _, _, c in cands]
        fichas[(pid - 1) // POR_FICHA][pid] = [nome, ultimo_uf, ultimo[1], min(anos), max(anos),
                                               sum(e for _, e, _ in cands)]
        carreiras[(pid - 1) // POR_ARQUIVO][pid] = [nome, [c for _, _, c in cands]]
        for palavra in set(normaliza(nome)):
            if len(palavra) >= 3 and palavra not in PALAVRAS_IGNORADAS:
                palavras[palavra[:3]][palavra].append(pid)

    for n, lote in carreiras.items():
        grava(f'politicos/carreira/{n}.json', lote)
    for n, lote in fichas.items():
        grava(f'politicos/fichas/{n}.json', lote)
    for prefixo, por_palavra in palavras.items():
        grava(f'politicos/indice/{prefixo}.json', {p: diferencas(ids) for p, ids in por_palavra.items()})
    grava('politicos/tabelas.json', {
        'total': len(politicos), 'por_arquivo': POR_ARQUIVO, 'por_ficha': POR_FICHA,
        'campos_candidatura': CAMPOS_CANDIDATURA, 'campos_ficha': CAMPOS_FICHA,
        'palavras_ignoradas': sorted(PALAVRAS_IGNORADAS),
        'cargos': cargos.lista, 'situacoes': situacoes.lista,
        'eleito': ['ELEITO', 'ELEITO POR QP', 'ELEITO POR MÉDIA'],
        'partidos': partidos, 'notas': notas, 'municipios': municipios})
    for sub in ('carreira', 'fichas', 'indice'):
        log(f'políticos/{sub}: {len(list((pasta / sub).iterdir())):,} arquivos, '
            f'{tamanho_pasta(pasta / sub) / 1e6:.1f} MB')
    log(f'políticos: {len(politicos):,} pessoas, {tamanho_pasta(pasta) / 1e6:.1f} MB no total')


# --------------------------------------------------------------------------- mapa (perguntas 1, 2 e 8)

ANOS = (2018, 2020, 2022, 2024)
CARGOS_MAPA = ('PRESIDENTE', 'GOVERNADOR', 'SENADOR', 'DEPUTADO FEDERAL', 'DEPUTADO ESTADUAL',
               'DEPUTADO DISTRITAL', 'PREFEITO', 'VEREADOR')
FAIXAS_PATRIMONIO = ['Sem bens declarados', 'Até R$ 100 mil', 'R$ 100 mil a R$ 500 mil',
                     'R$ 500 mil a R$ 1 milhão', 'R$ 1 milhão a R$ 5 milhões', 'Acima de R$ 5 milhões']
FAIXAS_DEPENDENCIA = ['75% ou mais público', '50% a 75% público', '25% a 50% público', 'Menos de 25% público']

# Uma linha por candidatura do período, com o território dela: a UF dos cargos estaduais
# e municipais, o município dos cargos municipais; presidente só entra no total do Brasil.
SQL_BASE = """
WITH gasto AS (SELECT sq_candidato, SUM(valor) AS total FROM despesa GROUP BY 1),
     bens  AS (SELECT sq_candidato, SUM(valor) AS total FROM bem GROUP BY 1),
     rec   AS (SELECT sq_candidato, SUM(valor) AS total,
                      SUM(valor) FILTER (WHERE UPPER(fonte) LIKE 'FUNDO%%') AS publica
               FROM receita GROUP BY 1)
SELECT v.ano, v.cargo, v.eleito,
       CASE WHEN length(v.ue) = 2 AND v.ue <> 'BR' THEN v.ue ELSE m.uf END AS uf,
       CASE WHEN length(v.ue) = 5 THEN v.ue END                             AS mun,
       COALESCE(g.total, 0)                                                 AS gasto,
       CASE WHEN COALESCE(b.total, 0) = 0       THEN 0
            WHEN b.total < 100000               THEN 1
            WHEN b.total < 500000               THEN 2
            WHEN b.total < 1000000              THEN 3
            WHEN b.total < 5000000              THEN 4
            ELSE 5 END                                                      AS faixa_patrimonio,
       CASE WHEN COALESCE(r.total, 0) <= 0 THEN NULL
            WHEN COALESCE(r.publica, 0) / r.total >= 0.75 THEN 0
            WHEN COALESCE(r.publica, 0) / r.total >= 0.50 THEN 1
            WHEN COALESCE(r.publica, 0) / r.total >= 0.25 THEN 2
            ELSE 3 END                                                      AS faixa_dependencia
FROM vw_candidatura v
LEFT JOIN municipio m ON m.cod_tse = v.ue
LEFT JOIN gasto g ON g.sq_candidato = v.sq_candidato
LEFT JOIN bens b  ON b.sq_candidato = v.sq_candidato
LEFT JOIN rec r   ON r.sq_candidato = v.sq_candidato
WHERE v.ano = ANY(%(anos)s) AND v.cargo = ANY(%(cargos)s)
"""

# Agrega no Brasil, por UF e por município (só cargos municipais). nivel: 0 Brasil, 1 UF, 2 município.
SQL_CUSTO = """
WITH base AS ({base}),
cand AS (
    SELECT GROUPING(uf, mun) AS g, ano, cargo, uf, mun,
           COUNT(*) AS candidatos, COUNT(*) FILTER (WHERE eleito) AS eleitos,
           SUM(gasto) AS gasto, SUM(gasto) FILTER (WHERE eleito) AS gasto_eleitos
    FROM base
    GROUP BY GROUPING SETS ((ano, cargo), (ano, cargo, uf), (ano, cargo, uf, mun))
),
vagas AS (
    SELECT GROUPING(uf, mun) AS g, ano, cargo, uf, mun, SUM(qt_vagas) AS vagas
    FROM (SELECT e.ano, vg.cargo, vg.qt_vagas,
                 CASE WHEN length(vg.ue) = 2 AND vg.ue <> 'BR' THEN vg.ue ELSE m.uf END AS uf,
                 CASE WHEN length(vg.ue) = 5 THEN vg.ue END AS mun
          FROM vaga vg JOIN eleicao e USING (cod_eleicao)
          LEFT JOIN municipio m ON m.cod_tse = vg.ue
          WHERE e.ano = ANY(%(anos)s) AND vg.cargo = ANY(%(cargos)s)) x
    GROUP BY GROUPING SETS ((ano, cargo), (ano, cargo, uf), (ano, cargo, uf, mun))
)
SELECT c.g, c.ano, c.cargo, c.uf, c.mun, v.vagas, c.candidatos, c.eleitos, c.gasto, c.gasto_eleitos
FROM cand c
LEFT JOIN vagas v ON v.g = c.g AND v.ano = c.ano AND v.cargo = c.cargo
                 AND v.uf IS NOT DISTINCT FROM c.uf AND v.mun IS NOT DISTINCT FROM c.mun
WHERE (c.g = 3) OR (c.g = 1 AND c.uf IS NOT NULL) OR (c.g = 0 AND c.mun IS NOT NULL)
"""

SQL_FAIXAS = """
WITH base AS ({base})
SELECT GROUPING(uf, mun) AS g, ano, cargo, uf, mun, {faixa} AS faixa,
       COUNT(*) AS candidatos, COUNT(*) FILTER (WHERE eleito) AS eleitos
FROM base
WHERE {faixa} IS NOT NULL
GROUP BY GROUPING SETS ((ano, cargo, {faixa}), (ano, cargo, uf, {faixa}), (ano, cargo, uf, mun, {faixa}))
HAVING GROUPING(uf, mun) = 3 OR (GROUPING(uf, mun) = 1 AND uf IS NOT NULL)
    OR (GROUPING(uf, mun) = 0 AND mun IS NOT NULL)
"""

NIVEL = {3: 'BR', 1: 'UF', 0: 'MUN'}


def parte_mapa(conn):
    log('mapa: agregando as perguntas 1, 2 e 8')
    params = {'anos': list(ANOS), 'cargos': list(CARGOS_MAPA)}
    cargos = list(CARGOS_MAPA)
    with conn.cursor() as cur:
        cur.execute("SELECT cod_tse, cod_ibge, nome, uf FROM municipio WHERE uf = ANY(%s)", (list(UFS_PROJETO),))
        municipios = {c: {'ibge': i, 'nome': n, 'uf': u} for c, i, n, u in cur.fetchall()}
        cur.execute(SQL_CUSTO.format(base=SQL_BASE), params)
        custo = cur.fetchall()
        cur.execute(SQL_FAIXAS.format(base=SQL_BASE, faixa='faixa_patrimonio'), params)
        patrimonio = cur.fetchall()
        cur.execute(SQL_FAIXAS.format(base=SQL_BASE, faixa='faixa_dependencia'), params)
        dependencia = cur.fetchall()

    # Cada linha: [ano, cargo (índice), território, ...valores]; território = "BR", a UF ou o
    # código TSE do município. Brasil e UFs vão num arquivo; municípios, um arquivo por UF.
    def territorio(g, uf, mun):
        return {3: 'BR', 1: uf, 0: mun}[g]

    brasil = {'custo': [], 'patrimonio': [], 'dependencia': []}
    por_uf = defaultdict(lambda: {'custo': [], 'patrimonio': [], 'dependencia': []})
    for g, ano, cargo, uf, mun, vagas, cand, eleitos, gasto, gasto_el in custo:
        linha = [ano, cargos.index(cargo), territorio(g, uf, mun), vagas, cand, eleitos, inteiro(num(gasto)), inteiro(num(gasto_el))]
        if g == 0:
            if uf in UFS_PROJETO:
                por_uf[uf]['custo'].append(linha)
        else:
            brasil['custo'].append(linha)
    for nome, linhas in (('patrimonio', patrimonio), ('dependencia', dependencia)):
        for g, ano, cargo, uf, mun, faixa, cand, eleitos in linhas:
            linha = [ano, cargos.index(cargo), territorio(g, uf, mun), faixa, cand, eleitos]
            if g == 0:
                if uf in UFS_PROJETO:
                    por_uf[uf][nome].append(linha)
            else:
                brasil[nome].append(linha)

    descricao = {
        'cargos': cargos, 'anos': list(ANOS), 'ufs_projeto': list(UFS_PROJETO),
        'faixas_patrimonio': FAIXAS_PATRIMONIO, 'faixas_dependencia': FAIXAS_DEPENDENCIA,
        'campos_custo': ['ano', 'cargo', 'territorio', 'vagas', 'candidatos', 'eleitos', 'gasto', 'gasto_eleitos'],
        'campos_faixa': ['ano', 'cargo', 'territorio', 'faixa', 'candidatos', 'eleitos'],
    }
    shutil.rmtree(DADOS / 'mapa', ignore_errors=True)
    grava('mapa/brasil.json', {**descricao, **brasil})
    for uf in UFS_PROJETO:
        mun_uf = {c: m for c, m in municipios.items() if m['uf'] == uf}
        grava(f'mapa/municipios/{uf}.json', {**por_uf[uf], 'municipios': mun_uf})
    log(f'mapa: {len(brasil["custo"])} linhas de custo no Brasil e nas UFs, '
        f'{sum(len(v["custo"]) for v in por_uf.values())} nos municípios; '
        f'{tamanho_pasta(DADOS / "mapa") / 1e6:.1f} MB')


# --------------------------------------------------------------------------- contornos (IBGE)

MALHAS = 'https://servicodados.ibge.gov.br/api/v3/malhas'
CODIGO_UF = {'RO': 11, 'RR': 14, 'AP': 16, 'PB': 25, 'MG': 31, 'MS': 50}
SIGLA_UF = {11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP', 17: 'TO', 21: 'MA', 22: 'PI',
            23: 'CE', 24: 'RN', 25: 'PB', 26: 'PE', 27: 'AL', 28: 'SE', 29: 'BA', 31: 'MG', 32: 'ES',
            33: 'RJ', 35: 'SP', 41: 'PR', 42: 'SC', 43: 'RS', 50: 'MS', 51: 'MT', 52: 'GO', 53: 'DF'}


def baixa_malha(caminho):
    url = f'{MALHAS}/{caminho}&formato=application/vnd.geo+json'
    with urllib.request.urlopen(url, timeout=120) as r:
        corpo = r.read()
    if corpo[:2] == b'\x1f\x8b':                 # o IBGE responde compactado mesmo sem pedirmos
        corpo = gzip.decompress(corpo)
    return json.loads(corpo)


def anel_para_d3(anel, externo):
    """Arredonda a ~100 m e acerta o sentido: o D3 quer o anel externo no sentido horário
    (o contrário do padrão GeoJSON); sem isso ele pinta o mundo em volta do polígono."""
    anel = [[round(x, 3), round(y, 3)] for x, y in anel]
    area = sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(anel, anel[1:]))
    if (area > 0) == externo:                 # anti-horário no externo, ou horário num buraco
        anel.reverse()
    return anel


def ajusta(feature, propriedades):
    geo = feature['geometry']
    poligonos = geo['coordinates'] if geo['type'] == 'MultiPolygon' else [geo['coordinates']]
    coords = [[anel_para_d3(a, i == 0) for i, a in enumerate(p)] for p in poligonos]
    return {'type': 'Feature', 'properties': propriedades,
            'geometry': {'type': 'MultiPolygon', 'coordinates': coords}}


def parte_geo(conn):
    log('geo: baixando contornos do IBGE')
    with conn.cursor() as cur:
        cur.execute('SELECT cod_ibge, cod_tse FROM municipio WHERE uf = ANY(%s)', (list(UFS_PROJETO),))
        tse = dict(cur.fetchall())
    estados = baixa_malha('paises/BR?intrarregiao=UF&qualidade=intermediaria')
    grava('geo/estados.json', {'type': 'FeatureCollection', 'features': [
        ajusta(f, {'uf': SIGLA_UF[int(f['properties']['codarea'])]}) for f in estados['features']]})
    for uf, codigo in CODIGO_UF.items():
        mun = baixa_malha(f'estados/{codigo}?intrarregiao=municipio&qualidade=minima')
        grava(f'geo/municipios/{uf}.json', {'type': 'FeatureCollection', 'features': [
            ajusta(f, {'mun': tse.get(f['properties']['codarea'])}) for f in mun['features']]})
    log(f'geo: {tamanho_pasta(DADOS / "geo") / 1e6:.1f} MB')


# --------------------------------------------------------------------------- partidos

SQL_PARTIDOS = """
WITH atuais AS (                -- partidos com candidatura em 2022 ou 2024
    SELECT DISTINCT v.id_partido FROM vw_candidatura v WHERE v.ano >= 2022
),
eleitos AS (
    SELECT v.id_partido, v.ano, v.cargo, COUNT(*) FILTER (WHERE v.eleito) AS eleitos, COUNT(*) AS candidatos
    FROM vw_candidatura v
    WHERE v.ano IN (2022, 2024)
      AND v.cargo IN ('GOVERNADOR', 'SENADOR', 'DEPUTADO FEDERAL', 'DEPUTADO ESTADUAL', 'DEPUTADO DISTRITAL',
                      'PREFEITO', 'VEREADOR')
    GROUP BY 1, 2, 3
)
SELECT pa.id_partido, pa.numero, pa.sigla, pa.nome, pa.espectro_camara,
       (SELECT nota FROM ideologia_partido i WHERE i.id_partido = pa.id_partido AND i.ano_survey = 2018),
       (SELECT nota FROM ideologia_partido i WHERE i.id_partido = pa.id_partido AND i.ano_survey = 2022),
       (SELECT json_object_agg(ano, nota ORDER BY ano) FROM ideologia_coligacao c WHERE c.id_partido = pa.id_partido),
       (SELECT json_agg(json_build_array(ano, cargo, candidatos, eleitos) ORDER BY ano, cargo)
          FROM eleitos e WHERE e.id_partido = pa.id_partido)
FROM partido pa JOIN atuais USING (id_partido)
ORDER BY pa.sigla, pa.numero
"""


def parte_partidos(conn):
    log('partidos: medidas de ideologia e eleitos')
    with conn.cursor() as cur:
        cur.execute(SQL_PARTIDOS)
        linhas = cur.fetchall()
        cur.execute("""SELECT ano, round(corr(r1, r2)::numeric, 2) FROM (
                           SELECT ic.ano, rank() OVER (PARTITION BY ic.ano ORDER BY vi.nota_especialistas) r1,
                                  rank() OVER (PARTITION BY ic.ano ORDER BY ic.nota) r2
                           FROM ideologia_coligacao ic
                           JOIN vw_ideologia_partido vi ON vi.id_partido = ic.id_partido AND vi.ano = ic.ano
                           WHERE vi.nota_especialistas IS NOT NULL) x GROUP BY ano ORDER BY ano""")
        concordancia = {a: num(c) for a, c in cur.fetchall()}
    partidos = [{
        'numero': numero, 'sigla': sigla, 'nome': nome, 'camara': num(camara),
        'especialistas': {'2018': num(n18), '2022': num(n22)},
        'coligacoes': {k: num(v) for k, v in (colig or {}).items()},
        'eleicoes': eleicoes or [],
    } for _, numero, sigla, nome, camara, n18, n22, colig, eleicoes in linhas]
    # mesma sigla com dois números (PODE usou 19 e 20): fica o registro com mais candidatos em 2024
    unicos = {}
    for p in partidos:
        atual = sum(e[2] for e in p['eleicoes'] if e[0] == 2024)
        if p['sigla'] not in unicos or atual > unicos[p['sigla']][0]:
            unicos[p['sigla']] = (atual, p)
    partidos = [p for _, p in unicos.values()]
    grava('partidos.json', {'partidos': partidos, 'concordancia_coligacoes': concordancia,
                            'campos_eleicao': ['ano', 'cargo', 'candidatos', 'eleitos']})
    log(f'partidos: {len(partidos)} partidos atuais')


# --------------------------------------------------------------------------- candidatos (recortes pequenos)

# Onde há poucos candidatos (presidente no Brasil; governador e senador num estado;
# prefeito num município), o mapa mostra os candidatos um a um em vez de faixas.
CARGOS_INDIVIDUAIS = ('PRESIDENTE', 'GOVERNADOR', 'SENADOR', 'PREFEITO')

SQL_CANDIDATOS = """
WITH bens AS (SELECT sq_candidato, SUM(valor) AS total FROM bem GROUP BY 1),
     rec AS (SELECT sq_candidato, SUM(valor) AS total,
                    SUM(valor) FILTER (WHERE UPPER(fonte) LIKE 'FUNDO%%') AS publica
             FROM receita GROUP BY 1),
     des AS (SELECT sq_candidato, SUM(valor) AS total FROM despesa GROUP BY 1)
SELECT v.ano, v.cargo, v.ue, COALESCE(m.uf, v.ue) AS uf, v.titulo_eleitoral, p.nome, pa.sigla,
       v.situacao_final, v.eleito, COALESCE(b.total, 0), r.total, r.publica, d.total
FROM vw_candidatura v
JOIN politico p ON p.titulo_eleitoral = v.titulo_eleitoral
JOIN partido pa ON pa.id_partido = v.id_partido
LEFT JOIN municipio m ON m.cod_tse = v.ue
LEFT JOIN bens b ON b.sq_candidato = v.sq_candidato
LEFT JOIN rec r  ON r.sq_candidato = v.sq_candidato
LEFT JOIN des d  ON d.sq_candidato = v.sq_candidato
WHERE v.ano = ANY(%(anos)s) AND v.cargo = ANY(%(cargos)s)
ORDER BY v.ano, v.cargo, v.ue, v.eleito DESC, p.nome
"""


def parte_candidatos(conn):
    log('candidatos: listas dos recortes pequenos')
    with conn.cursor() as cur:
        # o mesmo número público da página Político (mesma ordem de parte_politicos)
        cur.execute('SELECT titulo_eleitoral FROM politico ORDER BY nome, titulo_eleitoral')
        ids = {titulo: pid for pid, (titulo,) in enumerate(cur.fetchall(), start=1)}
        cur.execute(SQL_CANDIDATOS, {'anos': list(ANOS), 'cargos': list(CARGOS_INDIVIDUAIS)})
        linhas = cur.fetchall()
    cargos = list(CARGOS_MAPA)
    arquivos = defaultdict(list)
    for ano, cargo, ue, uf, titulo, nome, sigla, situacao, eleito, patrimonio, receita, publica, despesa in linhas:
        if uf != 'BR' and uf not in UFS_PROJETO:
            continue
        arquivos[uf].append([ano, cargos.index(cargo), ue, ids[titulo], nome, sigla, situacao or 'SEM SITUAÇÃO',
                             bool(eleito), inteiro(num(patrimonio)), inteiro(num(receita)), inteiro(num(publica)),
                             inteiro(num(despesa))])
    shutil.rmtree(DADOS / 'mapa' / 'candidatos', ignore_errors=True)
    campos = ['ano', 'cargo', 'territorio', 'id', 'nome', 'partido', 'situacao', 'eleito',
              'patrimonio', 'receita', 'receita_publica', 'despesa']
    for uf, lista in arquivos.items():
        grava(f'mapa/candidatos/{uf}.json', {'campos': campos, 'candidatos': lista})
    log(f'candidatos: {sum(map(len, arquivos.values())):,} candidaturas em {len(arquivos)} arquivos')


# --------------------------------------------------------------------------- viés ideológico (pergunta 7)

# Mesma regra da consulta sql/p07_vies_ideologico.sql: votos nominais e de legenda do 1º turno
# para vereador (anos municipais) e deputado federal (anos gerais); nota de cada partido da edição
# do survey mais próxima do ano; partidos sem nota ficam fora da média.
SQL_VOTOS_VIES = """
SELECT e.ano, vp.id_partido, m.regiao, m.uf, vp.cod_tse, SUM(vp.votos_nominais + vp.votos_legenda)
FROM votos_part vp
JOIN eleicao e   ON e.cod_eleicao = vp.cod_eleicao
JOIN municipio m ON m.cod_tse = vp.cod_tse
WHERE vp.turno = 1 AND vp.cargo IN ('VEREADOR', 'DEPUTADO FEDERAL') AND e.ano = ANY(%(anos)s)
GROUP BY 1, 2, 3, 4, 5
"""
# Voto para presidente (anos gerais): votos de cada candidato por município e turno.
SQL_PRESIDENTE = """
SELECT e.ano, vc.turno, p.nome, pa.sigla, c.id_partido, m.regiao, m.uf, vc.cod_tse, SUM(vc.votos)
FROM votos_cand vc
JOIN candidatura c ON c.sq_candidato = vc.sq_candidato
JOIN eleicao e     ON e.cod_eleicao = c.cod_eleicao
JOIN politico p    ON p.titulo_eleitoral = c.titulo_eleitoral
JOIN partido pa    ON pa.id_partido = c.id_partido
JOIN municipio m   ON m.cod_tse = vc.cod_tse
WHERE c.cargo = 'PRESIDENTE' AND e.ano = ANY(%(anos)s)
GROUP BY 1, 2, 3, 4, 5, 6, 7, 8
"""
FAIXAS_VIES = [(3.5, 'Esquerda'), (4.5, 'Centro-esquerda'), (5.5, 'Centro'), (6.5, 'Centro-direita'), (99, 'Direita')]
TOP_PARTIDOS = 5


def parte_vies(conn):
    log('viés: índice ideológico ponderado pelos votos')
    with conn.cursor() as cur:
        cur.execute('SELECT id_partido, ano_survey, nota FROM ideologia_partido')
        surveys = defaultdict(list)
        for i, a, n in cur.fetchall():
            surveys[i].append((a, num(n)))
        cur.execute('SELECT id_partido, sigla, espectro_camara FROM partido')
        siglas, camara = {}, {}
        for i, s, c in cur.fetchall():
            siglas[i], camara[i] = s, num(c)
        cur.execute('SELECT DISTINCT id_partido, espectro_camara FROM vw_ideologia_partido WHERE espectro_camara IS NOT NULL')
        camara.update({i: num(c) for i, c in cur.fetchall()})      # nomes antigos herdam do atual
        cur.execute(SQL_VOTOS_VIES, {'anos': list(ANOS)})
        votos = cur.fetchall()
        cur.execute(SQL_PRESIDENTE, {'anos': list(ANOS)})
        presidente = cur.fetchall()

    def nota(id_partido, ano):
        opcoes = surveys.get(id_partido)
        if not opcoes:
            return None
        return min(opcoes, key=lambda o: (abs(o[0] - ano), -o[0]))[1]     # mais próxima; empate: mais recente

    # soma por território: total de votos, votos com nota, soma de votos x nota, idem Câmara e por partido
    acc = defaultdict(lambda: {'total': 0, 'com_nota': 0, 'soma': 0.0, 'cam_votos': 0, 'cam_soma': 0.0,
                               'partidos': defaultdict(int)})
    regiao_da_uf = {}
    for ano, id_partido, regiao, uf, mun, v in votos:
        regiao_da_uf[uf] = regiao
        n = nota(id_partido, ano)
        c = camara.get(id_partido)
        territorios = ['BR', regiao, uf] + ([mun] if uf in UFS_PROJETO else [])
        for terr in territorios:
            a = acc[(ano, terr)]
            a['total'] += v
            a['partidos'][id_partido] += v
            if n is not None:
                a['com_nota'] += v
                a['soma'] += v * n
                if c is not None:
                    a['cam_votos'] += v
                    a['cam_soma'] += v * c

    # presidente: votos por candidato e turno em cada território
    pres = defaultdict(lambda: defaultdict(int))          # (ano, turno, território) -> (nome, sigla, id) -> votos
    for ano, turno, nome, sigla, id_partido, regiao, uf, mun, v in presidente:
        for terr in ['BR', regiao, uf] + ([mun] if uf in UFS_PROJETO else []):
            pres[(ano, turno, terr)][(nome, sigla, id_partido)] += v

    def presidente_em(ano, terr):
        """2º turno (os dois finalistas, % dos votos válidos) e índice do 1º turno pela nota dos partidos."""
        if (ano, 1, terr) not in pres:
            return None
        t2 = pres.get((ano, 2, terr), {})
        total2 = sum(t2.values())
        finalistas = [[nome, sigla, round(100 * v / total2, 1), nota(i, ano)] for (nome, sigla, i), v in
                      sorted(t2.items(), key=lambda x: -x[1])] if total2 else []
        t1 = pres[(ano, 1, terr)]
        com_nota = [(v, nota(i, ano)) for (_, _, i), v in t1.items() if nota(i, ano) is not None]
        votos_nota = sum(v for v, _ in com_nota)
        return {'segundo_turno': finalistas,
                'indice_1turno': round(sum(v * n for v, n in com_nota) / votos_nota, 2) if votos_nota else None}

    def linha(ano, terr, a):
        indice = a['soma'] / a['com_nota'] if a['com_nota'] else None
        top = sorted(a['partidos'].items(), key=lambda x: -x[1])[:TOP_PARTIDOS]
        return [ano, terr,
                None if indice is None else round(indice, 2),
                next(nome for lim, nome in FAIXAS_VIES if indice is None or indice < lim) if indice is not None else None,
                round(a['cam_soma'] / a['cam_votos'], 1) if a['cam_votos'] else None,
                round(100 * a['cam_votos'] / a['com_nota'], 1) if a['com_nota'] else None,
                round(100 * a['com_nota'] / a['total'], 1) if a['total'] else None,
                a['total'],
                [[siglas[i], round(100 * v / a['total'], 1), nota(i, ano)] for i, v in top],
                presidente_em(ano, terr)]

    campos = ['ano', 'territorio', 'indice', 'classificacao', 'indice_camara', 'cobertura_camara_pct',
              'cobertura_especialistas_pct', 'votos', 'principais_partidos', 'presidente']
    brasil, por_uf = [], defaultdict(list)
    for (ano, terr), a in sorted(acc.items(), key=lambda x: (x[0][0], str(x[0][1]))):
        l = linha(ano, terr, a)
        if isinstance(terr, str) and len(terr) == 5 and terr.isdigit():
            por_uf[next(uf for uf in UFS_PROJETO if terr in municipios_da(conn, uf))].append(l)
        else:
            brasil.append(l)
    shutil.rmtree(DADOS / 'vies', ignore_errors=True)
    grava('vies/brasil.json', {'campos': campos, 'faixas': [[lim, nome] for lim, nome in FAIXAS_VIES],
                               'regiao_da_uf': regiao_da_uf, 'linhas': brasil})
    for uf, linhas in por_uf.items():
        grava(f'vies/municipios/{uf}.json', {'campos': campos, 'linhas': linhas})
    log(f'viés: {len(brasil)} linhas de Brasil, regiões e UFs; {sum(map(len, por_uf.values())):,} de municípios')


_MUNICIPIOS = {}


def municipios_da(conn, uf):
    if uf not in _MUNICIPIOS:
        with conn.cursor() as cur:
            cur.execute('SELECT cod_tse FROM municipio WHERE uf = %s', (uf,))
            _MUNICIPIOS[uf] = {c for (c,) in cur.fetchall()}
    return _MUNICIPIOS[uf]


PARTES = {'politicos': parte_politicos, 'mapa': parte_mapa, 'geo': parte_geo,
          'partidos': parte_partidos, 'candidatos': parte_candidatos, 'vies': parte_vies}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--partes', default=','.join(PARTES), help='lista separada por vírgula: ' + ', '.join(PARTES))
    ap.add_argument('--banco', default='dbname=eleicoes', help='banco dos seis estados')
    ap.add_argument('--nacional', default='dbname=eleicoes_nacional', help='banco com o país inteiro')
    args = ap.parse_args()
    for parte in args.partes.split(','):
        dsn = args.banco if parte in ('politicos', 'candidatos') else args.nacional
        with psycopg.connect(dsn) as conn:
            PARTES[parte](conn)


if __name__ == '__main__':
    main()
