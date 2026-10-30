"""Conferência dos dados gerados em site/dados/ contra o que o banco e as outras partes produzem.
Rodar depois de gerar as partes envolvidas; precisa do PostgreSQL (marcador "banco")."""
import functools
import json
from pathlib import Path

import pytest

import gera_dados

DADOS = Path(gera_dados.DADOS)
CAMPOS = gera_dados.CAMPOS_CANDIDATURAS_RECORTE


@functools.cache
def pid_de(nome):
    """O número do político pelo nome: a numeração é sequencial e muda quando entram candidatos de uma eleição nova."""
    for f in (DADOS / 'politicos/carreira').glob('*.json'):
        for pid, (n, _, _) in json.loads(f.read_text()).items():
            if n == nome:
                return int(pid)
    raise KeyError(nome)


LULA, COUTINHO = 'LUIZ INÁCIO LULA DA SILVA', 'RICARDO VIEIRA COUTINHO'


@pytest.mark.banco
@pytest.mark.parametrize('ue,uf,cargo,ano', [('MG', 'MG', 'DEPUTADO FEDERAL', 2022), ('41238', 'MG', 'VEREADOR', 2024)])
def test_totais_batem_com_mapa(ue, uf, cargo, ano):
    fatia = json.loads((DADOS / gera_dados.fatia_de(ue, ano)).read_text())
    linhas = [l for l in fatia['linhas'] if fatia['cargos'][l[CAMPOS.index('cargo')]] == cargo]
    gasto = round(sum((l[CAMPOS.index('despesa')] or 0) if len(l) > CAMPOS.index('despesa') else 0 for l in linhas))
    eleitos = sum(1 for l in linhas if l[CAMPOS.index('eleito')])
    mapa = json.loads((DADOS / ('mapa/brasil.json' if len(ue) == 2 else f'mapa/municipios/{uf}.json')).read_text())
    cargos = json.loads((DADOS / 'mapa/brasil.json').read_text())['cargos']
    linha = next(l for l in mapa['custo'] if l[0] == ano and cargos[l[1]] == cargo and l[2] == ue)
    assert eleitos == linha[5] and abs(gasto - linha[6]) <= len(linhas)   # arredondamento por candidato


@pytest.mark.banco
def test_tamanho_das_fatias():
    assert max(f.stat().st_size for f in (DADOS / 'candidaturas').glob('*.json')) < 1_000_000


@pytest.mark.banco
def test_so_os_seis_estados_e_presidente():
    """Fora dos seis estados não há lista de candidatos; no Brasil, só a de presidente, com todos nomeados."""
    assert not (DADOS / gera_dados.fatia_de('SP', 2022)).exists()
    br = json.loads((DADOS / gera_dados.fatia_de('BR', 2022)).read_text())
    assert {br['cargos'][l[CAMPOS.index('cargo')]] for l in br['linhas']} == {'PRESIDENTE'}
    assert all(len(l) > CAMPOS.index('nome') for l in br['linhas'])
    for pasta in ('propaganda', 'partidos-recorte'):
        assert not (DADOS / f'{pasta}/SP.json').exists()


@pytest.mark.banco
def test_presidentes_nomeados_com_votos_nacionais():
    fatia = json.loads((DADOS / gera_dados.fatia_de('BR', 2022)).read_text())
    lula = next(l for l in fatia['linhas'] if len(l) > CAMPOS.index('nome') and 'LULA' in l[CAMPOS.index('nome')])
    assert lula[CAMPOS.index('votos')] > 57_000_000 and lula[CAMPOS.index('votos_2t')] > 60_000_000


@pytest.mark.banco
@pytest.mark.parametrize('sigla', ['PT', 'PL', 'PSD'])
def test_legenda_bate_com_p05(sigla):
    """A contagem de eleitos pela legenda no resumo é a mesma da consulta de referência p05."""
    import psycopg
    sql = (Path(__file__).resolve().parents[2] / 'banco/sql/p05_eleitos_legenda.sql').read_text()
    sql = sql.replace(":'sigla'", '%(sigla)s')
    with psycopg.connect('dbname=eleicoes') as conn, conn.cursor() as cur:
        cur.execute(sql, {'sigla': sigla})
        referencia = {(ano, cargo): (eleitos, leg) for ano, cargo, _, eleitos, leg, _ in cur.fetchall()}
    resumo = json.loads((DADOS / 'legenda/resumo.json').read_text())['linhas']
    gerado = {}
    for ano, cargo, uf, partido, eleitos, leg in resumo:
        if partido == sigla:
            e, l = gerado.get((ano, cargo), (0, 0))
            gerado[(ano, cargo)] = (e + eleitos, l + leg)
    assert gerado == referencia


@pytest.mark.banco
def test_vies_por_cargo():
    """O índice combinado do Brasil em 2022 continua 6,56 (deputado federal); presidente tem índice próprio,
    e cada cargo municipal dos seis estados tem seu arquivo."""
    d = json.loads((DADOS / 'vies/brasil.json').read_text())
    linhas = [dict(zip(d['campos'], l)) for l in d['linhas']]
    br22 = {l['cargo']: l for l in linhas if l['territorio'] == 'BR' and l['ano'] == 2022}
    assert br22['COMBINADO']['indice'] == 6.56
    assert br22['DEPUTADO FEDERAL']['indice'] == 6.56
    assert br22['PRESIDENTE']['indice'] != br22['COMBINADO']['indice']
    assert br22['PRESIDENTE']['presidente'] and br22['SENADOR']['presidente'] is None
    for uf in ['AP', 'MG', 'MS', 'PB', 'RO', 'RR']:
        assert (DADOS / f'vies/municipios/{uf}.json').exists()
        assert (DADOS / f'vies/municipios/{uf}-vereador.json').exists()


SQL_P09A_SEIS_ESTADOS_2024 = """
SELECT d.tipo, SUM(d.valor) FROM despesa d JOIN vw_candidatura v ON v.sq_candidato = d.sq_candidato
WHERE v.ano = 2024 GROUP BY 1
"""


@pytest.mark.banco
def test_propaganda_bate_com_p09a():
    """O gasto por tipo de 2024 nos seis estados, somado dos arquivos de propaganda, é o da p09a no banco dos seis estados."""
    import psycopg
    with psycopg.connect('dbname=eleicoes') as conn:
        esperado = {t or 'Não informado': float(v) for t, v in conn.execute(SQL_P09A_SEIS_ESTADOS_2024)}
    somado = {}
    for uf in ['AP', 'MG', 'MS', 'PB', 'RO', 'RR']:
        d = json.loads((DADOS / f'propaganda/{uf}.json').read_text())
        for cargo, r in d['anos'].get('2024', {}).items():
            for i, v in r['gasto']:
                somado[d['tipos'][i]] = somado.get(d['tipos'][i], 0) + v
    assert somado.keys() == esperado.keys()
    for t, v in esperado.items():
        assert abs(somado[t] - v) <= 1 + 0.5 * 12, t     # cada um dos 12 recortes (6 UFs × 2 cargos) arredonda ao real


@pytest.mark.banco
def test_propaganda_de_uma_pessoa():
    d = json.loads((DADOS / 'propaganda/pessoas/0.json').read_text())
    pid, cands = next(iter(d['pessoas'].items()))
    for chave, r in cands.items():
        ano, cargo = chave.split('|')
        assert int(ano) in (2018, 2020, 2022, 2024, 2026) and cargo
        assert all(0 <= i < len(d['tipos']) for i, _ in r['gasto'])
        assert all(0 <= i < len(d['palavras']) for i, _, _ in r['palavras']) and len(r['palavras']) <= 30


@pytest.mark.banco
def test_carreira_tem_votos_de_2018_em_diante_e_presidente_nacional():
    t = json.loads((DADOS / 'politicos/tabelas.json').read_text())
    iv = t['campos_candidatura'].index('votos')
    lula = pid_de(LULA)
    for pid in (pid_de(COUTINHO), lula):
        nome, linhas, _ = json.loads((DADOS / f'politicos/carreira/{(pid - 1) // 1000}.json').read_text())[str(pid)]
        for l in linhas:
            votos = l[iv] if len(l) > iv else None
            if l[0] < 2018:
                assert votos is None
        if pid == lula:
            assert [l for l in linhas if l[0] == 2022][0][iv] > 57_000_000


@pytest.mark.banco
@pytest.mark.parametrize('terr,cargo,ano', [('MG', 'PREFEITO', 2020), ('PB', 'VEREADOR', 2024), ('MG', 'VEREADOR', 2024),
                                            ('RR', 'PREFEITO', 2024), ('MS', 'DEPUTADO FEDERAL', 2018)])
def test_partidos_do_recorte_somam_os_eleitos_do_mapa(terr, cargo, ano):
    """As cadeiras por partido de um recorte somam os eleitos do mapa, e o PSL de 2018 tem nota."""
    mapa = json.loads((DADOS / 'mapa/brasil.json').read_text())
    ic = mapa['cargos'].index(cargo)
    eleitos = next(dict(zip(mapa['campos_custo'], l))['eleitos'] for l in mapa['custo']
                   if l[0] == ano and l[1] == ic and l[2] == terr)
    d = json.loads((DADOS / f'partidos-recorte/{terr}.json').read_text())
    linhas = [dict(zip(d['campos'], l)) for l in d['linhas']]
    assert sum(l['cadeiras'] for l in linhas if l['ano'] == ano and d['cargos'][l['cargo']] == cargo) == eleitos
    br = json.loads((DADOS / 'partidos-recorte/BR.json').read_text())
    assert br['notas']['2018']['PSL'] is not None


@pytest.mark.banco
@pytest.mark.parametrize('ano,cargo', [(2022, 'DEPUTADO FEDERAL'), (2024, 'VEREADOR')])
def test_meios_cifroes_batem_com_as_faixas_do_mapa(ano, cargo):
    """Em Minas, quem tem 75% ou mais de dinheiro público (meio cifrão 15 em diante) é a faixa "75% ou mais" do mapa,
    e todas as fatias somam todos os candidatos com receita."""
    mapa = json.loads((DADOS / 'mapa/brasil.json').read_text())
    ic = mapa['cargos'].index(cargo)
    faixas = [dict(zip(mapa['campos_faixa'], l)) for l in mapa['dependencia']]
    faixas = [f for f in faixas if f['ano'] == ano and f['cargo'] == ic and f['territorio'] == 'MG']
    d = json.loads((DADOS / 'dependencia/BR.json').read_text())
    linhas = [dict(zip(d['campos'], l)) for l in d['linhas']]
    linhas = [l for l in linhas if l['ano'] == ano and d['cargos'][l['cargo']] == cargo and l['territorio'] == 'MG']
    f0 = next(f for f in faixas if f['faixa'] == 0)
    assert sum(l['candidatos'] for l in linhas if l['meio_cifrao'] >= 15) == f0['candidatos']
    assert sum(l['eleitos'] for l in linhas if l['meio_cifrao'] >= 15) == f0['eleitos']
    assert sum(l['candidatos'] for l in linhas) == sum(f['candidatos'] for f in faixas)


@pytest.mark.banco
def test_carreira_comeca_em_1994_quando_o_nome_e_nascimento_batem():
    """Lula concorreu a presidente em 1994; Ricardo Coutinho foi eleito vereador de João Pessoa em 1996."""
    t = json.loads((DADOS / 'politicos/tabelas.json').read_text())
    def carreira(pid):
        return json.loads((DADOS / f'politicos/carreira/{(pid - 1) // 1000}.json').read_text())[str(pid)][1]
    assert [t['cargos'][l[1]] for l in carreira(pid_de(LULA)) if l[0] == 1994] == ['PRESIDENTE']
    assert [(t['cargos'][l[1]], l[2]) for l in carreira(pid_de(COUTINHO)) if l[0] == 1996] == [('VEREADOR', '20516')]


@pytest.mark.banco
@pytest.mark.parametrize('ue,ano,cargo', [('PB', '2022', 'DEPUTADO FEDERAL'), ('MG', '2018', 'DEPUTADO ESTADUAL'), ('41238', '2024', 'VEREADOR')])
def test_chapas_somam_os_votos_validos(ue, ano, cargo):
    """Os votos de cada chapa (nominais de todos os candidatos e de legenda) somam os votos válidos do recorte, e
    cada chapa tem pelo menos os votos dos seus eleitos."""
    d = json.loads((DADOS / f'legenda/{ue}.json').read_text())
    r = d['anos'][ano][cargo]
    # em 2018 o arquivo de votos por partido do TSE soma até 0,2% menos que o de apuração (19.829 de 10,1 milhões em
    # MG, deputado estadual), sem descarte da carga que explique; de 2020 em diante os dois batem
    tolerancia = 0.005 * r['validos'] if ano == '2018' else 0
    assert abs(sum(n + leg for _, n, leg in r['chapas']) - r['validos']) <= tolerancia
    por_unidade = {u: n for u, n, _ in r['chapas']}
    iu, iv = d['campos_eleito'].index('unidade'), d['campos_eleito'].index('votos')
    for u in {e[iu] for e in r['eleitos']}:
        assert por_unidade[u] >= sum(e[iv] for e in r['eleitos'] if e[iu] == u)


@pytest.mark.banco
def test_exemplos_das_palavras_contem_a_palavra():
    """Cada exemplo de despesa de uma palavra da TV contém a palavra (Lula, 2022, e o recorte de João Pessoa, 2024)."""
    pid = pid_de(LULA)
    principal = json.loads((DADOS / f'propaganda/pessoas/{(pid - 1) // 1000}.json').read_text())
    ex = json.loads((DADOS / f'propaganda/exemplos/pessoas/{(pid - 1) // 1000}.json').read_text())['pessoas'][str(pid)]['2022|PRESIDENTE']
    palavras = [principal['palavras'][i] for i, _, _ in principal['pessoas'][str(pid)]['2022|PRESIDENTE']['palavras']]
    recorte = json.loads((DADOS / 'propaganda/20516.json').read_text())['anos']['2024']['PREFEITO']['palavras']
    ex_recorte = json.loads((DADOS / 'propaganda/exemplos/20516.json').read_text())['anos']['2024']['PREFEITO']
    for ws, e in ((palavras, ex), ([w for w, _, _ in recorte], ex_recorte)):
        assert len(e['por_palavra']) == len(ws)
        assert all(e['por_palavra'])                                  # toda palavra tem ao menos um exemplo
        for w, indices in zip(ws, e['por_palavra']):
            # em qualquer grafia: as que só diferem em acento contam como a mesma palavra
            chave = gera_dados.chave_palavra
            assert all(chave(w) in {chave(x) for x in gera_dados.palavras(e['descricoes'][i][0].rstrip('…'))}
                       or e['descricoes'][i][0].endswith('…') for i in indices)


def _consulta(arquivo, **params):
    import psycopg
    sql = (Path(__file__).resolve().parents[2] / f'banco/sql/{arquivo}').read_text()
    for k in params:
        sql = sql.replace(f":'{k}'", f'%({k})s').replace(f':{k}', f'%({k})s')
    with psycopg.connect('dbname=eleicoes') as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


@pytest.mark.banco
def test_indices_do_municipio_batem_com_p03a():
    """João Pessoa: PIB per capita, IDHM, eleitores por habitante e isentos de cada ano, como na p03a."""
    ind = json.loads((DADOS / 'indices/municipios.json').read_text())
    i = [m[0] for m in ind['municipios']].index('20516')
    for nome, uf, ano, ano_pib, pib_pc, idhm, pop, aptos, razao, isentos, isentos_pct in _consulta('p03a_indices_municipio.sql', cod_tse='20516'):
        v = ind['valores'][str(ano)][i]
        assert v[0] == pytest.approx(float(pib_pc), abs=0.01)
        assert v[1] == pytest.approx(float(idhm), abs=0.0005)
        assert v[2] == pytest.approx(float(razao), abs=0.0001)
        assert v[3] == pytest.approx(float(isentos_pct), abs=0.01)


@pytest.mark.banco
def test_ranking_de_partidos_bate_com_p03b():
    rank = json.loads((DADOS / 'indices/ranking/PB.json').read_text())
    for ano, sigla, eleitos, votos, pct, posicao in _consulta('p03b_partidos_municipio.sql', cod_tse='20516'):
        r = rank['anos'][str(ano)]['20516']
        linha = next((l for l in r['partidos'] if rank['partidos'][l[0]] == sigla), None)
        if posicao <= 10:
            assert linha is not None and linha[1] == votos and linha[2] == eleitos
        if linha is not None:
            assert round(100 * linha[1] / r['total'], 2) == pytest.approx(float(pct), abs=0.01)


@pytest.mark.banco
def test_medias_por_partido_do_prefeito_batem_com_p03c():
    ind = json.loads((DADOS / 'indices/municipios.json').read_text())
    valores = ind['valores']['2024']
    for sigla, prefeituras, pib_pc, idhm, isentos in _consulta('p03c_indices_por_partido.sql', ano=2024)[:8]:
        p = ind['partidos'].index(sigla)
        dele = [v for v in valores if v[4] == p and v[5] == 2024]
        assert len(dele) == prefeituras
        assert sum(v[1] for v in dele if v[1] is not None) / len([v for v in dele if v[1] is not None]) == pytest.approx(float(idhm), abs=0.001)
        assert sum(v[3] for v in dele) / len(dele) == pytest.approx(float(isentos), abs=0.01)


@pytest.mark.banco
def test_indices_trazem_o_voto_ideologico_da_pergunta_7():
    """O índice ideológico de cada município é o combinado da pergunta 7, e o 2º turno de presidente vem nos anos gerais."""
    ind = json.loads((DADOS / 'indices/municipios.json').read_text())
    campos = ind['campos']
    vies = json.loads((DADOS / 'vies/municipios/PB.json').read_text())
    cv = vies['campos']
    i = [m[0] for m in ind['municipios']].index('20516')
    for l in vies['linhas']:
        if l[cv.index('territorio')] == '20516' and l[cv.index('ano')] in ind['anos']:
            v = ind['valores'][str(l[cv.index('ano')])][i]
            assert v[campos.index('ideologia')] == l[cv.index('indice')]
            st = (l[cv.index('presidente')] or {}).get('segundo_turno') or []
            if st:
                assert v[campos.index('segundo_turno')] == [st[0][1], st[0][2], st[1][1], st[1][2]]
    com = sum(1 for l in ind['valores']['2022'] if l[campos.index('ideologia')] is not None)
    assert com > 0.95 * len(ind['municipios'])


@pytest.mark.banco
@pytest.mark.parametrize('ano,cargo', [(2024, 'VEREADOR'), (2024, 'PREFEITO'), (2022, 'GOVERNADOR')])
def test_ranking_por_cargo_bate_com_o_banco(ano, cargo):
    """O boletim de um cargo: os votos de cada partido só naquele cargo e os eleitos dele, em João Pessoa."""
    import psycopg
    rank = json.loads((DADOS / f'indices/ranking/PB-{gera_dados.slug_cargo(cargo)}.json').read_text())
    r = rank['anos'][str(ano)]['20516']
    with psycopg.connect('dbname=eleicoes') as conn:
        votos = dict(conn.execute(
            """SELECT p.sigla, SUM(vp.votos_nominais + vp.votos_legenda) FROM votos_part vp
               JOIN eleicao e USING (cod_eleicao) JOIN partido p USING (id_partido)
               WHERE e.ano = %s AND vp.cod_tse = '20516' AND vp.turno = 1 AND vp.cargo = %s GROUP BY 1""", (ano, cargo)).fetchall())
        eleitos = dict(conn.execute(
            """SELECT p.sigla, COUNT(*) FROM vw_candidatura v JOIN partido p USING (id_partido)
               WHERE v.ano = %s AND v.ue = '20516' AND v.eleito AND v.cargo = %s GROUP BY 1""", (ano, cargo)).fetchall())
    assert r['total'] == sum(votos.values())
    for p, v, el in r['partidos']:
        sigla = rank['partidos'][p]
        assert v == votos[sigla] and el == eleitos.get(sigla, 0)
    assert {s for s, n in eleitos.items() if n} <= {rank['partidos'][p] for p, _, _ in r['partidos']}


@pytest.mark.banco
@pytest.mark.parametrize('ano,cargo', [(2022, 'GOVERNADOR'), (2024, 'PREFEITO'), (2018, 'PRESIDENTE')])
def test_indices_trazem_o_voto_ideologico_de_cada_cargo(ano, cargo):
    ind = json.loads((DADOS / 'indices/municipios.json').read_text())
    assert cargo in ind['cargos'][str(ano)]
    vies = json.loads((DADOS / f'vies/municipios/PB-{gera_dados.slug_cargo(cargo)}.json').read_text())
    cv = vies['campos']
    cods = [m[0] for m in ind['municipios']]
    por_cargo = ind['ideologia_cargos'][str(ano)][cargo]
    conferidos = 0
    for l in vies['linhas']:
        if l[cv.index('ano')] == ano:
            v = por_cargo[cods.index(l[cv.index('territorio')])]
            assert v[0] == l[cv.index('indice')]
            assert ind['classificacoes'][v[1]] == l[cv.index('classificacao')]
            conferidos += 1
    assert conferidos > 200


@pytest.mark.banco
def test_indices_dos_estados_cobrem_o_pais_e_batem_com_o_banco():
    """As 27 UFs e o Brasil; os isentos de um estado são a soma dos municípios no 1º turno de presidente ou prefeito."""
    import psycopg
    est = json.loads((DADOS / 'indices/estados.json').read_text())
    assert len(est['valores']['2022']) == 28 and 'BR' in est['valores']['2022']
    with psycopg.connect('dbname=eleicoes_nacional') as conn:
        for ano, cargo in ((2022, 'PRESIDENTE'), (2024, 'PREFEITO')):
            aptos, isentos = conn.execute(
                """SELECT SUM(a.aptos), SUM(a.brancos + a.nulos + a.abstencoes) FROM apuracao a
                   JOIN eleicao e USING (cod_eleicao) JOIN municipio m USING (cod_tse)
                   WHERE e.ano = %s AND a.turno = 1 AND a.cargo = %s AND m.uf = 'PB'""", (ano, cargo)).fetchone()
            assert est['valores'][str(ano)]['PB'][3] == pytest.approx(100 * isentos / aptos, abs=0.01)
    pib = est['valores']['2022']['SP'][0]
    assert 30_000 < pib < 100_000
    assert 0.6 < est['valores']['2022']['BR'][1] < 0.8


@pytest.mark.banco
def test_escada_dos_diplomas_bate_com_p04a():
    """Candidatos e eleitos por grau de escolaridade, somando os cargos, como a p04a."""
    esc = json.loads((DADOS / 'escolaridade/escolaridade.json').read_text())
    for ano, escolaridade, candidatos, eleitos, taxa in _consulta('p04a_escolaridade_sucesso.sql'):
        nivel = esc['niveis'].index(escolaridade)
        assert esc['escada'][str(ano)]['SEIS']['TODOS'][nivel] == [candidatos, eleitos]


def _ntile(n, partes=5):
    """Os tamanhos dos grupos do NTILE do PostgreSQL: os primeiros n % partes grupos com um a mais."""
    return [n // partes + (1 if i < n % partes else 0) for i in range(partes)]


@pytest.mark.banco
@pytest.mark.parametrize('ano,cargo', [(2024, 'VEREADOR'), (2022, 'DEPUTADO FEDERAL'), (2024, 'PREFEITO')])
def test_boletim_escolar_bate_com_p04b(ano, cargo):
    """Os municípios em quintis pela escolaridade de quem votou, com a média de quem recebeu os votos e dos eleitos."""
    import statistics
    esc = json.loads((DADOS / 'escolaridade/escolaridade.json').read_text())
    eleitor = esc['eleitorado'][str(ano)]
    votados = esc['votados'][str(ano)][cargo]
    linhas = sorted(((e, v[0], v[1]) for e, v in zip(eleitor, votados) if e is not None and v is not None and v[0] is not None),
                    key=lambda l: l[0])
    resultado = _consulta('p04b_escolaridade_municipio.sql', ano=ano, cargo=cargo)
    inicio = 0
    for (quintil, municipios, n_eleitor, n_votado, n_eleitos, corr), tamanho in zip(resultado[:5], _ntile(len(linhas))):
        grupo = linhas[inicio:inicio + tamanho]
        inicio += tamanho
        assert municipios == len(grupo)
        assert statistics.fmean(l[0] for l in grupo) == pytest.approx(float(n_eleitor), abs=0.006)
        assert statistics.fmean(l[1] for l in grupo) == pytest.approx(float(n_votado), abs=0.006)
    total = resultado[5]
    assert total[1] == len(linhas)
    assert statistics.correlation([l[0] for l in linhas], [l[1] for l in linhas]) == pytest.approx(float(total[5]), abs=0.0006)


@pytest.mark.banco
@pytest.mark.parametrize('ano,lugar,cargo', [(2024, 'PB', 'TODOS'), (2024, '20516', 'VEREADOR'), (2022, 'PB', 'TODOS'),
                                             (2022, 'MG', 'DEPUTADO FEDERAL')])
def test_escada_de_um_lugar_bate_com_o_banco(ano, lugar, cargo):
    """A escada de um estado (candidaturas do estado e dos seus municípios) ou de um município (as dele)."""
    import psycopg
    esc = json.loads((DADOS / 'escolaridade/escolaridade.json').read_text())
    filtro_lugar = 'v.ue = %(lugar)s' if len(lugar) == 5 else '(v.ue = %(lugar)s OR m.uf = %(lugar)s)'
    filtro_cargo = '' if cargo == 'TODOS' else 'AND v.cargo = %(cargo)s'
    with psycopg.connect('dbname=eleicoes') as conn:
        linhas = conn.execute(f"""SELECT nivel_escolaridade(v.escolaridade), COUNT(*), COUNT(*) FILTER (WHERE v.eleito)
            FROM vw_candidatura v LEFT JOIN municipio m ON m.cod_tse = v.ue
            WHERE v.ano = %(ano)s AND nivel_escolaridade(v.escolaridade) IS NOT NULL AND {filtro_lugar} {filtro_cargo}
            GROUP BY 1""", {'ano': ano, 'lugar': lugar, 'cargo': cargo}).fetchall()
    esperado = [[0, 0] for _ in range(8)]
    for nivel, c, e in linhas:
        esperado[nivel] = [c, e]
    assert esc['escada'][str(ano)][lugar][cargo] == esperado


@pytest.mark.banco
def test_escolaridade_dos_estados_bate_com_o_banco_nacional():
    """O nível de quem votou e de quem recebeu os votos em cada UF, somando os municípios dela."""
    import psycopg
    est = json.loads((DADOS / 'escolaridade/estados.json').read_text())
    assert len(est['eleitorado']['2022']) == 27
    with psycopg.connect('dbname=eleicoes_nacional') as conn:
        eleitor = conn.execute("""SELECT SUM(pc.comparecimento * nivel_escolaridade(pc.escolaridade))::NUMERIC
              / NULLIF(SUM(pc.comparecimento) FILTER (WHERE nivel_escolaridade(pc.escolaridade) IS NOT NULL), 0)
            FROM perfil_comparecimento pc JOIN eleicao e USING (cod_eleicao) JOIN municipio m USING (cod_tse)
            WHERE pc.turno = 1 AND e.ano = 2022 AND m.uf = 'SP'""").fetchone()[0]
        votado = conn.execute("""SELECT SUM(vc.votos * nivel_escolaridade(v.escolaridade))::NUMERIC
              / NULLIF(SUM(vc.votos) FILTER (WHERE nivel_escolaridade(v.escolaridade) IS NOT NULL), 0)
            FROM votos_cand vc JOIN vw_candidatura v USING (sq_candidato) JOIN municipio m ON m.cod_tse = vc.cod_tse
            WHERE vc.turno = 1 AND v.ano = 2024 AND v.cargo = 'VEREADOR' AND m.uf = 'BA'""").fetchone()[0]
    assert est['eleitorado']['2022']['SP'] == pytest.approx(float(eleitor), abs=0.001)
    assert est['votados']['2024']['VEREADOR']['BA'] == pytest.approx(float(votado), abs=0.001)


@pytest.mark.banco
@pytest.mark.parametrize('ue,ano,cargo', [('20516', 2024, 'VEREADOR'), ('PB', 2022, 'DEPUTADO FEDERAL')])
def test_candidatos_trazem_a_escolaridade_de_quem_votou_neles(ue, ano, cargo):
    """O mais votado do cargo: o grau dele e a nota média de quem foi votar nos municípios onde teve votos, com peso
    pelos votos que teve em cada um."""
    import psycopg
    arq = json.loads((DADOS / f'escolaridade/candidatos/{ue}-{ano}.json').read_text())
    c = {nome: i for i, nome in enumerate(arq['campos'])}
    linhas = [l for l in arq['linhas'] if arq['cargos'][l[c['cargo']]] == cargo]
    topo = max(linhas, key=lambda l: l[c['votos']] or 0)
    with psycopg.connect('dbname=eleicoes') as conn:
        sq, nivel = conn.execute("""SELECT v.sq_candidato, nivel_escolaridade(v.escolaridade) FROM vw_candidatura v
            JOIN votos_cand vc USING (sq_candidato) WHERE v.ano = %s AND v.ue = %s AND v.cargo = %s AND vc.turno = 1
            GROUP BY 1, 2 ORDER BY SUM(vc.votos) DESC LIMIT 1""", (ano, ue, cargo)).fetchone()
        esperado = conn.execute("""WITH el AS (
              SELECT pc.cod_tse, SUM(pc.comparecimento * nivel_escolaridade(pc.escolaridade))::NUMERIC
                / NULLIF(SUM(pc.comparecimento) FILTER (WHERE nivel_escolaridade(pc.escolaridade) IS NOT NULL), 0) AS n
              FROM perfil_comparecimento pc JOIN eleicao e USING (cod_eleicao) WHERE pc.turno = 1 AND e.ano = %s GROUP BY 1)
            SELECT SUM(vc.votos * el.n) / NULLIF(SUM(vc.votos) FILTER (WHERE el.n IS NOT NULL), 0)
            FROM votos_cand vc JOIN el USING (cod_tse) WHERE vc.sq_candidato = %s AND vc.turno = 1""", (ano, sq)).fetchone()[0]
    assert topo[c['nivel']] == nivel
    assert topo[c['nivel_eleitores']] == pytest.approx(float(esperado), abs=0.001)
    assert topo[c['pid']] and topo[c['nome']]


@pytest.mark.banco
def test_alternancia_e_idade_dos_prefeitos_batem_com_p06a():
    """Mais jovens e mais velhos pela mediana dos 1.238 municípios; em 2020 e 2024, a idade média dos prefeitos eleitos
    e a parcela de eleições em que o partido, ou a pessoa, mudou em relação à eleição anterior."""
    import statistics
    ida = json.loads((DADOS / 'idade/idade.json').read_text())
    c = {n: i for i, n in enumerate(ida['campos_prefeito'])}
    mediana = statistics.median(m[3] for m in ida['municipios'])
    grupos = {'Mais jovem': [0, [], [0, 0], [0, 0]], 'Mais velho': [0, [], [0, 0], [0, 0]]}
    for cod, _, _, idade_mediana, _ in ida['municipios']:
        g = grupos['Mais velho' if idade_mediana >= mediana else 'Mais jovem']
        lista = ida['prefeitos'].get(cod, [])
        if any(p[c['ano']] in (2020, 2024) for p in lista):
            g[0] += 1
        for ant, p in zip([None] + lista[:-1], lista):
            if p[c['ano']] not in (2020, 2024):
                continue
            if p[c['idade']] is not None:
                g[1].append(p[c['idade']])
            if ant is not None:
                g[2][1] += 1
                g[2][0] += p[c['partido']] != ant[c['partido']]
                if ant[c['pid']] is not None:
                    g[3][1] += 1
                    g[3][0] += p[c['pid']] is not None and p[c['pid']] != ant[c['pid']]
    for perfil, municipios, idade, alt_partido, alt_pessoa in _consulta('p06a_alternancia.sql'):
        g = grupos[perfil]
        assert g[0] == municipios
        assert round(statistics.fmean(g[1]), 1) == pytest.approx(float(idade), abs=0.051)
        assert 100 * g[2][0] / g[2][1] == pytest.approx(float(alt_partido), abs=0.01)
        assert 100 * g[3][0] / g[3][1] == pytest.approx(float(alt_pessoa), abs=0.01)


@pytest.mark.banco
@pytest.mark.parametrize('ano,cargo', [(2024, 'VEREADOR'), (2020, 'PREFEITO')])
def test_jovem_vota_jovem_bate_com_p06b(ano, cargo):
    """A parcela de votantes até 34 anos e a idade média de quem recebeu os votos, município a município, como a p06b."""
    ida = json.loads((DADOS / 'idade/idade.json').read_text())
    cods = [m[0] for m in ida['municipios']]
    jovens, votada = ida['jovens'][str(ano)][cargo], ida['idade_votada'][str(ano)][cargo]
    sql = _consulta('p06b_jovem_vota_jovem.sql', ano=ano, cargo=cargo)
    assert len(sql) == sum(1 for j, v in zip(jovens, votada) if j is not None and v is not None)
    for quintil, cod, pct, idade in sql:
        i = cods.index(cod)
        assert jovens[i] == pytest.approx(float(pct), abs=0.006)
        assert votada[i] == pytest.approx(float(idade), abs=0.051)


@pytest.mark.banco
def test_jovem_vota_jovem_so_tem_cargos_do_municipio():
    ida = json.loads((DADOS / 'idade/idade.json').read_text())
    assert ida['anos'] == [2020, 2024]
    assert all(set(c) <= {'PREFEITO', 'VEREADOR'} for c in ida['cargos'].values())
