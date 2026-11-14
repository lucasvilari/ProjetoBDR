#!/usr/bin/env python3
"""Gera patrimonio_corrida.json para a pergunta 12 (corrida de cavalos).

Para cada eleito (governador, dep. federal, dep. estadual, prefeito) nos seis
estados, gera um registro com:
  - dados da eleição (patrimônio, variação, partido)
  - foto do TSE (chave sq/ue)
  - carreira política completa (todas as candidaturas em qualquer cargo)

Uso:  ..\\banco\\venv\\Scripts\\python.exe gera_corrida.py
"""
import json
from collections import defaultdict
from pathlib import Path

import psycopg

DB = 'dbname=eleicoes user=postgres password=749205 host=localhost'
UFS = ('AP', 'MG', 'MS', 'PB', 'RO', 'RR')
DADOS = Path(__file__).resolve().parent / 'dados'

CARGOS_CURTO = {
    'GOVERNADOR': 'GOV', 'VICE-GOVERNADOR': 'VGOV',
    'SENADOR': 'SEN', 'DEPUTADO FEDERAL': 'DEPFED', 'DEPUTADO ESTADUAL': 'DEPEST',
    'PREFEITO': 'PREF', 'VICE-PREFEITO': 'VPREF', 'VEREADOR': 'VER',
    'PRESIDENTE': 'PRES', 'VICE-PRESIDENTE': 'VPRES',
    '1º SUPLENTE': 'SUP1', '2º SUPLENTE': 'SUP2',
}
ELEITOS = ('ELEITO', 'ELEITO POR MÉDIA', 'ELEITO POR QP')


def arred(v, casas=0):
    if v is None:
        return None
    return int(round(float(v))) if casas == 0 else round(float(v), casas)


def main():
    conn = psycopg.connect(DB)

    with conn.cursor() as cur:
        # 1) Municípios → UF
        print('Carregando mapa de municípios...')
        cur.execute("SELECT cod_tse, uf, nome FROM municipio WHERE uf = ANY(%s)", (list(UFS),))
        mun_uf = {}     # cod_tse str → uf
        mun_nome = {}   # cod_tse str → nome do município
        for cod, uf, nome in cur.fetchall():
            mun_uf[str(cod)] = uf
            mun_nome[str(cod)] = nome

        # 2) Todos os titulo_eleitoral de eleitos nos 6 estados
        print('Buscando eleitos...')
        cur.execute("""
            SELECT DISTINCT c.titulo_eleitoral, c.cargo, c.ue, e.ano,
                   c.sq_candidato
            FROM candidatura c
            JOIN eleicao e ON e.cod_eleicao = c.cod_eleicao
            WHERE c.situacao_final = ANY(%s) AND e.ano >= 2006
              AND (
                (c.cargo = 'GOVERNADOR' AND c.ue = ANY(%s))
                OR (c.cargo = 'DEPUTADO FEDERAL' AND c.ue = ANY(%s))
                OR (c.cargo = 'DEPUTADO ESTADUAL' AND c.ue = ANY(%s))
                OR (c.cargo = 'PREFEITO' AND c.ue = ANY(%s))
              )
        """, (list(ELEITOS), list(UFS), list(UFS), list(UFS),
              list(mun_uf.keys())))
        # Para cada eleito, guardar quais recortes/anos participou
        # e qual sq_candidato usar para a foto nessa eleição
        eleitos_info = []  # (titulo, cargo, ue, ano, sq)
        titulos = set()
        for titulo, cargo, ue, ano, sq in cur.fetchall():
            titulos.add(titulo)
            eleitos_info.append((titulo, cargo, ue, ano, sq))
        print(f'  {len(titulos)} políticos, {len(eleitos_info)} mandatos eleitos')

        # 3) Carreira completa de cada político
        print('Buscando carreiras completas...')
        cur.execute("""
            SELECT c.titulo_eleitoral, p.nome, e.ano, c.cargo, c.ue, pa.sigla,
                   c.sq_candidato, c.situacao_final,
                   COALESCE(SUM(b.valor), 0) AS patrimonio
            FROM candidatura c
            JOIN politico p ON p.titulo_eleitoral = c.titulo_eleitoral
            JOIN eleicao e ON e.cod_eleicao = c.cod_eleicao
            JOIN partido pa ON pa.id_partido = c.id_partido
            LEFT JOIN bem b ON b.sq_candidato = c.sq_candidato
            WHERE c.titulo_eleitoral = ANY(%s) AND e.ano >= 2006
            GROUP BY c.titulo_eleitoral, p.nome, e.ano, c.cargo, c.ue, pa.sigla,
                     c.sq_candidato, c.situacao_final
            ORDER BY c.titulo_eleitoral, e.ano
        """, (list(titulos),))
        rows = cur.fetchall()
        print(f'  {len(rows)} candidaturas na carreira')

    conn.close()

    # 4) Montar estrutura por político
    pol_data = {}  # titulo → { nome, cands: [...] }
    for titulo, nome, ano, cargo, ue, partido, sq, sit, pat in rows:
        if titulo not in pol_data:
            pol_data[titulo] = {'nome': nome, 'cands': []}
        foto = f'{ano}/{sq}/{ue}' if sq and sq > 0 else None
        pol_data[titulo]['cands'].append({
            'ano': ano, 'cargo': cargo, 'ue': ue, 'partido': partido,
            'patrimonio': arred(pat), 'foto': foto,
            'eleito': sit in ELEITOS,
        })

    # 5) Array de políticos (index estável)
    pol_lista = []  # [{nome, foto, carreira}]
    titulo_para_idx = {}
    for titulo, pd in pol_data.items():
        idx = len(pol_lista)
        titulo_para_idx[titulo] = idx
        cands = sorted(pd['cands'], key=lambda c: c['ano'])
        foto = None
        for c in reversed(cands):
            if c['foto']:
                foto = c['foto']
                break
        carreira = []
        for c in cands:
            cargo_curto = CARGOS_CURTO.get(c['cargo'], c['cargo'])
            carreira.append([c['ano'], cargo_curto, c['ue'], c['partido'],
                             c['patrimonio'], c['foto'], 1 if c['eleito'] else 0])
        pol_lista.append({'n': pd['nome'], 'f': foto, 'c': carreira})

    # 6) Montar recortes — cada recorte/ano tem lista de entradas
    recortes = defaultdict(lambda: defaultdict(list))
    for titulo, cargo_longo, ue, ano, sq in eleitos_info:
        idx = titulo_para_idx.get(titulo)
        if idx is None:
            continue
        cargo = CARGOS_CURTO.get(cargo_longo, cargo_longo)
        pd = pol_data[titulo]
        cands = sorted(pd['cands'], key=lambda c: c['ano'])

        # patrimônio nesta eleição e na anterior (qualquer cargo)
        pat_atual = None
        pat_anterior = None
        ano_anterior = None
        for c in cands:
            if c['ano'] == ano and CARGOS_CURTO.get(c['cargo'], c['cargo']) == cargo and c['ue'] == ue:
                pat_atual = c['patrimonio']
                break
        # anterior: a candidatura mais recente ANTES desta (qualquer cargo, com pat > 0)
        anteriores = [c for c in cands if c['ano'] < ano and c['patrimonio'] and c['patrimonio'] > 0]
        if anteriores:
            ant = anteriores[-1]
            pat_anterior = ant['patrimonio']
            ano_anterior = ant['ano']

        variacao = None
        if pat_atual is not None and pat_anterior is not None and pat_anterior > 0:
            variacao = arred(100 * (pat_atual - pat_anterior) / pat_anterior, 1)

        # foto desta eleição
        foto_eleicao = f'{ano}/{sq}/{ue}' if sq and sq > 0 else None

        # determinar recorte e lugar
        if cargo == 'GOV':
            recorte_key = 'gov'
            lugar = ue
        elif cargo == 'DEPFED':
            recorte_key = 'depfed'
            lugar = ue
        elif cargo == 'DEPEST':
            recorte_key = 'depest'
            lugar = ue
        elif cargo == 'PREF':
            uf_do_mun = mun_uf.get(ue)
            if not uf_do_mun:
                continue
            recorte_key = uf_do_mun
            lugar = mun_nome.get(ue, ue)
        else:
            continue

        partido_eleicao = None
        for c in cands:
            if c['ano'] == ano and CARGOS_CURTO.get(c['cargo'], c['cargo']) == cargo:
                partido_eleicao = c['partido']
                break

        recortes[recorte_key][str(ano)].append({
            'i': idx,
            'p': partido_eleicao or '',
            'l': lugar,
            'pa': pat_atual,
            'pb': pat_anterior,
            'ab': ano_anterior,
            'v': variacao,
            'fo': foto_eleicao,
        })

    # Ordenar cada recorte/ano por variação desc
    for rk in recortes:
        for ak in recortes[rk]:
            recortes[rk][ak].sort(
                key=lambda e: (e['v'] is not None, e['v'] or 0), reverse=True)

    # 7) Gravar
    dados = {
        'campos_carreira': ['ano', 'cargo', 'ue', 'partido', 'patrimonio', 'foto', 'eleito'],
        'politicos': pol_lista,
        'recortes': {rk: dict(rv) for rk, rv in recortes.items()},
    }
    arq = DADOS / 'patrimonio_corrida.json'
    arq.write_text(json.dumps(dados, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    tam = arq.stat().st_size
    n_rec = sum(sum(len(v) for v in rv.values()) for rv in recortes.values())
    print(f'Gravado {arq} ({tam / 1e6:.1f} MB, {len(pol_lista)} políticos, {n_rec} entradas)')


if __name__ == '__main__':
    main()
