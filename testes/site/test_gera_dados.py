"""Funções puras de site/gera_dados.py (não precisam de banco)."""
import pytest

import gera_dados


def test_importa():
    assert hasattr(gera_dados, 'PARTES')


# --------------------------------------------------------------------------- candidaturas

def test_unidade_partido_isolado():
    assert gera_dados.unidade_de(None, 'PL') == 'PL'
    assert gera_dados.unidade_de('', 'PL') == 'PL'
    assert gera_dados.unidade_de('PL', 'PL') == 'PL'
    assert gera_dados.unidade_de('Federação PSDB CIDADANIA (45-PSDB / 23-CIDADANIA)', 'PSDB').startswith('Federação')


def test_anonimo_sem_identificacao():
    r = {'ano': 2022, 'cargo': 3, 'partido': 22, 'unidade': 0, 'eleito': True, 'situacao': 1, 'votos': 1000,
         'votos_2t': None, 'despesa': 500.0, 'receita': 600.0, 'receita_publica': 300.0, 'patrimonio': 0,
         'nome': 'FULANO', 'pid': 7, 'foto': '2022/1/SP'}
    assert len(gera_dados.linha_candidatura(r, nomeado=False)) <= gera_dados.CAMPOS_CANDIDATURAS_RECORTE.index('nome')
    assert gera_dados.linha_candidatura(r, nomeado=True)[-3:] == ['FULANO', 7, '2022/1/SP']


def test_linha_arredonda_dinheiro_e_corta_vazios():
    r = {'ano': 2024, 'cargo': 7, 'partido': 1, 'unidade': 0, 'eleito': False, 'situacao': 0, 'votos': None,
         'votos_2t': None, 'despesa': None, 'receita': None, 'receita_publica': None, 'patrimonio': None}
    assert gera_dados.linha_candidatura(r, nomeado=False) == [2024, 7, 1, 0, False, 0]
    r.update(despesa=1234.56, votos=10)
    assert gera_dados.linha_candidatura(r, nomeado=False) == [2024, 7, 1, 0, False, 0, 10, None, 1235]


def test_fatia_de():
    assert gera_dados.fatia_de('MG', 2022) == 'candidaturas/MG-2022.json'


# --------------------------------------------------------------------------- legenda (pergunta 5)

def test_quociente_eleitoral_despreza_fracao_ate_meio():
    assert gera_dados.quociente_eleitoral(1000, 3) == 333     # 333,33
    assert gera_dados.quociente_eleitoral(1001, 2) == 500     # 500,5: fração igual a meio é desprezada
    assert gera_dados.quociente_eleitoral(1003, 2) == 501     # 501,5: idem
    assert gera_dados.quociente_eleitoral(1004, 3) == 335     # 334,67: fração acima de meio arredonda para cima
    assert gera_dados.quociente_eleitoral(1006, 4) == 251     # 251,5 → 251


# --------------------------------------------------------------------------- viés por cargo (pergunta 7)

def test_indice_ponderado():
    assert gera_dados.indice_ponderado({1: 100, 2: 300}, {1: 2.0, 2: 8.0}) == (6.5, 100.0)
    assert gera_dados.indice_ponderado({1: 100, 2: 100}, {1: 4.0}) == (4.0, 50.0)
    assert gera_dados.indice_ponderado({1: 100}, {}) == (None, 0.0)
    assert gera_dados.indice_ponderado({}, {1: 5.0}) == (None, 0.0)


def test_slug_de_cargo():
    assert gera_dados.slug_cargo('DEPUTADO FEDERAL') == 'deputado-federal'


def test_palavras_seguem_p09b():
    assert gera_dados.palavras('Ref. serviços de 10 adesivos PERFURADOS') == ['adesivos', 'perfurados']
    assert gera_dados.palavras('Confecção de santinhos; santinhos 10x15') == ['confecção', 'santinhos', 'santinhos', '10x15']
    assert gera_dados.palavras(None) == []


def test_contagem_de_palavras_pesa_lancamentos_e_valor():
    """Um grupo de n lançamentos iguais conta cada palavra n vezes e soma o valor do grupo por ocorrência."""
    cont = gera_dados.ContaPalavras()
    cont.soma('adesivos perfurados', 3, 300.0)
    cont.soma('adesivos', 1, 50.0)
    assert cont.top(5) == [['adesivos', 4, 350], ['perfurados', 3, 300]]


def test_candidatura_ganha_votos_no_fim():
    assert gera_dados.CAMPOS_CANDIDATURA == ['ano', 'cargo', 'local', 'partido', 'situacao', 'reeleicao', 'foto_sq',
                                             'patrimonio', 'receita', 'receita_publica', 'despesa', 'votos']


def test_nota_mais_proxima_do_ano():
    """A nota de um partido num ano é a da pesquisa mais próxima; no empate, a mais recente."""
    nota = gera_dados.nota_mais_proxima({7: [(2018, 8.1), (2022, 7.5)], 9: []})
    assert nota(7, 2018) == 8.1 and nota(7, 2024) == 7.5 and nota(7, 2020) == 7.5
    assert nota(9, 2022) is None and nota(1, 2022) is None


def test_meio_cifrao_de_dinheiro_publico():
    """A fatia de 5% (meio cifrão) da parcela pública da receita: 0 a 19, e 20 para 100% público."""
    assert gera_dados.meio_cifrao(0, 1000) == 0
    assert gera_dados.meio_cifrao(749, 1000) == 14
    assert gera_dados.meio_cifrao(750, 1000) == 15
    assert gera_dados.meio_cifrao(1000, 1000) == 20
    assert gera_dados.meio_cifrao(None, 1000) == 0
    assert gera_dados.meio_cifrao(10, 0) is None


def test_territorios_do_projeto():
    """Presidente entra só no Brasil; os demais cargos, só nos seis estados e nos municípios deles."""
    assert gera_dados.territorios_do_projeto('BR', None) == ['BR']
    assert gera_dados.territorios_do_projeto('MG', 'MG') == ['MG']
    assert gera_dados.territorios_do_projeto('41238', 'MG') == ['MG', '41238']
    assert gera_dados.territorios_do_projeto('SP', 'SP') == []
    assert gera_dados.territorios_do_projeto('71072', 'SP') == []


def test_chave_da_foto_antiga_normaliza_como_a_carga():
    """Uma linha do arquivo de candidatos do TSE vira a chave da candidatura no banco (ano, UE, cargo, título) e o
    número do candidato no TSE, com as mesmas normalizações da carga; fora do escopo ou sem número, None."""
    linha = {'ANO_ELEICAO': '2004', 'NM_TIPO_ELEICAO': 'ELEIÇÃO ORDINÁRIA', 'SG_UF': 'RO', 'SG_UE': '35',
             'DS_CARGO': 'Prefeito', 'SQ_CANDIDATO': '7', 'NR_TITULO_ELEITORAL_CANDIDATO': '123456789'}
    assert gera_dados.chave_da_foto_antiga(linha) == ((2004, '00035', 'PREFEITO', '000123456789'), 7)
    assert gera_dados.chave_da_foto_antiga({**linha, 'DS_CARGO': '1. Suplente'})[0][2] == '1º SUPLENTE'
    assert gera_dados.chave_da_foto_antiga({**linha, 'SG_UF': 'SP'}) is None
    assert gera_dados.chave_da_foto_antiga({**linha, 'NM_TIPO_ELEICAO': 'ELEIÇÃO SUPLEMENTAR'}) is None
    assert gera_dados.chave_da_foto_antiga({**linha, 'SQ_CANDIDATO': '#NULO#'}) is None
    presidente = {**linha, 'ANO_ELEICAO': '2006', 'SG_UF': 'BR', 'SG_UE': 'BR', 'DS_CARGO': 'PRESIDENTE', 'SQ_CANDIDATO': '10'}
    assert gera_dados.chave_da_foto_antiga(presidente) == ((2006, 'BR', 'PRESIDENTE', '000123456789'), 10)


def test_chave_de_pessoa():
    """Nome sem acentos, maiúsculo, só letras e espaços simples, mais a data de nascimento em ISO; sem data, None."""
    assert gera_dados.chave_de_pessoa('José  da Silva-Neto', '05/03/1960') == ('JOSE DA SILVA NETO', '1960-03-05')
    assert gera_dados.chave_de_pessoa('Maria', '0') is None
    assert gera_dados.chave_de_pessoa('Maria', '#NULO#') is None


LINHA_1994 = {'ANO_ELEICAO': '1994', 'NM_TIPO_ELEICAO': 'ELEIÇÃO ORDINÁRIA', 'NR_TURNO': '1', 'SG_UF': 'PB', 'SG_UE': 'PB',
              'DS_CARGO': 'Governador', 'NR_PARTIDO': '15', 'SG_PARTIDO': 'PMDB', 'DS_SIT_TOT_TURNO': '2º TURNO',
              'NM_CANDIDATO': 'Antônio Mariz', 'DT_NASCIMENTO': '05/12/1937'}


def test_candidatura_antiga():
    c = gera_dados.candidatura_antiga(LINHA_1994)
    assert c == {'ano': 1994, 'turno': 1, 'uf': 'PB', 'ue': 'PB', 'cargo': 'GOVERNADOR', 'numero': 15, 'sigla': 'PMDB',
                 'situacao': '2º TURNO', 'pessoa': ('ANTONIO MARIZ', '1937-12-05')}
    assert gera_dados.candidatura_antiga({**LINHA_1994, 'SG_UF': 'SP', 'SG_UE': 'SP'}) is None
    assert gera_dados.candidatura_antiga({**LINHA_1994, 'DT_NASCIMENTO': '0'}) is None
    assert gera_dados.candidatura_antiga({**LINHA_1994, 'SG_UE': '35', 'DS_SIT_TOT_TURNO': 'MÉDIA'})['ue'] == '00035'
    assert gera_dados.candidatura_antiga({**LINHA_1994, 'DS_SIT_TOT_TURNO': 'MÉDIA'})['situacao'] == 'ELEITO POR MÉDIA'
    assert gera_dados.candidatura_antiga({**LINHA_1994, 'DS_SIT_TOT_TURNO': '#NULO'})['situacao'] is None


def test_liga_candidaturas_antigas():
    """Liga cada candidatura antiga ao título de quem tem o mesmo nome e nascimento; junta os turnos (situação do
    último) e deixa de fora quem casa com mais de um título ou com nenhum."""
    t1 = gera_dados.candidatura_antiga(LINHA_1994)
    t2 = {**t1, 'turno': 2, 'situacao': 'ELEITO'}
    outro = {**t1, 'pessoa': ('FULANO', '1950-01-01')}
    sem_par = {**t1, 'pessoa': ('NINGUEM', '1950-01-01')}
    titulos = {('ANTONIO MARIZ', '1937-12-05'): {'000000000001'}, ('FULANO', '1950-01-01'): {'000000000002', '000000000003'}}
    ligadas = gera_dados.liga_candidaturas_antigas([t2, t1, outro, sem_par], titulos)
    assert list(ligadas) == ['000000000001']
    [c] = ligadas['000000000001']
    assert (c['ano'], c['cargo'], c['situacao']) == (1994, 'GOVERNADOR', 'ELEITO')


def test_exemplos_das_palavras():
    """Para cada palavra escolhida, as duas despesas de maior valor que a contêm, sem repetir descrição; as
    descrições vão para uma lista, e cada palavra guarda os índices delas, na ordem das palavras."""
    ex = gera_dados.ExemplosDePalavras({'hosped', 'aereo'}, k=2)
    ex.soma('HOSPED JOSE  15 A 18/09', 3810)
    ex.soma('TRANSP.AEREO GRU/JOI', 26977)
    ex.soma('HOSPEDAGEM e HOSPED ANA', 1743)
    ex.soma('HOSPED JOSE  15 A 18/09', 100)          # mesma descrição, valor menor: não repete
    ex.soma('HOSPED BARATO', 50)
    descricoes, por_palavra = ex.saida(['aereo', 'hosped', 'outra'])
    assert descricoes == [['TRANSP.AEREO GRU/JOI', 26977], ['HOSPED JOSE 15 A 18/09', 3810], ['HOSPEDAGEM e HOSPED ANA', 1743]]
    assert por_palavra == [[0], [1, 2], []]


def test_descricao_longa_e_cortada():
    assert gera_dados.limpa_descricao('A' * 120) == 'A' * 89 + '…'
    assert gera_dados.limpa_descricao('  ADESIVO   7·8X7·8 ') == 'ADESIVO 7·8X7·8'


def test_exemplo_mostra_o_item_da_nota_com_a_palavra():
    """Uma despesa junta os itens da nota com " | ": o exemplo de cada palavra é o item em que ela aparece."""
    ex = gera_dados.ExemplosDePalavras({'cgh', 'aereo'}, k=2)
    ex.soma('TRANSP AEREO FULANO AJU/REC | TRANSP AEREO BELTRANO CGH/BSB | OUTRO', 777067)
    descricoes, por_palavra = ex.saida(['cgh', 'aereo'])
    assert [descricoes[i][0] for i in por_palavra[0]] == ['TRANSP AEREO BELTRANO CGH/BSB']
    assert [descricoes[i][0] for i in por_palavra[1]] == ['TRANSP AEREO FULANO AJU/REC']


def test_resultado_da_eleicao_presidencial_de_2006_entra_a_mao():
    """O arquivo de 2006 do TSE não traz o resultado de presidente: Lula (PT) reeleito, os demais aptos não eleitos,
    a candidatura indeferida (PCO) sem resultado; as outras eleições ficam como vieram."""
    corrige = gera_dados.corrige_presidente_2006
    assert corrige(2006, 'PRESIDENTE', 'PT', None, False, False) == ('ELEITO', True, True)
    assert corrige(2006, 'PRESIDENTE', 'PSDB', None, False, False) == ('NÃO ELEITO', False, False)
    assert corrige(2006, 'PRESIDENTE', 'PCO', None, False, False) == (None, False, False)
    assert corrige(2010, 'PRESIDENTE', 'PT', 'ELEITO', True, False) == ('ELEITO', True, False)
    assert corrige(2006, 'GOVERNADOR', 'PT', None, False, False) == (None, False, False)


def test_palavras_que_so_diferem_em_acento_contam_juntas():
    """"militancia", "militância" e "MILITÂNCIA" são a mesma palavra: as contagens se somam e a nuvem mostra a grafia
    mais usada."""
    cont = gera_dados.ContaPalavras()
    cont.soma('militancia de rua', 2, 200.0)
    cont.soma('Militância de rua', 5, 500.0)
    cont.soma('mobilização', 1, 10.0)
    cont.soma('mobilizacao', 1, 30.0)
    top = cont.top(10)
    assert top[0] == ['militância', 7, 700]
    assert ['rua', 7, 700] in top
    assert len([w for w, _, _ in top if w.startswith('mobiliza')]) == 1


def test_exemplos_acham_a_palavra_em_qualquer_grafia():
    ex = gera_dados.ExemplosDePalavras({'mobilização'}, k=3)
    ex.soma('PAGAMENTO MOBILIZACAO DE RUA', 900)
    ex.soma('Mobilização eleitoral', 100)
    descricoes, por_palavra = ex.saida(['mobilização'])
    assert [descricoes[i][0] for i in por_palavra[0]] == ['PAGAMENTO MOBILIZACAO DE RUA', 'Mobilização eleitoral']


def test_mais_recente_ate_o_ano():
    """O índice de uma eleição é o mais recente publicado até o ano dela (o PIB de 2023 serve a 2024)."""
    serie = {2010: 0.5, 2018: 1.0, 2021: 2.0, 2023: 3.0}
    assert gera_dados.mais_recente(serie, 2024) == (2023, 3.0)
    assert gera_dados.mais_recente(serie, 2020) == (2018, 1.0)
    assert gera_dados.mais_recente(serie, 2009) == (None, None)
    assert gera_dados.mais_recente({}, 2024) == (None, None)


def test_indices_do_estado_somam_os_municipios_com_peso_da_populacao():
    """PIB per capita, eleitores por habitante e isentos do estado são razões de somas; o IDHM é a média dos municípios
    com peso da população. Município sem um dado fica fora só daquele índice."""
    municipios = [
        {'pib_pc': 10_000, 'pop': 100, 'idhm': 0.6, 'aptos': 80, 'isentos': 20},
        {'pib_pc': 40_000, 'pop': 300, 'idhm': 0.8, 'aptos': 200, 'isentos': 40},
        {'pib_pc': None, 'pop': 100, 'idhm': None, 'aptos': 50, 'isentos': 10},
    ]
    pib, idhm, razao, isentos = gera_dados.agrega_estado(municipios)
    assert pib == pytest.approx((10_000 * 100 + 40_000 * 300) / 400)
    assert idhm == pytest.approx((0.6 * 100 + 0.8 * 300) / 400)
    assert razao == pytest.approx(330 / 500)
    assert isentos == pytest.approx(100 * 70 / 330)


def test_indices_do_estado_sem_dados():
    assert gera_dados.agrega_estado([{'pib_pc': None, 'pop': None, 'idhm': None, 'aptos': None, 'isentos': None}]) == [None] * 4
