# Site: Olho do Povo

Site estático que responde às perguntas do projeto com os dados do banco. A página inicial é um
oráculo: um olho cercado pelas dez perguntas, cada uma com o que responde e como é calculada. As
perguntas respondidas têm uma página cada, com uma visualização própria:

| Página | Pergunta | A visualização |
|---|---|---|
| `index.html` | apresentação, fontes e a roda das perguntas | o olho que se abre e as dez perguntas em volta dele |
| `pergunta-1.html` | Quanto custa uma cadeira? | o plenário em 3D (ou 2D) com a multidão de quem tentou, as moedas do gasto, por partido e por político |
| `pergunta-2.html` | Patrimônio ajuda a eleger? | um prédio: cada andar uma faixa de patrimônio, cada janela um candidato, acesa quando se elegeu; os moradores de cada andar e patrimônio × votos |
| `pergunta-5.html` | Quem entrou pela legenda? | cada eleito é um copo cheio até o quociente: os puxadores transbordam, e a sobra deles e a jarra da chapa (colegas sem cadeira e legenda) enchem os copos dos outros |
| `pergunta-7.html` | Para que lado se vota? | o mapa do vermelho (esquerda) ao azul (direita), por cargo e ano, nas duas réguas, com linha do tempo; e os partidos |
| `pergunta-8.html` | Dinheiro público elege? | o leitor preenche dez cifrões com a parcela de dinheiro público e vê a taxa de vitória de quem tem pelo menos isso; cada candidato e cada partido como uma torneira |
| `pergunta-9.html` | Onde gastam em propaganda? | a rua da campanha, com um objeto por tipo de despesa, e a TV com as palavras das despesas |
| `pergunta-10.html` | Como foi a carreira de um político? | a linha do tempo com um santinho por eleição, de 1994 a 2024 (1994 e 1996 ligadas pelo nome e nascimento), com foto de 2004 em diante |

Os dados cobrem os seis estados do projeto (Amapá, Mato Grosso do Sul, Minas Gerais, Paraíba,
Rondônia e Roraima) e a eleição para presidente. Nas páginas com seletor (perguntas 1, 2, 5, 8 e 9), o lugar é
sempre um desses estados ou um município deles, onde há os dados completos de cada candidato; presidente é a
única eleição nacional. A pergunta 7, o mapa ideológico, cobre o Brasil inteiro. Sempre que há um número de um
político (gasto, patrimônio, dinheiro público), ele vem com os votos e o custo por voto.

As páginas antigas (`cadeiras.html`, `mapa.html`, `partido.html`, `politico.html`) só levam à página
nova da pergunta, com o mesmo recorte (`js/lib/redirecionamentos.js`).

Não há servidor nem banco em funcionamento: as páginas leem arquivos JSON em `dados/`, gerados uma
vez a partir do banco. HTML, CSS e JavaScript puros, com módulos do navegador; gráficos com
[Observable Plot](https://observablehq.com/plot/), mapa com [D3](https://d3js.org/) e o plenário em 3D
com [three.js](https://threejs.org/), todos carregados do jsDelivr com versão fixa.

## Visual

O tema é a urna eletrônica: corpo bege, teclas pretas em relevo, visor afundado. A navegação são as
teclas numeradas das perguntas. Cada resposta aparece num santinho, o cartãozinho de campanha, com o
número da pergunta na caixa e, no verso, como o número foi calculado e de qual consulta ele sai. As
cores têm papéis fixos (`js/lib/cores.js`): verde para vitória, laranja com "×" para derrota, vermelho
para a esquerda e azul para a direita, e o verde-água do dinheiro público na pergunta 8.

## Estrutura

```
site/
├── index.html, pergunta-N.html   a roda e uma página por pergunta
├── cadeiras.html, mapa.html,     endereços antigos, que levam às páginas novas
│   partido.html, politico.html
├── css/estilo.css                estilo comum
├── js/comum.js                   cabeçalho, rodapé, santinho, leitura dos dados e formatos
├── js/pecas.js                   seletor de recorte, candidatos do recorte, dinheiro × votos, cartão de político
├── js/busca.js                   busca de políticos por nome e leitura da carreira
├── js/pergunta-N.js              uma por página (e plenario-2d.js, plenario-3d.js, rua.js)
├── js/lib/                       funções puras, testadas em testes/site/js
├── gera_dados.py                 gera dados/ a partir do banco
└── dados/
    ├── mapa/            perguntas 1, 2 e 8: brasil.json e municipios/<UF>.json
    ├── candidaturas/    cada candidato de 2018 a 2024: <unidade>-<ano>.json
    ├── dependencia/     pergunta 8: candidatos e eleitos por fatia de 5% de dinheiro público
    ├── partidos-recorte/ pergunta 1: cadeiras, gasto e votos dos eleitos por partido, <BR ou UF>.json
    ├── legenda/         pergunta 5: eleitos, quociente e votos de cada chapa por <unidade>.json, e resumo.json
    ├── vies/            pergunta 7: brasil.json e municipios/<UF>[-<cargo>].json
    ├── partidos.json    medidas de ideologia e eleitos por partido
    ├── propaganda/      pergunta 9: <unidade>.json, pessoas/<n>.json e exemplos/ (despesas de cada palavra da TV, baixadas só ao clicar)
    ├── geo/             contornos do IBGE (estados e municípios dos seis estados)
    └── politicos/       índice de busca, fichas e carreiras, em fatias
```

## Gerar os dados

O gerador usa dois bancos: o dos seis estados (`eleicoes`, o do dump), para os nomes, as carreiras e a
legenda, e um com o país inteiro, para o mapa, os partidos, o viés, as listas de
candidatos e a propaganda. O banco nacional é carregado com `banco/carga.py --ufs todas` num banco
separado:

```bash
createdb eleicoes_nacional
```

```bash
DATABASE_URL="dbname=eleicoes_nacional" banco/.venv/bin/python banco/carga.py --ufs todas
```

```bash
cd site && ../banco/.venv/bin/python gera_dados.py
```

As fotos dos candidatos de 2004 a 2016 precisam dos arquivos de candidatos do TSE que o crawler baixa
(`crawler/dados/tse/candidatos/<ano>/`): o banco guarda, nesses anos, um número sintético no lugar do número do
candidato no TSE, e a parte `politicos` o lê desses arquivos. Sem eles, o site sai igual, só sem essas fotos.

Uma parte só: `--partes politicos` (ou `mapa`, `geo`, `partidos`, `vies`, `partidos_recorte`,
`dependencia`, `candidaturas`, `legenda`, `propaganda`). A docstring de `gera_dados.py` diz o que cada parte grava e de qual banco
lê. Título eleitoral, CPF e data de nascimento não saem do banco: cada político recebe um número
sequencial próprio.

## Testes

As funções puras do site e do gerador têm testes em `testes/site/`. Os marcados `banco` conferem os
arquivos gerados contra as consultas de `banco/sql/` e só rodam com o banco `eleicoes` disponível.

```bash
node --test 'testes/site/js/*.test.mjs'
```

```bash
banco/.venv/bin/python -m pytest testes/site
```

## Ver localmente

O navegador não lê os JSON de uma página aberta direto do disco; é preciso servi-la:

```bash
python3 -m http.server 8765 --directory site
```

Depois abra http://localhost:8765.

## Publicação

O workflow `.github/workflows/site.yml` publica esta pasta no GitHub Pages a cada push na `main` que
altere `site/`. Nas configurações do repositório, em Pages, a fonte deve ser "GitHub Actions".

As páginas carregam o CSS e os módulos com `?v=` e uma data (por exemplo `css/estilo.css?v=20261016`),
os módulos importam uns aos outros com a mesma data, e `carregaDados` (em `js/comum.js`) a usa também
para os JSON. Ao mudar qualquer CSS, JS ou dado, troque essa data em todos os lugares de uma vez
(`grep -rn "20261016" site --include=*.html --include=*.js`): o GitHub Pages guarda os arquivos em cache
por alguns minutos, e sem a troca um visitante pode receber um módulo ou um dado antigo junto com uma
página nova.
