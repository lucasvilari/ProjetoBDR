# Documentação do modelo

## `modelo/modelo_relacional.html`

Página única, que abre direto no navegador, com o D.E.R. em notação de Chen (zoom e
navegação) e as 17 tabelas do banco, com o mapeamento entre os dois e as chaves
estrangeiras. Precisa de internet só para as fontes e para o Graphviz, que desenha os
diagramas no navegador.

Ela é gerada a partir de `modelo_relacional.template.html` e de `esquema.json`, uma
cópia do catálogo do banco carregado:

```bash
cd docs/modelo
python3 gera_pagina.py              # usa o esquema.json guardado
python3 gera_pagina.py --atualizar  # relê o catálogo do banco eleicoes antes (psql)
```

A descrição dos três diagramas do D.E.R. (entidades, relacionamentos, atributos e
cardinalidades) fica no próprio template, na constante `DER`.

## `modelo/der/`

As figuras 1 a 3 do dossiê, em SVG e PNG, geradas com a mesma descrição e o mesmo
Graphviz da página, para que os dois nunca divirjam:

```bash
cd docs/modelo/der
curl -sLO https://cdn.jsdelivr.net/npm/@viz-js/viz@3.30.0/dist/viz-global.js
node gera_figuras.mjs viz-global.js
```

O PNG de reserva é convertido a partir do SVG pelo LibreOffice (`soffice --convert-to png`).
