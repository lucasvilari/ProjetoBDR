"""Conferência dos dados gerados em site/dados/ contra o que o banco e as outras partes produzem.
Rodar depois de gerar as partes envolvidas; precisa do PostgreSQL (marcador "banco")."""
import json
from pathlib import Path

import pytest

import gera_dados

DADOS = Path(gera_dados.DADOS)
CAMPOS = gera_dados.CAMPOS_CANDIDATURAS_RECORTE


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
        assert int(ano) in (2018, 2020, 2022, 2024) and cargo
        assert all(0 <= i < len(d['tipos']) for i, _ in r['gasto'])
        assert all(0 <= i < len(d['palavras']) for i, _, _ in r['palavras']) and len(r['palavras']) <= 30


@pytest.mark.banco
def test_carreira_tem_votos_de_2018_em_diante_e_presidente_nacional():
    t = json.loads((DADOS / 'politicos/tabelas.json').read_text())
    iv = t['campos_candidatura'].index('votos')
    for pid in (364652, 269682):          # Ricardo Coutinho e Lula
        nome, linhas, _ = json.loads((DADOS / f'politicos/carreira/{(pid - 1) // 1000}.json').read_text())[str(pid)]
        for l in linhas:
            votos = l[iv] if len(l) > iv else None
            if l[0] < 2018:
                assert votos is None
        if pid == 269682:
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
    assert [t['cargos'][l[1]] for l in carreira(269682) if l[0] == 1994] == ['PRESIDENTE']
    assert [(t['cargos'][l[1]], l[2]) for l in carreira(364652) if l[0] == 1996] == [('VEREADOR', '20516')]
