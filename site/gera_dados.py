#!/usr/bin/env python3
"""Gera os arquivos JSON que o site lê, em site/dados/.

O site é estático: não consulta o banco. Este script roda as consultas uma vez
e grava os resultados em arquivos pequenos.

    politicos    carreiras com votos do 1º turno e índice de busca (banco dos seis estados; votos de
                 presidente do banco nacional)
    mapa         perguntas 1, 2 e 8 no Brasil, por estado e por município (banco nacional)
    geo          contornos dos estados e municípios (API de malhas do IBGE)
    partidos     medidas de ideologia e eleitos por partido (banco nacional)
    vies         pergunta 7: índice ideológico ponderado pelos votos, combinado e por cargo, no
                 Brasil, nas regiões, nas UFs e nos municípios dos seis estados (banco nacional)
    partidos_recorte  pergunta 1: cadeiras, gasto e votos dos eleitos de cada partido nos seis estados, e a
                 nota de cada partido em cada ano (banco nacional)
    candidaturas cada candidato de 2018 a 2024 dos seis estados e a presidente, por unidade eleitoral e
                 ano, com votos e dinheiro (banco nacional; nomes do banco dos seis estados)
    legenda      pergunta 5: eleitos das eleições proporcionais dos seis estados, quociente
                 eleitoral e quem entrou pela legenda (banco dos seis estados)
    dependencia  pergunta 8: candidatos e eleitos por fatia de 5% de dinheiro público na receita, para
                 presidente e nos seis estados e seus municípios (banco nacional)
    propaganda   pergunta 9: gasto por tipo de despesa e palavras das descrições, por recorte
                 (banco nacional) e por candidatura dos políticos com nome (banco dos seis estados)

Uso (com o ambiente de banco/.venv):
    ../banco/.venv/bin/python gera_dados.py                 # tudo
    ../banco/.venv/bin/python gera_dados.py --partes politicos
Bancos: --banco (padrão dbname=eleicoes) e --nacional (padrão dbname=eleicoes_nacional).

Título eleitoral, CPF e data de nascimento não saem do banco: cada político
recebe um número sequencial próprio.
"""
import argparse
import csv
import functools
import gzip
import json
import re
import shutil
import time
import unicodedata
import urllib.request
from collections import Counter, defaultdict
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
     des AS (SELECT sq_candidato, SUM(valor) AS total FROM despesa GROUP BY 1),
     vot AS (SELECT sq_candidato, SUM(votos) FILTER (WHERE turno = 1) AS v1 FROM votos_cand GROUP BY 1)
SELECT v.titulo_eleitoral, v.sq_candidato, v.ano, v.cargo, v.ue, COALESCE(m.uf, v.ue) AS uf,
       v.id_partido, v.situacao_final, v.eleito, v.reeleicao,
       CASE WHEN v.ano >= 2018 THEN COALESCE(b.total, 0) END AS patrimonio,
       r.total, r.publica, d.total, vo.v1
FROM vw_candidatura v
LEFT JOIN municipio m ON m.cod_tse = v.ue
LEFT JOIN bens b ON b.sq_candidato = v.sq_candidato
LEFT JOIN rec r  ON r.sq_candidato = v.sq_candidato
LEFT JOIN des d  ON d.sq_candidato = v.sq_candidato
LEFT JOIN vot vo ON vo.sq_candidato = v.sq_candidato
ORDER BY v.titulo_eleitoral, v.ano, v.cargo
"""

# Cada candidatura é uma lista nesta ordem. cargo, partido e situação são índices das
# listas de tabelas.json; local é a UF (cargos estaduais), BR (presidente) ou o código
# do município; os valores em reais são inteiros; votos são os do 1º turno (carregados de 2018 em
# diante); campos vazios no fim são omitidos.
CAMPOS_CANDIDATURA = ['ano', 'cargo', 'local', 'partido', 'situacao', 'reeleicao', 'foto_sq',
                      'patrimonio', 'receita', 'receita_publica', 'despesa', 'votos']
# foto_sq (antes do dinheiro, que só existe de 2018 em diante, para as candidaturas antigas não gravarem vazios):
# o número do candidato no TSE, com que o site monta o endereço da foto (ano/foto_sq/local). De 2018 em
# diante é o sq_candidato do banco; de 2004 a 2016, o banco guarda um número sintético (o do TSE se repete entre
# candidaturas), e o número vem dos arquivos de candidatos que o crawler baixou (ver le_arquivos_tse).
# votos de presidente vêm do banco nacional: o dos seis estados só tem a apuração deles
SQL_VOTOS_PRESIDENTE = """
SELECT c.sq_candidato, SUM(v.votos) FILTER (WHERE v.turno = 1)
FROM candidatura c JOIN votos_cand v ON v.sq_candidato = c.sq_candidato
WHERE c.cargo = 'PRESIDENTE'
GROUP BY 1
"""
# Ficha de busca: o suficiente para listar e distinguir homônimos. foto é "ano/número no TSE/ue"
# da candidatura mais recente com foto (de 2004 em diante; ver foto_sq), com que o site monta o
# endereço da foto no DivulgaCandContas do TSE; fica vazia para quem não tem.
CAMPOS_FICHA = ['nome', 'uf', 'ultimo_cargo', 'primeiro_ano', 'ultimo_ano', 'vitorias', 'foto']
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


# Arquivos de candidatos do TSE, baixados pelo crawler. Só servem às fotos de 2004 a 2016: são as eleições
# antigas que o sistema de fotos do TSE (DivulgaCandContas) ainda tem.
PASTA_CANDIDATOS_TSE = Path(__file__).resolve().parents[1] / 'crawler' / 'dados' / 'tse' / 'candidatos'
ANOS_FOTO_ANTIGA = range(2004, 2017, 2)
NULOS_TSE = {'', '#NULO#', '#NULO', '#NE#', '#NE', '-1', '-3', '-4'}


def _nulo(t):
    t = (t or '').strip()
    return None if t in NULOS_TSE else t


def chave_da_foto_antiga(linha):
    """Uma linha de consulta_cand_<ano>_BRASIL.csv vira ((ano, UE, cargo, título), número no TSE), com as mesmas
    normalizações de banco/carga.py (stg.nulo, stg.cargo, stg.ordinaria, UE e título com zeros à esquerda). None
    para eleição suplementar, linha fora dos seis estados (presidente entra) ou sem número, título ou cargo."""
    tipo = linha.get('NM_TIPO_ELEICAO') or ''
    if not re.search('ordin', tipo, re.I) or re.search('extra', tipo, re.I):
        return None
    ue, uf = _nulo(linha.get('SG_UE')), _nulo(linha.get('SG_UF'))
    if not ue or (ue.upper() != 'BR' and uf not in UFS_PROJETO):
        return None
    sq, titulo = _nulo(linha.get('SQ_CANDIDATO')), _nulo(linha.get('NR_TITULO_ELEITORAL_CANDIDATO'))
    cargo, ano = _nulo(linha.get('DS_CARGO')), _nulo(linha.get('ANO_ELEICAO'))
    if not (sq and re.fullmatch(r'\d{1,18}', sq) and titulo and re.fullmatch(r'\d{5,12}', titulo) and cargo and ano):
        return None
    ue = ue.zfill(5) if re.fullmatch(r'\d{1,5}', ue) else ue.upper()
    cargo = {'1. SUPLENTE': '1º SUPLENTE', '2. SUPLENTE': '2º SUPLENTE'}.get(cargo.upper(), cargo.upper())
    return (int(ano), ue, cargo, titulo.zfill(12)), int(sq)


# 1994 e 1996: o TSE não publica título eleitoral nem CPF, então essas candidaturas não entram no banco. O gerador
# as liga aos políticos pelo nome e pela data de nascimento, comparando com todas as grafias de nome que cada
# título usou de 1998 em diante; quem casa com mais de um título, ou com nenhum, fica de fora.
ANOS_SEM_TITULO = (1994, 1996)
ANOS_COM_TITULO = range(1998, 2025, 2)
ELEITO_TSE = {'ELEITO', 'ELEITO POR QP', 'ELEITO POR MÉDIA'}


def chave_de_pessoa(nome, nascimento):
    """(nome sem acentos, maiúsculo, só letras; data de nascimento AAAA-MM-DD), ou None sem nome ou data válida."""
    m = re.fullmatch(r'(\d{2})/(\d{2})/(\d{4})', _nulo(nascimento) or '')
    texto = unicodedata.normalize('NFKD', _nulo(nome) or '').encode('ascii', 'ignore').decode().upper()
    nome = ' '.join(re.sub(r'[^A-Z]+', ' ', texto).split())
    return (nome, f'{m[3]}-{m[2]}-{m[1]}') if m and nome else None


def candidatura_antiga(linha):
    """Uma linha de 1994 ou 1996, nos seis estados (ou presidente), com as normalizações da carga; None fora disso."""
    tipo = linha.get('NM_TIPO_ELEICAO') or ''
    if not re.search('ordin', tipo, re.I) or re.search('extra', tipo, re.I):
        return None
    ue, uf = _nulo(linha.get('SG_UE')), _nulo(linha.get('SG_UF'))
    if not ue or (ue.upper() != 'BR' and uf not in UFS_PROJETO):
        return None
    pessoa = chave_de_pessoa(linha.get('NM_CANDIDATO'), linha.get('DT_NASCIMENTO'))
    cargo, numero, sigla = _nulo(linha.get('DS_CARGO')), _nulo(linha.get('NR_PARTIDO')), _nulo(linha.get('SG_PARTIDO'))
    if not (pessoa and cargo and numero and numero.isdigit() and sigla):
        return None
    situacao = _nulo(linha.get('DS_SIT_TOT_TURNO'))
    situacao = 'ELEITO POR MÉDIA' if situacao and situacao.upper() == 'MÉDIA' else situacao and situacao.upper()
    return {'ano': int(linha['ANO_ELEICAO']), 'turno': int(_nulo(linha.get('NR_TURNO')) or 1), 'uf': uf,
            'ue': ue.zfill(5) if re.fullmatch(r'\d{1,5}', ue) else ue.upper(),
            'cargo': {'1. SUPLENTE': '1º SUPLENTE', '2. SUPLENTE': '2º SUPLENTE'}.get(cargo.upper(), cargo.upper()),
            'numero': int(numero), 'sigla': sigla.upper(), 'situacao': situacao, 'pessoa': pessoa}


def liga_candidaturas_antigas(candidaturas, titulos):
    """título -> candidaturas antigas dele, uma por (ano, UE, cargo), com os atributos do 1º turno e a situação do
    último. `titulos`: (nome, nascimento) -> títulos com esse nome e nascimento de 1998 em diante."""
    grupos = defaultdict(list)
    for c in candidaturas:
        grupos[(c['ano'], c['ue'], c['cargo'], c['pessoa'])].append(c)
    ligadas = defaultdict(list)
    for (_, _, _, pessoa), cs in grupos.items():
        ts = titulos.get(pessoa, ())
        if len(ts) != 1:
            continue
        cs.sort(key=lambda c: c['turno'])
        ligadas[next(iter(ts))].append({**cs[0], 'situacao': cs[-1]['situacao']})
    for cs in ligadas.values():
        cs.sort(key=lambda c: (c['ano'], c['cargo']))
    return dict(ligadas)


def le_arquivos_tse():
    """Lê uma vez os arquivos de candidatos que o crawler baixou e devolve (números de foto de 2004 a 2016, como em
    chave_da_foto_antiga; candidaturas de 1994 e 1996 ligadas por título). Sem os arquivos, os dois vêm vazios: o
    site sai igual, só sem essas fotos e candidaturas. Títulos só casam as linhas; não vão para os dados do site."""
    fotos, titulos, antigas = {}, defaultdict(set), []
    for ano in (*ANOS_SEM_TITULO, *ANOS_COM_TITULO):
        arquivo = PASTA_CANDIDATOS_TSE / str(ano) / f'consulta_cand_{ano}_BRASIL.csv'
        if not arquivo.exists():
            log(f'políticos: sem {arquivo.name}; {ano} fica sem fotos antigas ou sem ligação por nome')
            continue
        with open(arquivo, encoding='latin-1', newline='') as f:
            for linha in csv.DictReader(f, delimiter=';'):
                if ano in ANOS_SEM_TITULO:
                    c = candidatura_antiga(linha)
                    if c:
                        antigas.append(c)
                    continue
                if ano in ANOS_FOTO_ANTIGA:
                    par = chave_da_foto_antiga(linha)
                    if par:
                        fotos[par[0]] = par[1]
                ue, uf = _nulo(linha.get('SG_UE')), _nulo(linha.get('SG_UF'))
                titulo = _nulo(linha.get('NR_TITULO_ELEITORAL_CANDIDATO'))
                pessoa = chave_de_pessoa(linha.get('NM_CANDIDATO'), linha.get('DT_NASCIMENTO'))
                if pessoa and titulo and re.fullmatch(r'\d{5,12}', titulo) and ue and (ue.upper() == 'BR' or uf in UFS_PROJETO):
                    titulos[pessoa].add(titulo.zfill(12))
    return fotos, liga_candidaturas_antigas(antigas, titulos)


def parte_politicos(nacional, conn):
    log('políticos: lendo nomes e candidaturas')
    cargos, situacoes = Tabela(), Tabela()
    fotos_antigas, antigas = le_arquivos_tse()
    log(f'políticos: {len(fotos_antigas):,} números de foto de 2004 a 2016 nos arquivos do TSE; candidaturas de 1994 e '
        f'1996 ligadas pelo nome e nascimento a {len(antigas):,} políticos')
    with nacional.cursor() as cur:
        cur.execute(SQL_VOTOS_PRESIDENTE)
        votos_presidente = dict(cur.fetchall())
    with conn.cursor() as cur:
        cur.execute('SELECT titulo_eleitoral, nome FROM politico ORDER BY nome, titulo_eleitoral')
        politicos = cur.fetchall()
        cur.execute("SELECT cod_tse, nome || ' (' || uf || ')' FROM municipio")
        municipios = dict(cur.fetchall())
        cur.execute('SELECT id_partido, sigla, numero FROM partido ORDER BY id_partido')
        linhas_partido = cur.fetchall()
        partidos = {i: sigla for i, sigla, _ in linhas_partido}
        # 1994 e 1996: o partido pelo número e sigla; os que já não existiam em 1998 ganham um código só do site
        id_partido_de = {(numero, sigla): i for i, sigla, numero in linhas_partido}
        proximo_id = max(partidos, default=0) + 1
        # notas ideológicas por partido e ano: "id_partido|ano" -> [especialistas, câmara]
        cur.execute('SELECT id_partido, ano, nota_especialistas, espectro_camara FROM vw_ideologia_partido '
                    'WHERE nota_especialistas IS NOT NULL OR espectro_camara IS NOT NULL')
        notas = {f'{i}|{a}': [num(e), num(c)] for i, a, e, c in cur.fetchall()}
        cur.execute(SQL_CANDIDATURAS)
        por_titulo = defaultdict(list)
        fotos = {}                                       # título -> foto da candidatura mais recente
        for (titulo, sq, ano, cargo, local, uf, id_partido, situacao, eleito, reel,
             patrimonio, receita, publica, despesa, votos) in cur:
            if cargo == 'PRESIDENTE':
                votos = votos_presidente.get(sq, votos)
            foto_sq = sq if sq > 0 else fotos_antigas.get((ano, local, cargo, titulo))
            linha = [ano, cargos(cargo), local, id_partido, situacoes(situacao or 'SEM SITUAÇÃO'), int(reel), foto_sq,
                     inteiro(patrimonio), inteiro(receita), inteiro(publica), inteiro(despesa), votos]
            por_titulo[titulo].append((uf, bool(eleito), sem_vazios_no_fim(linha)))
            if foto_sq:
                fotos[titulo] = f'{ano}/{foto_sq}/{local}'          # a mais recente fica (linhas em ordem de ano)

    # as candidaturas de 1994 e 1996 entram no começo da carreira de quem já tem candidatura de 1998 em diante
    n_antigas = 0
    for titulo, cs in antigas.items():
        if titulo not in por_titulo:
            continue
        linhas = []
        for c in cs:
            chave = (c['numero'], c['sigla'])
            if chave not in id_partido_de:
                id_partido_de[chave], partidos[proximo_id] = proximo_id, c['sigla']
                proximo_id += 1
            linha = [c['ano'], cargos(c['cargo']), c['ue'], id_partido_de[chave], situacoes(c['situacao'] or 'SEM SITUAÇÃO'), 0]
            linhas.append((c['uf'], c['situacao'] in ELEITO_TSE, linha))
        por_titulo[titulo] = linhas + por_titulo[titulo]
        n_antigas += len(linhas)
    log(f'políticos: {n_antigas:,} candidaturas de 1994 e 1996 acrescentadas às carreiras')

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
                                               sum(e for _, e, _ in cands), fotos.get(titulo)]
        carreiras[(pid - 1) // POR_ARQUIVO][pid] = [nome, [c for _, _, c in cands], fotos.get(titulo)]
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


# --------------------------------------------------------------------------- candidaturas (cada candidato de um recorte)

# Cada candidato de 2018 a 2024, um arquivo por unidade eleitoral e ano: com nome, número público e foto nos
# seis estados e para presidente; anônimo nas demais UFs.
CAMPOS_CANDIDATURAS_RECORTE = ['ano', 'cargo', 'partido', 'unidade', 'eleito', 'situacao', 'votos', 'votos_2t',
                               'despesa', 'receita', 'receita_publica', 'patrimonio', 'nome', 'pid', 'foto']
DINHEIRO = ('despesa', 'receita', 'receita_publica', 'patrimonio')

SQL_CANDIDATURAS_RECORTE = """
WITH alvo AS (
    SELECT v.sq_candidato, v.titulo_eleitoral, v.ano, v.cargo, v.ue, v.coligacao, v.situacao_final, v.eleito,
           p.sigla, CASE WHEN length(v.ue) = 2 THEN v.ue ELSE m.uf END AS uf
    FROM vw_candidatura v
    JOIN partido p ON p.id_partido = v.id_partido
    LEFT JOIN municipio m ON m.cod_tse = v.ue
    WHERE v.ano = ANY(%(anos)s) AND (v.ue = 'BR' OR v.ue = ANY(%(ufs)s) OR m.uf = ANY(%(ufs)s))
),
votos AS (SELECT vc.sq_candidato, SUM(vc.votos) FILTER (WHERE vc.turno = 1) AS v1,
                 SUM(vc.votos) FILTER (WHERE vc.turno = 2) AS v2
          FROM votos_cand vc JOIN alvo a USING (sq_candidato) GROUP BY 1),
des AS (SELECT d.sq_candidato, SUM(d.valor) AS total FROM despesa d JOIN alvo a USING (sq_candidato) GROUP BY 1),
rec AS (SELECT r.sq_candidato, SUM(r.valor) AS total,
               SUM(r.valor) FILTER (WHERE UPPER(r.fonte) LIKE 'FUNDO%%') AS publica
        FROM receita r JOIN alvo a USING (sq_candidato) GROUP BY 1),
bens AS (SELECT b.sq_candidato, SUM(b.valor) AS total FROM bem b JOIN alvo a USING (sq_candidato) GROUP BY 1)
SELECT a.sq_candidato, a.titulo_eleitoral, a.ano, a.cargo, a.ue, a.uf, a.sigla, a.coligacao,
       a.situacao_final, a.eleito, vo.v1, vo.v2, des.total, rec.total, rec.publica, COALESCE(bens.total, 0)
FROM alvo a
LEFT JOIN votos vo ON vo.sq_candidato = a.sq_candidato
LEFT JOIN des  ON des.sq_candidato = a.sq_candidato
LEFT JOIN rec  ON rec.sq_candidato = a.sq_candidato
LEFT JOIN bens ON bens.sq_candidato = a.sq_candidato
ORDER BY a.ue, a.ano, a.cargo, a.sq_candidato
"""


def territorios_do_projeto(ue, uf):
    """Onde uma candidatura entra nos dados das páginas com seletor: presidente (unidade BR) só no Brasil; os
    demais cargos só nos seis estados do projeto, na UF e, se for municipal, no município."""
    if ue == 'BR':
        return ['BR']
    if uf not in UFS_PROJETO:
        return []
    return [uf] + ([ue] if len(ue) == 5 else [])


def unidade_de(coligacao, sigla):
    """A unidade que recebe as cadeiras: a coligação ou federação, ou o próprio partido quando concorre só."""
    return sigla if not coligacao or coligacao == sigla else coligacao


def fatia_de(ue, ano):
    return f'candidaturas/{ue}-{ano}.json'


def linha_candidatura(r, nomeado):
    """Uma candidatura na ordem de CAMPOS_CANDIDATURAS_RECORTE, com reais inteiros e vazios do fim cortados.
    Sem nome, número público e foto quando não é nomeado."""
    campos = CAMPOS_CANDIDATURAS_RECORTE if nomeado else CAMPOS_CANDIDATURAS_RECORTE[:CAMPOS_CANDIDATURAS_RECORTE.index('nome')]
    return sem_vazios_no_fim([inteiro(r.get(c)) if c in DINHEIRO else r.get(c) for c in campos])


def mapa_pid(conn):
    """Título eleitoral -> número público do político, na mesma ordem de parte_politicos."""
    with conn.cursor() as cur:
        cur.execute('SELECT titulo_eleitoral, nome FROM politico ORDER BY nome, titulo_eleitoral')
        return {t: (pid, nome) for pid, (t, nome) in enumerate(cur.fetchall(), start=1)}


def parte_candidaturas(nacional, seis):
    log('candidaturas: lendo candidatos de 2018 a 2024 (banco nacional)')
    pids = mapa_pid(seis)
    with nacional.cursor() as cur:
        cur.execute(SQL_CANDIDATURAS_RECORTE, {'anos': list(ANOS), 'ufs': list(UFS_PROJETO)})
        linhas = cur.fetchall()
    cargos = list(CARGOS_MAPA)
    arquivos = defaultdict(lambda: {'partidos': Tabela(), 'unidades': Tabela(), 'situacoes': Tabela(), 'linhas': []})
    nomeados = anonimos = 0
    for (sq, titulo, ano, cargo, ue, uf, sigla, coligacao, situacao, eleito,
         v1, v2, despesa, receita, publica, patrimonio) in linhas:
        if cargo not in cargos:
            continue
        arq = arquivos[(ue, ano)]
        nomeado = bool(territorios_do_projeto(ue, uf)) and titulo in pids
        pid, nome = pids.get(titulo, (None, None)) if nomeado else (None, None)
        r = {'ano': ano, 'cargo': cargos.index(cargo), 'partido': arq['partidos'](sigla),
             'unidade': arq['unidades'](unidade_de(coligacao, sigla)), 'eleito': bool(eleito),
             'situacao': arq['situacoes'](situacao or 'SEM SITUAÇÃO'), 'votos': v1, 'votos_2t': v2,
             'despesa': num(despesa), 'receita': num(receita), 'receita_publica': num(publica),
             'patrimonio': num(patrimonio), 'nome': nome, 'pid': pid, 'foto': f'{ano}/{sq}/{ue}' if sq > 0 else None}
        arq['linhas'].append(linha_candidatura(r, nomeado))
        nomeados += nomeado
        anonimos += not nomeado
    shutil.rmtree(DADOS / 'candidaturas', ignore_errors=True)
    maior = 0
    for (ue, ano), arq in arquivos.items():
        maior = max(maior, grava(fatia_de(ue, ano), {
            'campos': CAMPOS_CANDIDATURAS_RECORTE, 'cargos': cargos, 'partidos': arq['partidos'].lista,
            'unidades': arq['unidades'].lista, 'situacoes': arq['situacoes'].lista, 'linhas': arq['linhas']}))
    log(f'candidaturas: {nomeados:,} com nome e {anonimos:,} anônimas em {len(arquivos):,} arquivos; '
        f'{tamanho_pasta(DADOS / "candidaturas") / 1e6:.1f} MB, maior arquivo {maior / 1e3:.0f} kB')


# --------------------------------------------------------------------------- legenda (pergunta 5)

# Eleitos das eleições proporcionais dos seis estados, por unidade eleitoral: deputados federais e
# estaduais por UF (2018 e 2022) e vereadores por município (2020 e 2024), com os votos nominais, o
# quociente eleitoral e a coligação ou federação que recebeu as cadeiras. Mesma regra de
# banco/sql/p05_eleitos_legenda.sql: eleito por QP ou média com votação nominal abaixo do quociente.
CARGOS_PROPORCIONAIS = ('VEREADOR', 'DEPUTADO ESTADUAL', 'DEPUTADO FEDERAL', 'DEPUTADO DISTRITAL')

# Três consultas simples, juntadas em Python: juntar tudo numa só fazia o PostgreSQL varrer a apuração
# inteira para cada candidatura.
SQL_LEGENDA_ELEITOS = """
SELECT c.cod_eleicao, c.ano, c.cargo, c.ue, c.sq_candidato, c.titulo_eleitoral, pa.sigla, c.coligacao,
       c.situacao_final, (SELECT SUM(v.votos) FROM votos_cand v WHERE v.sq_candidato = c.sq_candidato AND v.turno = 1)
FROM vw_candidatura c
JOIN partido pa ON pa.id_partido = c.id_partido
WHERE c.situacao_final IN ('ELEITO POR QP', 'ELEITO POR MÉDIA')
  AND c.ano = ANY(%(anos)s) AND c.cargo = ANY(%(cargos)s)
"""
SQL_LEGENDA_VALIDOS = """
SELECT a.cod_eleicao, a.cargo, CASE e.abrangencia WHEN 'MUNICIPAL' THEN a.cod_tse ELSE m.uf::VARCHAR END AS ue,
       SUM(a.validos)
FROM apuracao a
JOIN eleicao e ON e.cod_eleicao = a.cod_eleicao
JOIN municipio m ON m.cod_tse = a.cod_tse
WHERE a.turno = 1 AND a.cargo = ANY(%(cargos)s) AND e.ano = ANY(%(anos)s)
GROUP BY 1, 2, 3
"""
SQL_LEGENDA_VAGAS = """
SELECT vg.cod_eleicao, vg.cargo, vg.ue, vg.qt_vagas FROM vaga vg JOIN eleicao e USING (cod_eleicao)
WHERE vg.cargo = ANY(%(cargos)s) AND e.ano = ANY(%(anos)s)
"""

# Os votos de cada chapa (partido, coligação ou federação) no 1º turno: os nominais de todos os seus candidatos e os
# de legenda. É o que a chapa tem para encher as cadeiras; o que os eleitos não usaram vem dos colegas sem cadeira e
# da legenda. A chapa de cada partido sai das candidaturas do mesmo ano, cargo e unidade eleitoral.
SQL_LEGENDA_CHAPAS = """
WITH votos AS (
    SELECT vp.cod_eleicao, vp.cargo, CASE e.abrangencia WHEN 'MUNICIPAL' THEN vp.cod_tse ELSE m.uf::VARCHAR END AS ue,
           vp.id_partido, SUM(vp.votos_nominais) AS nominais, SUM(vp.votos_legenda) AS legenda
    FROM votos_part vp
    JOIN eleicao e ON e.cod_eleicao = vp.cod_eleicao
    JOIN municipio m ON m.cod_tse = vp.cod_tse
    WHERE vp.turno = 1 AND vp.cargo = ANY(%(cargos)s) AND e.ano = ANY(%(anos)s)
    GROUP BY 1, 2, 3, 4
),
chapas AS (
    -- pelo número do partido, não pelo código nem pela sigla: em 2018 o Patriota é "PATRI" nos votos e
    -- "PATRIOTA" nas candidaturas, com códigos diferentes no banco, mas o mesmo número 51
    SELECT DISTINCT ON (v.cod_eleicao, v.cargo, v.ue, pa.numero) v.cod_eleicao, v.cargo, v.ue, pa.numero, pa.sigla, v.coligacao
    FROM vw_candidatura v
    JOIN partido pa ON pa.id_partido = v.id_partido
    WHERE v.ano = ANY(%(anos)s) AND v.cargo = ANY(%(cargos)s)
    ORDER BY v.cod_eleicao, v.cargo, v.ue, pa.numero, v.coligacao NULLS LAST
)
SELECT v.cod_eleicao, v.cargo, v.ue, COALESCE(c.sigla, pa.sigla), c.coligacao, v.nominais, v.legenda
FROM votos v
JOIN partido pa ON pa.id_partido = v.id_partido
LEFT JOIN chapas c ON c.cod_eleicao = v.cod_eleicao AND c.cargo = v.cargo AND c.ue = v.ue AND c.numero = pa.numero
"""


def quociente_eleitoral(validos, vagas):
    """Votos válidos ÷ vagas, desprezada a fração igual ou inferior a meio: CEIL(v / vagas − 0,5),
    em aritmética inteira para não depender de arredondamento de ponto flutuante."""
    num, den = 2 * validos - vagas, 2 * vagas
    return -(-num // den)


def parte_legenda(conn):
    log('legenda: eleitos das proporcionais com o quociente eleitoral')
    pids = mapa_pid(conn)
    params = {'anos': list(ANOS), 'cargos': list(CARGOS_PROPORCIONAIS)}
    with conn.cursor() as cur:
        cur.execute(SQL_LEGENDA_VALIDOS, params)
        validos_de = {(e, c, u): int(v) for e, c, u, v in cur.fetchall()}
        cur.execute(SQL_LEGENDA_VAGAS, params)
        vagas_de = {(e, c, u): int(v) for e, c, u, v in cur.fetchall()}
        cur.execute(SQL_LEGENDA_ELEITOS, params)
        eleitos = cur.fetchall()
        cur.execute(SQL_LEGENDA_CHAPAS, params)
        votos_das_chapas = cur.fetchall()
    linhas = sorted(((ano, cargo, ue, validos_de[(ce, cargo, ue)], vagas_de[(ce, cargo, ue)], sq, titulo, sigla, coligacao,
                      situacao, votos)
                     for ce, ano, cargo, ue, sq, titulo, sigla, coligacao, situacao, votos in eleitos
                     if votos is not None and (ce, cargo, ue) in validos_de and (ce, cargo, ue) in vagas_de),
                    key=lambda l: (l[2], l[0], l[1], -l[10]))
    arquivos = defaultdict(lambda: {'anos': defaultdict(dict), 'unidades': Tabela()})
    resumo = defaultdict(lambda: [0, 0])                 # (ano, cargo, uf, sigla) -> [eleitos, pela legenda]
    for ano, cargo, ue, validos, vagas, sq, titulo, sigla, coligacao, situacao, votos in linhas:
        arq = arquivos[ue]
        recorte = arq['anos'][ano].setdefault(cargo, None)
        if recorte is None:
            recorte = arq['anos'][ano][cargo] = {'validos': int(validos), 'vagas': int(vagas),
                                                 'quociente': quociente_eleitoral(int(validos), int(vagas)), 'eleitos': []}
        pid, nome = pids.get(titulo, (None, None))
        recorte['eleitos'].append([pid, nome, sigla, arq['unidades'](unidade_de(coligacao, sigla)), int(votos),
                                   'QP' if situacao == 'ELEITO POR QP' else 'MEDIA', f'{ano}/{sq}/{ue}' if sq > 0 else None])
        uf = ue if len(ue) == 2 else None
        resumo[(ano, cargo, uf or ue, sigla)][0] += 1
        resumo[(ano, cargo, uf or ue, sigla)][1] += int(votos) < recorte['quociente']
    # os votos de cada chapa, nos recortes que têm eleitos: [unidade, nominais de todos os candidatos, legenda]
    ano_de = {ce: ano for ce, ano, *_ in eleitos}
    somas = defaultdict(lambda: [0, 0])
    for ce, cargo, ue, sigla, coligacao, nominais, legenda in votos_das_chapas:
        ano = ano_de.get(ce)
        recorte = arquivos[ue]['anos'][ano].get(cargo) if ue in arquivos and ano in arquivos[ue]['anos'] else None
        if recorte is None:
            continue
        x = somas[(ue, ano, cargo, arquivos[ue]['unidades'](unidade_de(coligacao, sigla)))]
        x[0] += int(nominais); x[1] += int(legenda)
    for (ue, ano, cargo, unidade), (nominais, legenda) in sorted(somas.items()):
        arquivos[ue]['anos'][ano][cargo].setdefault('chapas', []).append([unidade, nominais, legenda])

    shutil.rmtree(DADOS / 'legenda', ignore_errors=True)
    for ue, arq in arquivos.items():
        grava(f'legenda/{ue}.json', {'anos': arq['anos'], 'unidades': arq['unidades'].lista,
                                     'campos_eleito': ['pid', 'nome', 'partido', 'unidade', 'votos', 'situacao', 'foto']})
    # resumo dos seis estados por partido, ano e cargo (municípios somados na UF deles)
    with conn.cursor() as cur:
        cur.execute('SELECT cod_tse, uf FROM municipio')
        uf_do = dict(cur.fetchall())
    total = defaultdict(lambda: [0, 0])
    for (ano, cargo, onde, sigla), (n, leg) in resumo.items():
        chave = (ano, cargo, onde if len(onde) == 2 else uf_do.get(onde, onde), sigla)
        total[chave][0] += n
        total[chave][1] += leg
    grava('legenda/resumo.json', {'campos': ['ano', 'cargo', 'uf', 'partido', 'eleitos', 'por_legenda'],
                                  'linhas': [[*k, n, leg] for k, (n, leg) in sorted(total.items())]})
    log(f'legenda: {len(linhas):,} eleitos em {len(arquivos):,} unidades; {tamanho_pasta(DADOS / "legenda") / 1e6:.1f} MB')


# --------------------------------------------------------------------------- viés ideológico (pergunta 7)

# Mesma regra da consulta sql/p07_vies_ideologico.sql: votos nominais e de legenda do 1º turno
# para vereador (anos municipais) e deputado federal (anos gerais); nota de cada partido da edição
# do survey mais próxima do ano; partidos sem nota ficam fora da média.
# Votos de cada partido por cargo e município no 1º turno (nominais e de legenda). O índice "COMBINADO"
# usa vereador nos anos municipais e deputado federal nos gerais; os demais cargos têm índice próprio.
CARGOS_VIES = ('PRESIDENTE', 'GOVERNADOR', 'SENADOR', 'DEPUTADO FEDERAL', 'DEPUTADO ESTADUAL',
               'DEPUTADO DISTRITAL', 'PREFEITO', 'VEREADOR')
CARGOS_COMBINADO = ('VEREADOR', 'DEPUTADO FEDERAL')
SQL_VOTOS_VIES = """
SELECT e.ano, vp.cargo, vp.id_partido, m.regiao, m.uf, vp.cod_tse, SUM(vp.votos_nominais + vp.votos_legenda)
FROM votos_part vp
JOIN eleicao e   ON e.cod_eleicao = vp.cod_eleicao
JOIN municipio m ON m.cod_tse = vp.cod_tse
WHERE vp.turno = 1 AND vp.cargo = ANY(%(cargos)s) AND e.ano = ANY(%(anos)s)
GROUP BY 1, 2, 3, 4, 5, 6
"""


def indice_ponderado(votos_por_partido, notas):
    """Média das notas dos partidos ponderada pelos votos, só com os partidos que têm nota.
    Devolve (índice ou None, % dos votos que tinham nota)."""
    total = sum(votos_por_partido.values())
    com_nota = {i: v for i, v in votos_por_partido.items() if notas.get(i) is not None}
    votos_nota = sum(com_nota.values())
    if not votos_nota:
        return None, 0.0
    return sum(v * notas[i] for i, v in com_nota.items()) / votos_nota, 100 * votos_nota / total


def slug_cargo(cargo):
    return cargo.lower().replace(' ', '-')
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


def nota_mais_proxima(surveys):
    """surveys: {id_partido: [(ano da pesquisa, nota)]}. Devolve nota(id_partido, ano): a nota da pesquisa
    mais próxima do ano; no empate, a mais recente; None sem pesquisa."""
    def nota(id_partido, ano):
        opcoes = surveys.get(id_partido)
        if not opcoes:
            return None
        return min(opcoes, key=lambda o: (abs(o[0] - ano), -o[0]))[1]
    return nota


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
        cur.execute(SQL_VOTOS_VIES, {'anos': list(ANOS), 'cargos': list(CARGOS_VIES)})
        votos = cur.fetchall()
        cur.execute(SQL_PRESIDENTE, {'anos': list(ANOS)})
        presidente = cur.fetchall()

    nota = nota_mais_proxima(surveys)

    # soma por território: total de votos, votos com nota, soma de votos x nota, idem Câmara e por partido
    acc = defaultdict(lambda: {'total': 0, 'com_nota': 0, 'soma': 0.0, 'cam_votos': 0, 'cam_soma': 0.0,
                               'partidos': defaultdict(int)})
    regiao_da_uf = {}
    for ano, cargo, id_partido, regiao, uf, mun, v in votos:
        regiao_da_uf[uf] = regiao
        n = nota(id_partido, ano)
        c = camara.get(id_partido)
        territorios = ['BR', regiao, uf] + ([mun] if uf in UFS_PROJETO else [])
        chaves = [(cargo, terr) for terr in territorios]
        if cargo in CARGOS_COMBINADO:
            chaves += [('COMBINADO', terr) for terr in territorios]
        for cg, terr in chaves:
            a = acc[(ano, cg, terr)]
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

    def linha(ano, cargo, terr, a, top_partidos=TOP_PARTIDOS):
        indice, _ = indice_ponderado(a['partidos'], {i: nota(i, ano) for i in a['partidos']})
        top = sorted(a['partidos'].items(), key=lambda x: (-x[1], siglas[x[0]]))[:top_partidos]
        return [ano, terr,
                None if indice is None else round(indice, 2),
                next(nome for lim, nome in FAIXAS_VIES if indice is None or indice < lim) if indice is not None else None,
                round(a['cam_soma'] / a['cam_votos'], 1) if a['cam_votos'] else None,
                round(100 * a['cam_votos'] / a['com_nota'], 1) if a['com_nota'] else None,
                round(100 * a['com_nota'] / a['total'], 1) if a['total'] else None,
                a['total'],
                [[siglas[i], round(100 * v / a['total'], 1), nota(i, ano)] for i, v in top],
                presidente_em(ano, terr) if cargo in ('COMBINADO', 'PRESIDENTE') else None,
                cargo]

    campos = ['ano', 'territorio', 'indice', 'classificacao', 'indice_camara', 'cobertura_camara_pct',
              'cobertura_especialistas_pct', 'votos', 'principais_partidos', 'presidente', 'cargo']
    brasil, por_uf = [], defaultdict(list)
    for (ano, cargo, terr), a in sorted(acc.items(), key=lambda x: (x[0][0], x[0][1], str(x[0][2]))):
        if isinstance(terr, str) and len(terr) == 5 and terr.isdigit():
            uf = next(u for u in UFS_PROJETO if terr in municipios_da(conn, u))
            # municípios: o combinado no arquivo de sempre; cada cargo no seu, com menos partidos por linha
            por_uf[(uf, cargo)].append(linha(ano, cargo, terr, a, top_partidos=TOP_PARTIDOS if cargo == 'COMBINADO' else 3))
        else:
            brasil.append(linha(ano, cargo, terr, a))
    shutil.rmtree(DADOS / 'vies', ignore_errors=True)
    grava('vies/brasil.json', {'campos': campos, 'faixas': [[lim, nome] for lim, nome in FAIXAS_VIES],
                               'regiao_da_uf': regiao_da_uf, 'cargos': ['COMBINADO', *CARGOS_VIES], 'linhas': brasil})
    for (uf, cargo), linhas in por_uf.items():
        nome = f'vies/municipios/{uf}.json' if cargo == 'COMBINADO' else f'vies/municipios/{uf}-{slug_cargo(cargo)}.json'
        grava(nome, {'campos': campos, 'linhas': linhas})
    log(f'viés: {len(brasil)} linhas de Brasil, regiões e UFs; {sum(map(len, por_uf.values())):,} de municípios; '
        f'{tamanho_pasta(DADOS / "vies") / 1e6:.1f} MB')


# --------------------------------------------------------------------------- partidos de cada recorte (pergunta 1)

# Cadeiras, candidatos, gasto e votos dos eleitos de cada partido em cada um dos seis estados (cargos municipais
# somados no estado), para os recortes da pergunta 1 que não têm a lista de candidatos; e a nota de cada
# partido em cada ano, inclusive dos que já não existem. Mesmos eleitos e gastos de SQL_BASE.
SQL_PARTIDOS_RECORTE = """
WITH alvo AS (
    SELECT v.sq_candidato, v.ano, v.cargo, v.id_partido, v.eleito,
           CASE WHEN length(v.ue) = 2 AND v.ue <> 'BR' THEN v.ue ELSE m.uf END AS uf
    FROM vw_candidatura v
    LEFT JOIN municipio m ON m.cod_tse = v.ue
    WHERE v.ano = ANY(%(anos)s) AND v.cargo = ANY(%(cargos)s)
),
des AS (SELECT d.sq_candidato, SUM(d.valor) AS total FROM despesa d JOIN alvo a USING (sq_candidato)
        WHERE a.eleito GROUP BY 1),
vot AS (SELECT vc.sq_candidato, SUM(vc.votos) FILTER (WHERE vc.turno = 1) AS v1
        FROM votos_cand vc JOIN alvo a USING (sq_candidato) WHERE a.eleito GROUP BY 1)
SELECT a.ano, a.cargo, a.uf, a.id_partido, COUNT(*), COUNT(*) FILTER (WHERE a.eleito),
       SUM(des.total) FILTER (WHERE a.eleito), SUM(vot.v1) FILTER (WHERE a.eleito)
FROM alvo a
LEFT JOIN des ON des.sq_candidato = a.sq_candidato
LEFT JOIN vot ON vot.sq_candidato = a.sq_candidato
GROUP BY 1, 2, 3, 4
"""
CAMPOS_PARTIDOS_RECORTE = ['ano', 'cargo', 'partido', 'cadeiras', 'candidatos', 'gasto_eleitos', 'votos_eleitos']


def parte_partidos_recorte(conn):
    log('partidos por recorte: cadeiras, gasto e votos dos eleitos por partido (banco nacional)')
    with conn.cursor() as cur:
        cur.execute('SELECT id_partido, ano_survey, nota FROM ideologia_partido')
        surveys = defaultdict(list)
        for i, a, n in cur.fetchall():
            surveys[i].append((a, num(n)))
        cur.execute('SELECT id_partido, sigla FROM partido')
        siglas = dict(cur.fetchall())
        cur.execute(SQL_PARTIDOS_RECORTE, {'anos': list(ANOS), 'cargos': list(CARGOS_MAPA)})
        linhas = cur.fetchall()
    nota = nota_mais_proxima(surveys)
    cargos = list(CARGOS_MAPA)
    soma = defaultdict(lambda: [0, 0, 0.0, 0])          # (território, ano, cargo, sigla) -> cand, eleitos, gasto, votos
    notas = defaultdict(dict)
    for ano, cargo, uf, id_partido, cand, eleitos, gasto, votos in linhas:
        sigla = siglas[id_partido]
        notas[str(ano)][sigla] = nota(id_partido, ano)
        for terr in [uf] if uf in UFS_PROJETO else []:
            x = soma[(terr, ano, cargo, sigla)]
            x[0] += cand; x[1] += eleitos; x[2] += float(gasto or 0); x[3] += int(votos or 0)
    arquivos = defaultdict(lambda: {'partidos': Tabela(), 'linhas': []})
    for (terr, ano, cargo, sigla), (cand, eleitos, gasto, votos) in sorted(soma.items()):
        arq = arquivos[terr]
        arq['linhas'].append([ano, cargos.index(cargo), arq['partidos'](sigla), eleitos, cand, round(gasto), votos])
    shutil.rmtree(DADOS / 'partidos-recorte', ignore_errors=True)
    # o Brasil guarda só a nota de cada partido em cada ano (presidente tem a lista de candidatos)
    grava('partidos-recorte/BR.json', {'notas': notas})
    for terr, arq in arquivos.items():
        grava(f'partidos-recorte/{terr}.json', {'campos': CAMPOS_PARTIDOS_RECORTE, 'cargos': cargos,
                                                 'partidos': arq['partidos'].lista, 'linhas': arq['linhas']})
    log(f'partidos por recorte: {len(arquivos)} arquivos, {tamanho_pasta(DADOS / "partidos-recorte") / 1e3:.0f} kB')


# --------------------------------------------------------------------------- dependência em meios cifrões (pergunta 8)

# Candidatos e eleitos por fatia de 5% de dinheiro público na receita (meio cifrão), para presidente no Brasil e
# nos seis estados e seus municípios. O leitor preenche os cifrões e a página soma as fatias. Mesma receita e mesma
# regra de dinheiro público de SQL_BASE (fontes que começam com FUNDO); candidatos sem receita ficam de fora.
SQL_DEPENDENCIA = """
WITH rec AS (SELECT sq_candidato, SUM(valor) AS total,
                    SUM(valor) FILTER (WHERE UPPER(fonte) LIKE 'FUNDO%%') AS publica
             FROM receita GROUP BY 1)
SELECT v.ano, v.cargo, CASE WHEN length(v.ue) = 2 AND v.ue <> 'BR' THEN v.ue ELSE m.uf END AS uf,
       CASE WHEN length(v.ue) = 5 THEN v.ue END AS mun, r.publica, r.total, v.eleito
FROM vw_candidatura v
JOIN rec r ON r.sq_candidato = v.sq_candidato
LEFT JOIN municipio m ON m.cod_tse = v.ue
WHERE v.ano = ANY(%(anos)s) AND v.cargo = ANY(%(cargos)s) AND r.total > 0
"""
CAMPOS_DEPENDENCIA = ['ano', 'cargo', 'territorio', 'meio_cifrao', 'candidatos', 'eleitos']


def meio_cifrao(publica, total):
    """A fatia de 5% da parcela pública da receita: 0 (menos de 5%) a 19, e 20 para 100% público; None sem receita."""
    if not total or total <= 0:
        return None
    return min(20, int(20 * (publica or 0) / total))


def parte_dependencia(conn):
    log('dependência: candidatos e eleitos por meio cifrão de dinheiro público (banco nacional)')
    soma = defaultdict(lambda: [0, 0])
    with conn.cursor(name='dependencia') as cur:
        cur.itersize = 100_000
        cur.execute(SQL_DEPENDENCIA, {'anos': list(ANOS), 'cargos': list(CARGOS_MAPA)})
        for ano, cargo, uf, mun, publica, total, eleito in cur:
            b = meio_cifrao(publica, total)          # Decimal: a conta é exata, como no >= 0.75 do mapa
            for terr in territorios_do_projeto(mun or uf or 'BR', uf):
                x = soma[(terr, ano, cargo, b)]
                x[0] += 1
                x[1] += bool(eleito)
    cargos = list(CARGOS_MAPA)
    brasil, por_uf = [], defaultdict(list)
    for (terr, ano, cargo, b), (cand, el) in sorted(soma.items()):
        linha = [ano, cargos.index(cargo), terr, b, cand, el]
        if len(terr) == 5:
            por_uf[next(u for u in UFS_PROJETO if terr in municipios_da(conn, u))].append(linha)
        else:
            brasil.append(linha)
    shutil.rmtree(DADOS / 'dependencia', ignore_errors=True)
    grava('dependencia/BR.json', {'campos': CAMPOS_DEPENDENCIA, 'cargos': cargos, 'linhas': brasil})
    for uf, linhas in por_uf.items():
        grava(f'dependencia/municipios/{uf}.json', {'campos': CAMPOS_DEPENDENCIA, 'cargos': cargos, 'linhas': linhas})
    log(f'dependência: {len(brasil):,} linhas de Brasil e UFs, {sum(map(len, por_uf.values())):,} de municípios; '
        f'{tamanho_pasta(DADOS / "dependencia") / 1e6:.1f} MB')


# --------------------------------------------------------------------------- propaganda (pergunta 9)

# Mesmas regras de banco/sql/p09b_nuvem_palavras.sql: minúsculas, separa no que não é letra ou número,
# descarta palavras de até 2 letras, números puros e as palavras vazias abaixo.
STOPWORDS = {'de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os', 'em', 'para', 'com', 'por', 'no', 'na',
             'nos', 'nas', 'um', 'uma', 'ref', 'referente', 'servico', 'servicos', 'serviço', 'serviços'}
SEPARADOR = re.compile(r'[^a-zà-ú0-9]+')
PALAVRAS_RECORTE, PALAVRAS_PESSOA = 60, 30


@functools.lru_cache(maxsize=300_000)
def _palavras(descricao):
    return tuple(w for w in SEPARADOR.split(descricao.lower())
                 if len(w) > 2 and not w.isdigit() and w not in STOPWORDS)


def palavras(descricao):
    return list(_palavras(descricao)) if descricao else []


class ContaPalavras:
    """Frequência e valor associado de cada palavra, como na p09b: cada ocorrência numa descrição conta uma
    vez e soma o valor do lançamento. `soma` recebe um grupo de n lançamentos iguais e o valor somado deles."""
    def __init__(self):
        self.freq, self.valor = Counter(), Counter()

    def soma(self, descricao, n, valor):
        for w in palavras(descricao):
            self.freq[w] += n
            self.valor[w] += valor

    def top(self, k):
        return [[w, f, round(self.valor[w])] for w, f in sorted(self.freq.items(), key=lambda x: (-x[1], x[0]))[:k]]


SQL_PROPAGANDA = """
SELECT v.ano, v.cargo, v.ue, CASE WHEN length(v.ue) = 2 THEN v.ue ELSE m.uf END AS uf,
       d.tipo, d.descricao, COUNT(*), SUM(d.valor)
FROM despesa d
JOIN vw_candidatura v ON v.sq_candidato = d.sq_candidato
LEFT JOIN municipio m ON m.cod_tse = v.ue
WHERE v.ano = ANY(%(anos)s) AND v.cargo = ANY(%(cargos)s)
GROUP BY 1, 2, 3, 4, 5, 6
"""
SQL_PROPAGANDA_CANDIDATOS = """
SELECT v.ano, v.cargo, v.ue, CASE WHEN length(v.ue) = 2 THEN v.ue ELSE m.uf END AS uf, COUNT(DISTINCT v.sq_candidato)
FROM vw_candidatura v
LEFT JOIN municipio m ON m.cod_tse = v.ue
WHERE v.ano = ANY(%(anos)s) AND v.cargo = ANY(%(cargos)s)
  AND EXISTS (SELECT 1 FROM despesa d WHERE d.sq_candidato = v.sq_candidato)
GROUP BY 1, 2, 3, 4
"""
SQL_PROPAGANDA_PESSOAS = """
SELECT v.titulo_eleitoral, v.ano, v.cargo, d.tipo, d.descricao, COUNT(*), SUM(d.valor)
FROM despesa d
JOIN vw_candidatura v ON v.sq_candidato = d.sq_candidato
WHERE v.ano = ANY(%(anos)s)
GROUP BY 1, 2, 3, 4, 5
"""


def parte_propaganda(nacional, seis):
    tipos = Tabela()
    recortes = defaultdict(lambda: {'gasto': Counter(), 'palavras': ContaPalavras()})
    log('propaganda: somando despesas por tipo e palavras (banco nacional)')
    params = {'anos': list(ANOS), 'cargos': list(CARGOS_MAPA)}
    with nacional.cursor(name='propaganda') as cur:
        cur.itersize = 50_000
        cur.execute(SQL_PROPAGANDA, params)
        for ano, cargo, ue, uf, tipo, descricao, n, valor in cur:
            it, valor = tipos(tipo or 'Não informado'), float(valor)
            for un in territorios_do_projeto(ue, uf):
                r = recortes[(un, ano, cargo)]
                r['gasto'][it] += valor
                r['palavras'].soma(descricao, n, valor)
    candidatos = Counter()
    with nacional.cursor() as cur:
        cur.execute(SQL_PROPAGANDA_CANDIDATOS, params)
        for ano, cargo, ue, uf, n in cur:
            for un in territorios_do_projeto(ue, uf):
                candidatos[(un, ano, cargo)] += n
    por_ue = defaultdict(lambda: defaultdict(dict))
    for (un, ano, cargo), r in recortes.items():
        por_ue[un][ano][cargo] = {
            'gasto': [[i, round(v)] for i, v in sorted(r['gasto'].items(), key=lambda x: -x[1])],
            'palavras': r['palavras'].top(PALAVRAS_RECORTE), 'candidatos': candidatos[(un, ano, cargo)]}
    recortes.clear()
    shutil.rmtree(DADOS / 'propaganda', ignore_errors=True)

    log('propaganda: despesas de cada político dos seis estados e dos presidentes')
    pids = mapa_pid(seis)
    pessoas = defaultdict(lambda: {'gasto': Counter(), 'palavras': ContaPalavras()})
    with seis.cursor(name='propaganda_pessoas') as cur:
        cur.itersize = 50_000
        cur.execute(SQL_PROPAGANDA_PESSOAS, {'anos': list(ANOS)})
        for titulo, ano, cargo, tipo, descricao, n, valor in cur:
            if titulo not in pids:
                continue
            r = pessoas[(pids[titulo][0], f'{ano}|{cargo}')]
            r['gasto'][tipos(tipo or 'Não informado')] += float(valor)
            r['palavras'].soma(descricao, n, float(valor))
    # cada arquivo de pessoas tem a sua lista de palavras, e cada pessoa guarda só o índice delas
    lotes = defaultdict(lambda: defaultdict(dict))
    vocab = defaultdict(Tabela)
    for (pid, chave), r in pessoas.items():
        n = (pid - 1) // POR_ARQUIVO
        lotes[n][pid][chave] = {
            'gasto': [[i, round(v)] for i, v in sorted(r['gasto'].items(), key=lambda x: -x[1])],
            'palavras': [[vocab[n](w), f, v] for w, f, v in r['palavras'].top(PALAVRAS_PESSOA)]}
    for un, anos in por_ue.items():
        grava(f'propaganda/{un}.json', {'tipos': tipos.lista, 'anos': anos})
    maior = 0
    for n, lote in lotes.items():
        maior = max(maior, grava(f'propaganda/pessoas/{n}.json', {'tipos': tipos.lista, 'palavras': vocab[n].lista,
                                                                 'por_arquivo': POR_ARQUIVO, 'pessoas': lote}))
    log(f'propaganda: {len(por_ue):,} recortes e {len(pessoas):,} candidaturas de {sum(map(len, lotes.values())):,} políticos; '
        f'{tamanho_pasta(DADOS / "propaganda") / 1e6:.1f} MB, maior arquivo de pessoas {maior / 1e3:.0f} kB')


_MUNICIPIOS = {}                         # UF -> códigos dos municípios, lidos uma vez


def municipios_da(conn, uf):
    if uf not in _MUNICIPIOS:
        with conn.cursor() as cur:
            cur.execute('SELECT cod_tse FROM municipio WHERE uf = %s', (uf,))
            _MUNICIPIOS[uf] = {c for (c,) in cur.fetchall()}
    return _MUNICIPIOS[uf]


PARTES = {'politicos': parte_politicos, 'mapa': parte_mapa, 'geo': parte_geo,
          'partidos': parte_partidos, 'vies': parte_vies,
          'candidaturas': parte_candidaturas, 'legenda': parte_legenda,
          'propaganda': parte_propaganda, 'partidos_recorte': parte_partidos_recorte,
          'dependencia': parte_dependencia}
# partes que leem os dois bancos: recebem (nacional, seis estados)
DOIS_BANCOS = {'candidaturas', 'propaganda', 'politicos'}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--partes', default=','.join(PARTES), help='lista separada por vírgula: ' + ', '.join(PARTES))
    ap.add_argument('--banco', default='dbname=eleicoes', help='banco dos seis estados')
    ap.add_argument('--nacional', default='dbname=eleicoes_nacional', help='banco com o país inteiro')
    args = ap.parse_args()
    for parte in args.partes.split(','):
        if parte in DOIS_BANCOS:
            with psycopg.connect(args.nacional) as nacional, psycopg.connect(args.banco) as seis:
                PARTES[parte](nacional, seis)
            continue
        dsn = args.banco if parte == 'legenda' else args.nacional
        with psycopg.connect(dsn) as conn:
            PARTES[parte](conn)


if __name__ == '__main__':
    main()
