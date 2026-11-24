"""IBGE: tabelas do SIDRA (PIB, população, Censos, CEMPRE, PNAD Contínua) e API de Localidades."""
from dataclasses import dataclass
from pathlib import Path

import httpx

from .rede import obter_json, requisitar
from .saida import gravar_csv

SIDRA = "https://apisidra.ibge.gov.br/values"
AGREGADOS = "https://servicodados.ibge.gov.br/api/v3/agregados"
LOCALIDADES = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios"
UFS = (11, 12, 13, 14, 15, 16, 17, 21, 22, 23, 24, 25, 26, 27, 28, 29,
       31, 32, 33, 35, 41, 42, 43, 50, 51, 52, 53)


@dataclass(frozen=True)
class Tabela:
    numero: int
    variaveis: tuple[int, ...]
    arquivo: str
    ano_min: int | None = None
    classificacoes: tuple[tuple[int, str], ...] = ()  # (classificação, categorias)
    nivel: str = "n6"                                  # n6: município; n3: UF


TABELAS = {
    # PIB a preços correntes (mil R$); dividido pela população do ano dá o per capita.
    # Mesma tabela traz o valor adicionado bruto por atividade: agropecuária (513), indústria (517),
    # serviços exclusive administração pública (6575), administração pública (525) e impostos (543).
    # A série começa em 2010 para cobrir os mandatos eleitos em 2012, 2016 e 2020.
    "ibge_pib": Tabela(5938, (37, 513, 517, 6575, 525, 543), "pib/pib_municipios_tabela5938.csv", ano_min=2010),
    # Estimativas anuais. Não existem para 2022 e 2023: em 2022 use o Censo.
    "ibge_populacao_estimada": Tabela(6579, (9324,), "populacao/estimativas_populacao_tabela6579.csv", ano_min=2010),
    "ibge_censo2022_populacao": Tabela(4709, (93,), "populacao/censo2022_populacao_tabela4709.csv"),
    # Índice de envelhecimento (10612) e idade mediana (10613).
    "ibge_censo2022_idade": Tabela(9515, (10612, 10613), "censo2022/idade_mediana_envelhecimento_tabela9515.csv"),
    # Todos os níveis de instrução; total de grupo de idade (18+), sexo e cor/raça.
    "ibge_censo2022_instrucao": Tabela(
        10061, (2667, 1002667), "censo2022/nivel_instrucao_18mais_tabela10061.csv",
        classificacoes=((1568, "all"), (58, "95253"), (2, "6794"), (86, "95251")),
    ),
    # Empregos formais: pessoal ocupado total no Cadastro Central de Empresas (CEMPRE). A série muda de tabela em 2022.
    "ibge_cempre": Tabela(1685, (707,), "cempre/pessoal_ocupado_tabela1685.csv", ano_min=2010),
    "ibge_cempre_2022": Tabela(9509, (707,), "cempre/pessoal_ocupado_tabela9509.csv"),
    # PNAD Contínua, por UF e trimestre: taxa de desocupação (14 anos ou mais) e taxa de informalidade dos ocupados.
    "ibge_pnad_desocupacao": Tabela(4099, (4099,), "pnad/taxa_desocupacao_uf_tabela4099.csv", nivel="n3"),
    "ibge_pnad_informalidade": Tabela(8529, (12466,), "pnad/taxa_informalidade_uf_tabela8529.csv", nivel="n3"),
    # Saneamento nos Censos, em % dos domicílios: abastecimento principal pela rede geral de água, e esgoto pela rede
    # geral ou pluvial ou em fossa séptica (2010: banheiro ou sanitário com esse escoadouro; 2022: rede, fossa ligada
    # à rede ou fossa não ligada). As categorias somadas vêm em linhas separadas.
    "ibge_censo2010_agua": Tabela(3218, (1000096,), "censo2010/agua_rede_tabela3218.csv",
                                  classificacoes=((61, "92853"), (299, "0"), (67, "0"), (309, "0"))),
    "ibge_censo2010_esgoto": Tabela(3218, (1000096,), "censo2010/esgoto_adequado_tabela3218.csv",
                                    classificacoes=((61, "0"), (299, "9678,9679"), (67, "0"), (309, "0"))),
    "ibge_censo2022_agua": Tabela(6804, (1000381,), "censo2022/agua_rede_tabela6804.csv",
                                  classificacoes=((301, "31471"), (1817, "72125"))),
    "ibge_censo2022_esgoto": Tabela(6805, (1000381,), "censo2022/esgoto_adequado_tabela6805.csv",
                                    classificacoes=((11558, "46290,72112"),)),
}


def _periodos(cli, tabela: Tabela) -> list[str]:
    periodos = [p["id"] for p in obter_json(cli, f"{AGREGADOS}/{tabela.numero}/periodos")]
    return [p for p in periodos if tabela.ano_min is None or int(p[:4]) >= tabela.ano_min]


def _consultar(cli, tabela: Tabela, periodo: str, recorte: str = "all") -> list[dict]:
    partes = [SIDRA, "t", str(tabela.numero), tabela.nivel, recorte,
              "v", ",".join(map(str, tabela.variaveis)), "p", periodo]
    for classificacao, categorias in tabela.classificacoes:
        partes += [f"c{classificacao}", categorias]
    return requisitar(cli, "/".join(partes)).json()


def _consultar_periodo(cli, tabela: Tabela, periodo: str) -> list[dict]:
    """Uma consulta para o país inteiro; se o SIDRA recusar pelo tamanho, uma por UF."""
    try:
        return _consultar(cli, tabela, periodo)
    except (httpx.HTTPStatusError, ValueError):
        linhas: list[dict] = []
        for uf in UFS:
            parte = _consultar(cli, tabela, periodo, f"in n3 {uf}")
            linhas += parte if not linhas else parte[1:]  # a 1ª linha de cada resposta é o cabeçalho
        return linhas


def _coletar_tabela(cli, chave: str, raiz: Path) -> list[Path]:
    tabela = TABELAS[chave]
    cabecalho, linhas = None, []
    for periodo in _periodos(cli, tabela):
        resposta = _consultar_periodo(cli, tabela, periodo)
        cabecalho = cabecalho or resposta[0]
        linhas += resposta[1:]
        print(f"    tabela {tabela.numero}, período {periodo}: {len(resposta) - 1} linhas", flush=True)
    destino = raiz / "ibge" / tabela.arquivo
    gravar_csv(destino, list(cabecalho.values()), [[linha.get(k, "") for k in cabecalho] for linha in linhas])
    return [destino]


def _coletar_municipios(cli, raiz: Path) -> list[Path]:
    cabecalho = ["cod_ibge", "municipio", "sg_uf", "uf", "sg_regiao", "regiao",
                 "cod_mesorregiao", "mesorregiao", "cod_microrregiao", "microrregiao",
                 "cod_regiao_intermediaria", "regiao_intermediaria", "cod_regiao_imediata", "regiao_imediata"]
    linhas = []
    for m in obter_json(cli, LOCALIDADES):
        micro = m.get("microrregiao") or {}
        meso = micro.get("mesorregiao") or {}
        imediata = m.get("regiao-imediata") or {}
        intermediaria = imediata.get("regiao-intermediaria") or {}
        uf = meso.get("UF") or intermediaria.get("UF") or {}
        regiao = uf.get("regiao") or {}
        linhas.append([m["id"], m["nome"], uf.get("sigla"), uf.get("nome"), regiao.get("sigla"), regiao.get("nome"),
                       meso.get("id"), meso.get("nome"), micro.get("id"), micro.get("nome"),
                       intermediaria.get("id"), intermediaria.get("nome"), imediata.get("id"), imediata.get("nome")])
    print(f"    {len(linhas)} municípios", flush=True)
    destino = raiz / "ibge" / "territorio" / "municipios.csv"
    gravar_csv(destino, cabecalho, linhas)
    return [destino]


def coletar(cli, chave: str, raiz: Path) -> list[Path]:
    if chave == "ibge_municipios":
        return _coletar_municipios(cli, raiz)
    return _coletar_tabela(cli, chave, raiz)
