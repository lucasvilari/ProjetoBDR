"""Séries municipais do Atlas do Desenvolvimento Humano no Brasil (PNUD/Ipea/FJP), via API do Ipeadata.

O arquivo de "dados brutos" do site do Atlas saiu do ar, e a API interna do site
(atlasbrasil.org.br) recusa acesso automatizado (HTTP 403). O Ipeadata publica as
mesmas séries do Atlas por município, identificadas pelo código IBGE de 7 dígitos.
Os indicadores são censitários (1991, 2000, 2010); se o Atlas publicar uma edição
nova, ela entra aqui sem mudança de código.

Cada item do catálogo desta fonte corresponde a um conjunto de séries gravado num
arquivo próprio, com uma linha por município e ano.
"""
from pathlib import Path

from .rede import obter_json
from .saida import gravar_csv

API = "http://www.ipeadata.gov.br/api/odata4/ValoresSerie(SERCODIGO='{codigo}')"

# item do catálogo -> (arquivo em dados/ipea_atlas, {série do Ipeadata: coluna})
CONJUNTOS = {
    "idhm": ("idhm_municipios.csv", {
        "ADH_IDHM": "idhm",
        "ADH_IDHM_E": "idhm_educacao",
        "ADH_IDHM_L": "idhm_longevidade",
        "ADH_IDHM_R": "idhm_renda",
    }),
    # P4: escolaridade da população adulta. O Atlas publica essas faixas etárias no
    # Ipeadata; as de 18 anos ou mais existem só no site do Atlas.
    "atlas_escolaridade": ("escolaridade_municipios.csv", {
        "ADH_T_ANALF15M": "taxa_analfabetismo_15mais",
        "ADH_T_FUND25M": "pct_fundamental_completo_25mais",
        "ADH_T_MED25M": "pct_medio_completo_25mais",
        "ADH_T_SUPER25M": "pct_superior_completo_25mais",
    }),
    # P6: perfil etário anterior às eleições do escopo padrão.
    "atlas_envelhecimento": ("envelhecimento_municipios.csv", {
        "ADH_T_ENV": "taxa_envelhecimento",
    }),
}


def coletar(cli, chave: str, raiz: Path) -> list[Path]:
    arquivo, series = CONJUNTOS[chave]
    valores: dict[tuple[str, str], dict[str, float]] = {}
    for codigo, coluna in series.items():
        url, n = API.format(codigo=codigo), 0
        while url:
            resposta = obter_json(cli, url)
            for v in resposta["value"]:
                if (v.get("NIVNOME") or "").startswith("Munic"):
                    valores.setdefault((v["TERCODIGO"], v["VALDATA"][:4]), {})[coluna] = v["VALVALOR"]
                    n += 1
            url = resposta.get("@odata.nextLink")
        print(f"    {codigo}: {n} valores municipais", flush=True)
        if n == 0:
            raise RuntimeError(f"a série {codigo} não trouxe valores municipais")
    colunas = list(series.values())
    destino = raiz / "ipea_atlas" / arquivo
    gravar_csv(destino, ["cod_ibge", "ano", *colunas],
               [[cod, ano, *(v.get(c, "") for c in colunas)] for (cod, ano), v in sorted(valores.items())])
    return [destino]
