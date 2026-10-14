// Página Mapa (perguntas 1, 2 e 8): Brasil, estados do projeto e seus municípios.
//
// Dados (gerados por gera_dados.py):
//   mapa/brasil.json            linhas do Brasil e das 27 UFs
//   mapa/municipios/UF.json     linhas dos municípios de uma UF do projeto
//   geo/estados.json, geo/municipios/UF.json   contornos do IBGE
// A seleção (pergunta, ano, cargo, faixa, UF e município) fica no endereço da página.
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import * as Plot from 'https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.17/+esm';
import { montaPagina, carregaDados, formata, comSeta, santinho } from './comum.js?v=20261013';

montaPagina();

const NOME_UF = {
  AC: 'Acre', AL: 'Alagoas', AM: 'Amazonas', AP: 'Amapá', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal',
  ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MG: 'Minas Gerais', MS: 'Mato Grosso do Sul',
  MT: 'Mato Grosso', PA: 'Pará', PB: 'Paraíba', PE: 'Pernambuco', PI: 'Piauí', PR: 'Paraná', RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte', RO: 'Rondônia', RR: 'Roraima', RS: 'Rio Grande do Sul', SC: 'Santa Catarina',
  SE: 'Sergipe', SP: 'São Paulo', TO: 'Tocantins',
};
const CARGOS_MUNICIPAIS = ['PREFEITO', 'VEREADOR'];
// "no Brasil", "na Paraíba", "no Amapá"; os demais estados e os municípios levam "em"
const PREPOSICAO = { Brasil: 'no', 'Amapá': 'no', 'Paraíba': 'na', Acre: 'no', Amazonas: 'no', 'Pará': 'no',
  Tocantins: 'no', 'Maranhão': 'no', 'Piauí': 'no', 'Ceará': 'no', 'Rio Grande do Norte': 'no', 'Espírito Santo': 'no',
  'Rio de Janeiro': 'no', 'Paraná': 'no', 'Rio Grande do Sul': 'no', 'Distrito Federal': 'no', Bahia: 'na' };
const em = nome => `${PREPOSICAO[nome] ?? 'em'} ${nome}`;
// escala do verde-limão ao verde-escuro: até a classe mais baixa se destaca do fundo bege;
// "sem dado" é hachurado, para não se confundir com valor baixo
const SEM_DADO = 'url(#sem-dado)';
const CORES = ['#d4ee74', '#9bd35a', '#4fb548', '#1d8a3f', '#0b5a2e'];
const RAMPA = d3.piecewise(d3.interpolateRgb, CORES);

const brasil = await carregaDados('mapa/brasil.json');
const geoEstados = await carregaDados('geo/estados.json');
const ufsProjeto = new Set(brasil.ufs_projeto);

const form = document.getElementById('controles');
const selAno = form.elements.ano, selCargo = form.elements.cargo, selFaixa = form.elements.faixa;
const svgCaixa = document.getElementById('mapa');
const painel = document.getElementById('painel');

// ---------------------------------------------------------------- estado da página

const estado = { pergunta: 'custo', ano: 2022, cargo: 'DEPUTADO FEDERAL', faixa: null, uf: null, mun: null };

function leEndereco() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (['custo', 'patrimonio', 'dependencia', 'vies'].includes(p.get('pergunta'))) estado.pergunta = p.get('pergunta');
  if (brasil.anos.includes(Number(p.get('ano')))) estado.ano = Number(p.get('ano'));
  if (p.get('cargo')) estado.cargo = p.get('cargo');
  estado.faixa = p.has('faixa') ? Number(p.get('faixa')) : null;
  estado.uf = ufsProjeto.has(p.get('uf')) ? p.get('uf') : null;
  estado.mun = estado.uf && p.get('mun') ? p.get('mun') : null;
}

function escreveEndereco() {
  const p = new URLSearchParams({ pergunta: estado.pergunta, ano: estado.ano });
  if (!ehVies()) p.set('cargo', estado.cargo);
  if (estado.faixa != null && comFaixas()) p.set('faixa', estado.faixa);
  if (estado.uf) p.set('uf', estado.uf);
  if (estado.mun) p.set('mun', estado.mun);
  history.replaceState(null, '', `#${p}`);
}

// ---------------------------------------------------------------- leitura das linhas

const idxCargo = c => brasil.cargos.indexOf(c);
const registro = (campos, linha) => Object.fromEntries(campos.map((c, i) => [c, linha[i]]));

async function fonte(territorio) {
  // municípios moram no arquivo da UF; Brasil e UFs, no arquivo do Brasil
  if (/^\d{5}$/.test(territorio)) return carregaDados(`mapa/municipios/${estado.uf}.json`);
  return brasil;
}

function custos(dados, filtro) {
  return dados.custo.map(l => registro(brasil.campos_custo, l)).filter(filtro);
}
function faixas(dados, filtro) {
  return dados[estado.pergunta].map(l => registro(brasil.campos_faixa, l)).filter(filtro);
}

const ehCargo = r => r.ano === estado.ano && r.cargo === idxCargo(estado.cargo);
const custoMedio = r => (r.eleitos ? r.gasto_eleitos / r.eleitos : null);
const taxa = (eleitos, candidatos) => (candidatos ? (100 * eleitos) / candidatos : null);

/** Valor que colore cada território do mapa atual: {território: número}. */
function valoresDoMapa(dados) {
  const valores = {};
  if (estado.pergunta === 'custo') {
    for (const r of custos(dados, ehCargo)) valores[r.territorio] = custoMedio(r);
  } else {
    // parcela dos eleitos de cada território que está na faixa escolhida: a base são os
    // eleitos, então funciona até com um eleito só (governador) e não depende de muitos candidatos
    const eleitos = {}, naFaixa = {};
    for (const r of faixas(dados, ehCargo)) {
      eleitos[r.territorio] = (eleitos[r.territorio] ?? 0) + r.eleitos;
      if (r.faixa === estado.faixa) naFaixa[r.territorio] = r.eleitos;
    }
    for (const [t, total] of Object.entries(eleitos)) valores[t] = total ? (100 * (naFaixa[t] ?? 0)) / total : null;
  }
  delete valores.BR;          // o total do Brasil vai para o painel, não para as cores dos estados
  return valores;
}

// ---------------------------------------------------------------- pergunta 7: viés ideológico

const ehVies = () => estado.pergunta === 'vies';
const comFaixas = () => estado.pergunta === 'patrimonio' || estado.pergunta === 'dependencia';
// classes da consulta p07, da esquerda à direita, em degradê roxo → bege → dourado
const CORES_VIES = ['#5b3f99', '#9c88c4', '#ddd0b4', '#d4ab4f', '#b8860b'];

async function linhasVies(arquivo) {
  const dados = await carregaDados(arquivo);
  return dados.linhas.map(l => registro(dados.campos, l));
}
const viesBrasil = () => carregaDados('vies/brasil.json');

/** Índice de cada território do mapa atual no ano escolhido. */
async function valoresVies(naUF) {
  const linhas = await linhasVies(naUF ? `vies/municipios/${estado.uf}.json` : 'vies/brasil.json');
  return Object.fromEntries(linhas.filter(l => l.ano === estado.ano && (naUF || /^[A-Z]{2}$/.test(l.territorio)))
    .map(l => [l.territorio, l.indice]));
}

// degradê contínuo, centrado no 5: as classes da p07 deixariam quase todos os estados numa cor só
const VIES_MIN = 3, VIES_MAX = 8;
async function escalaVies() {
  const { faixas } = await viesBrasil();
  const esc = d3.scaleDiverging([VIES_MIN, 5, VIES_MAX], d3.interpolateRgbBasis([CORES_VIES[0], CORES_VIES[2], CORES_VIES[4]])).clamp(true);
  esc.faixas = faixas;
  return esc;
}

/** Legenda do viés: a barra em degradê com as fronteiras das cinco classes. */
function legendaVies(esc) {
  const pos = v => (100 * (v - VIES_MIN)) / (VIES_MAX - VIES_MIN);
  const paradas = d3.range(VIES_MIN, VIES_MAX + 0.01, 0.5).map(v => `${esc(v)} ${pos(v)}%`).join(', ');
  const cortes = esc.faixas.slice(0, -1).map(f => f[0]);
  return `<span class="legenda-titulo">Índice ideológico (0 = esquerda, 10 = direita)</span>
    <span class="escala-vies">
      <i style="background: linear-gradient(90deg, ${paradas})"></i>
      ${cortes.map(c => `<b style="left:${pos(c)}%">${String(c).replace('.', ',')}</b>`).join('')}
      <em class="ponta-esq">esquerda</em><em class="ponta-dir">direita</em>
    </span>
    <span class="legenda-faixas"><span><i class="sem-dado"></i>sem dado</span></span>`;
}

/** Texto branco ou escuro, o que tiver mais contraste com a cor de fundo. */
function textoSobre(cor) {
  const lum = c => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const { r, g, b } = d3.rgb(cor);
  const l = 0.2126 * lum(r) + 0.7152 * lum(g) + 0.0722 * lum(b);
  return (1.05 / (l + 0.05)) >= 4.5 ? '#ffffff' : '#22201c';
}

const virgula = v => (v == null ? '—' : String(v).replace('.', ','));
const corDaNota = n => (n == null ? '#9a8f7a' : d3.interpolateRgbBasis([CORES_VIES[0], CORES_VIES[2], CORES_VIES[4]])(Math.max(0, Math.min(1, (n - 3) / 5))));
const nomeCurto = n => n.split(' ').filter(p => p.length > 2).slice(-1)[0] ?? n;   // "LUIZ INÁCIO LULA DA SILVA" -> "SILVA"
const apelido = n => ({ 'LUIZ INÁCIO LULA DA SILVA': 'Lula', 'JAIR MESSIAS BOLSONARO': 'Bolsonaro', 'FERNANDO HADDAD': 'Haddad' })[n]
  ?? nomeCurto(n).charAt(0) + nomeCurto(n).slice(1).toLowerCase();

/** Duas linhas comparáveis entre si: gerais com gerais (deputado federal) e municipais com municipais (vereador). */
function graficoPar(pontos, anos, titulo, largura) {
  const doPar = pontos.filter(p => anos.includes(p.ano) && p.indice != null);
  // rótulos na ponta direita, afastados quando os valores ficam próximos
  const fim = doPar.filter(p => p.ano === anos[1]).sort((a, b) => a.indice - b.indice);
  let ultimo = -Infinity;
  for (const p of fim) { p.yRotulo = Math.max(p.indice, ultimo + 0.42); ultimo = p.yRotulo; }
  return Plot.plot({
    width: largura, height: 260, marginLeft: 34, marginRight: 118, marginTop: 28,
    style: { fontFamily: 'Archivo, sans-serif', fontSize: '12px', background: 'transparent' },
    x: { type: 'point', domain: anos, label: null, inset: 14, tickFormat: String },
    y: { domain: [2, 9], label: null, grid: true },
    marks: [
      Plot.text([titulo], { frameAnchor: 'top-left', dy: -22, fontWeight: 700, fontSize: 12.5 }),
      // direção do eixo: alto = direita, baixo = esquerda
      Plot.text(['mais à direita'], { frameAnchor: 'top-left', dx: 4, dy: 8, fill: '#725306', fontWeight: 700, fontSize: 11.5 }),
      Plot.text(['mais à esquerda'], { frameAnchor: 'bottom-left', dx: 4, dy: -8, fill: '#5b3f99', fontWeight: 700, fontSize: 11.5 }),
      Plot.line(doPar, { x: 'ano', y: 'indice', z: 'quem', stroke: p => (p.principal ? '#22201c' : '#8f8470'),
                         strokeWidth: p => (p.principal ? 3 : 1.4) }),
      Plot.dot(doPar, { x: 'ano', y: 'indice', r: p => (p.principal ? 5 : 3), fill: p => (p.principal ? '#22201c' : '#8f8470'),
                        title: p => `${p.quem}, ${p.ano}: ${virgula(p.indice)} (${p.classificacao})` }),
      Plot.text(doPar.filter(p => p.ano === anos[0] && p.principal), { x: 'ano', y: 'indice', text: p => virgula(p.indice), dx: -8, textAnchor: 'end', fontWeight: 700 }),
      Plot.text(fim, { x: 'ano', y: 'yRotulo', text: p => `${p.quem} ${virgula(p.indice)}`, dx: 9, textAnchor: 'start',
                       fill: p => (p.principal ? '#22201c' : '#5c5444'), fontWeight: p => (p.principal ? 700 : 400) }),
    ],
  });
}

/** Barras do 2º turno para presidente: o território e o Brasil, cada candidato na cor da nota do partido. */
function barrasPresidente(linhas) {
  const dados = linhas.flatMap(({ rotulo, presidente }) => (presidente?.segundo_turno ?? []).map(([nome, sigla, pct, nota]) =>
    ({ rotulo, nome: `${apelido(nome)} (${sigla})`, curto: apelido(nome), pct, nota })));
  if (!dados.length) return null;
  const largura = Math.min(720, painel.clientWidth || 520);
  const marginLeft = Math.min(120, 14 + 7 * d3.max(linhas, l => l.rotulo.length));
  // o nome só entra quando a barra comporta nome e porcentagem
  const cabe = d => (d.pct / 100) * (largura - marginLeft - 10) > 7 * (d.curto.length + 7);
  return Plot.plot({
    width: largura, height: 34 + 34 * linhas.length, marginLeft, marginRight: 10,
    style: { fontFamily: 'Archivo, sans-serif', fontSize: '12px', background: 'transparent' },
    x: { domain: [0, 100], axis: null }, y: { domain: linhas.map(l => l.rotulo), label: null },
    marks: [
      Plot.barX(dados, Plot.stackX({ y: 'rotulo', x: 'pct', fill: d => corDaNota(d.nota), stroke: '#22201c', strokeWidth: 1 })),
      Plot.text(dados, Plot.stackX({ y: 'rotulo', x: 'pct', text: d => (cabe(d) ? `${d.curto} ${virgula(d.pct)}%` : `${virgula(d.pct)}%`),
                                     fill: d => textoSobre(corDaNota(d.nota)), fontWeight: 700, title: d => `${d.nome}: ${virgula(d.pct)}%` })),
      Plot.ruleX([50], { stroke: '#22201c', strokeDasharray: '2,3' }),
    ],
  });
}

async function painelVies(onde, nome) {
  const brasilV = await viesBrasil();
  const linhasBR = await linhasVies('vies/brasil.json');
  const municipal = /^\d{5}$/.test(onde);
  const linhas = municipal ? await linhasVies(`vies/municipios/${estado.uf}.json`) : linhasBR;
  const serie = linhas.filter(l => l.territorio === onde).sort((a, b) => a.ano - b.ano);
  if (!serie.length) return `<p class="aviso-vazio">Não há votos registrados ${em(nome)}.</p>`;
  const uf = estado.uf, regiao = uf ? brasilV.regiao_da_uf[uf] : null;
  // comparações: o estado (se for município), a região (se for estado) e o Brasil
  const comparar = [
    ...(municipal ? [[uf, uf]] : []),
    ...(!municipal && regiao ? [[regiao, regiao]] : []),
    ...(onde !== 'BR' ? [['BR', 'Brasil']] : []),
  ];
  const curto = municipal ? (nome.length > 14 ? `${nome.slice(0, 13)}…` : nome) : (onde === 'BR' ? 'Brasil' : uf);
  const pontos = [
    ...serie.map(l => ({ ...l, quem: curto, principal: true })),
    ...comparar.flatMap(([terr, rotulo]) => linhasBR.filter(l => l.territorio === terr).map(l => ({ ...l, quem: rotulo }))),
  ];
  const doAno = serie.find(l => l.ano === estado.ano) ?? serie.at(-1);
  const geral = doAno.ano % 4 === 2;
  const brAno = linhasBR.find(l => l.territorio === 'BR' && l.ano === doAno.ano);

  // frase de abertura: o voto do ano escolhido, e o voto para presidente nos anos gerais
  const cargoAno = geral ? 'deputado federal' : 'vereador';
  let abertura = `${em(nome)[0].toUpperCase()}${em(nome).slice(1)}, em ${doAno.ano}, os votos para ${cargoAno} somaram um índice de
    <strong>${virgula(doAno.indice)}</strong> numa escala de 0 (esquerda) a 10 (direita): ${doAno.classificacao?.toLowerCase() ?? 'sem classificação'}.`;
  const st = doAno.presidente?.segundo_turno ?? [];
  if (geral && st.length) {
    const [v1, v2] = st;
    abertura += ` Para presidente, o 2º turno deu ${virgula(v1[2])}% a ${apelido(v1[0])} (${v1[1]}) e ${virgula(v2[2])}% a ${apelido(v2[0])} (${v2[1]}).`;
    if (onde !== 'BR' && brAno?.presidente?.segundo_turno?.length) {
      const b1 = brAno.presidente.segundo_turno[0];
      abertura += ` No Brasil, venceu ${apelido(b1[0])} (${b1[1]}), com ${virgula(b1[2])}%.`;
    }
    abertura += ` O voto para presidente e o voto para deputado podem apontar para lados diferentes: o primeiro escolhe uma
      pessoa entre poucas; o segundo se espalha por muitos partidos, e é dele que sai o índice.`;
  }

  const largura = Math.min(900, painel.clientWidth || 520);
  const lado = largura >= 520 ? Math.floor(largura / 2) - 6 : largura;
  const caixa = document.createElement('div');
  caixa.innerHTML = `
    <h3>Qual o viés político ${em(nome)} ao longo do tempo?</h3>
    <p>${abertura}</p>
    ${geral && st.length ? `<h4>Presidente, 2º turno de ${doAno.ano}</h4><div class="grafico" id="g-presidente"></div>
      <p class="apoio">A cor de cada candidato segue a nota do partido: roxo à esquerda, dourado à direita.</p>` : ''}
    <h4>Índice dos votos ao longo do tempo</h4>
    <p class="apoio">Cada gráfico compara eleições do mesmo tipo: deputado federal com deputado federal, vereador com
      vereador. Misturar os dois criaria saltos que não são mudança de opinião, sobretudo em municípios pequenos,
      onde a eleição de vereador gira em torno de nomes locais.</p>
    <div class="graficos-par"><div class="grafico" id="g-gerais"></div><div class="grafico" id="g-municipais"></div></div>
    <p class="legenda-grafico">
      <span class="chave" style="--cor:#22201c">${nome}</span>
      ${comparar.length ? `<span class="chave" style="--cor:#8f8470">${comparar.map(c => (c[0] === 'BR' ? 'Brasil' : c[0].length === 2 ? NOME_UF[c[0]] : `região ${c[0]}`)).join(' e ')}</span>` : ''}
    </p>
    <h4>Ano a ano ${em(nome)}</h4>
    <div class="rolagem"><table class="tabela">
      <thead><tr><th>Ano</th><th>Votos usados no índice</th><th class="num">Índice<span class="situacao">esquerda 0 a 10 direita</span></th><th>Classe</th><th>Presidente, 2º turno</th></tr></thead>
      <tbody>${serie.map(l => `<tr${l.ano === doAno.ano ? ' class="atual"' : ''}><td>${l.ano}</td>
        <td>${l.ano % 4 === 0 ? 'vereador' : 'deputado federal'}</td><td class="num">${comSeta(l.indice)}</td><td>${l.classificacao ?? '—'}</td>
        <td>${l.presidente?.segundo_turno?.length ? l.presidente.segundo_turno.map(([n, s, pct]) => `${apelido(n)} ${virgula(pct)}%`).join(' × ')
          : '<span class="sem-info">sem eleição para presidente</span>'}</td></tr>`).join('')}
      </tbody></table></div>
    <h4>Partidos mais votados para ${cargoAno} ${em(nome)}, em ${doAno.ano}</h4>
    <div class="rolagem"><table class="tabela">
      <thead><tr><th>Partido</th><th class="num">Parcela dos votos</th><th class="num">Nota dos especialistas<span class="situacao">esquerda 0 a 10 direita</span></th></tr></thead>
      <tbody>${doAno.principais_partidos.map(([sigla, pct, nota]) => `<tr><td>${sigla}</td><td class="num">${virgula(pct)}%</td>
        <td class="num">${nota == null ? '<span class="sem-info">sem nota</span>' : comSeta(nota)}</td></tr>`).join('')}</tbody></table></div>
    <p class="apoio">Como o índice é calculado: cada partido tem uma nota de 0 (esquerda) a 10 (direita) dada por
      especialistas; o índice é a média dessas notas, com peso pelos votos que cada partido recebeu. Partidos sem nota
      ficam fora da média. Com a régua das votações na Câmara (−100 a +100), que mede sobretudo o alinhamento com o
      governo, o mesmo cálculo dá ${doAno.indice_camara == null ? 'sem valor' : `${doAno.indice_camara > 0 ? '+' : ''}${virgula(doAno.indice_camara)}`}
      ${em(nome)} em ${doAno.ano} (cobrindo ${virgula(doAno.cobertura_camara_pct)}% dos votos).</p>`;
  caixa.querySelector('#g-gerais').append(graficoPar(pontos, [2018, 2022], 'Gerais: deputado federal', lado));
  caixa.querySelector('#g-municipais').append(graficoPar(pontos, [2020, 2024], 'Municipais: vereador', lado));
  if (geral && st.length) {
    const barras = barrasPresidente([{ rotulo: curto, presidente: doAno.presidente },
      ...(onde !== 'BR' ? [{ rotulo: 'Brasil', presidente: brAno?.presidente }] : [])]);
    if (barras) caixa.querySelector('#g-presidente').append(barras);
  }
  return caixa;
}

// ---------------------------------------------------------------- candidatos um a um

const LIMITE_INDIVIDUAL = 20;   // até tantos candidatos, o painel mostra cada um em vez de faixas

/** Candidatos do recorte atual (presidente, governador, senador, prefeito), ou [] se não houver lista. */
async function candidatosDe(onde) {
  const arquivo = onde === 'BR' ? 'BR' : /^\d{5}$/.test(onde) ? estado.uf : onde;
  let dados;
  try { dados = await carregaDados(`mapa/candidatos/${arquivo}.json`); }
  catch { return []; }                         // UF fora do projeto: não há lista
  return dados.candidatos.map(l => registro(dados.campos, l))
    .filter(c => c.ano === estado.ano && c.cargo === idxCargo(estado.cargo) && c.territorio === onde);
}

const parcelaPublica = c => (c.receita ? (100 * (c.receita_publica ?? 0)) / c.receita : null);
const resultadoCandidato = c => (c.eleito ? 'eleito' : c.situacao === 'SEM SITUAÇÃO' ? 'resultado não informado pelo TSE' : c.situacao.toLowerCase());

/** Painel com os candidatos lado a lado: a métrica da pergunta em barras, o eleito em verde. */
function painelIndividual(lista, nome, pergunta) {
  const metrica = {
    custo: { valor: c => c.despesa, rotulo: 'gasto de campanha', fmt: v => formata.real(v), falta: 'sem despesa declarada' },
    patrimonio: { valor: c => c.patrimonio, rotulo: 'patrimônio declarado', fmt: v => formata.real(v), falta: 'nenhum bem declarado' },
    dependencia: { valor: parcelaPublica, rotulo: 'parcela da receita vinda de dinheiro público', fmt: v => formata.pct(v), falta: 'sem receita declarada' },
  }[pergunta];
  // 0% de dinheiro público é um dado; patrimônio ou gasto zero é ausência de declaração
  const linhas = lista.map(c => ({ ...c, v: pergunta === 'dependencia' ? metrica.valor(c) : metrica.valor(c) || null }))
    .sort((a, b) => (b.v ?? -1) - (a.v ?? -1));
  const eleitos = linhas.filter(c => c.eleito), outros = linhas.filter(c => !c.eleito);
  const mediana = d3.median(outros.filter(c => c.v != null), c => c.v);
  const posicao = c => linhas.filter(x => x.v != null).indexOf(c) + 1;
  const frase = eleitos.map(e => (e.v == null
    ? `${e.nome} (${e.partido}), eleito, não tem ${metrica.rotulo} registrado`
    : `${e.nome} (${e.partido}), eleito, teve ${metrica.fmt(e.v)} de ${metrica.rotulo}, ${posicao(e)}º entre os ${linhas.filter(x => x.v != null).length} candidatos com esse dado`)).join('; ');
  const comparacao = mediana == null ? '' : ` Entre os que não se elegeram, o valor do meio (mediana) foi ${metrica.fmt(mediana)}.`;

  const comValor = linhas.filter(c => c.v != null);
  const largura = Math.min(760, painel.clientWidth || 520);
  // tela estreita: o nome vai acima da barra, que ganha a largura toda
  const estreito = largura < 560;
  const barra = Plot.barX(comValor, { y: 'nome', x: 'v', fill: c => (c.eleito ? '#00a651' : '#cbbd9d'), stroke: '#22201c', strokeWidth: 1,
                                       insetTop: estreito ? 19 : 0, title: c => `${c.nome} (${c.partido}): ${metrica.fmt(c.v)}` });
  const valor = Plot.text(comValor, { y: 'nome', x: 'v', text: c => metrica.fmt(c.v), dx: 6, dy: estreito ? 9 : 0, textAnchor: 'start' });
  const grafico = comValor.length ? Plot.plot({
    width: largura, height: (estreito ? 16 : 30) + (estreito ? 46 : 30) * comValor.length,
    marginLeft: estreito ? 0 : 245, marginRight: estreito ? 100 : 110, marginTop: 10,
    style: { fontFamily: 'Archivo, sans-serif', fontSize: '12.5px', background: 'transparent' },
    x: { axis: null, domain: pergunta === 'dependencia' ? [0, 100] : undefined },
    y: { domain: comValor.map(c => c.nome), label: null, axis: estreito ? null : 'left',
         tickFormat: n => (n.length > 28 ? `${n.slice(0, 27)}…` : n) },
    marks: estreito
      ? [barra, valor, Plot.text(comValor, { y: 'nome', x: 0, text: c => `${c.nome} (${c.partido})`, dy: -12, textAnchor: 'start',
                                             fontWeight: c => (c.eleito ? 700 : 400), lineWidth: 40 })]
      : [barra, valor],
  }) : null;

  const caixa = document.createElement('div');
  const titulo = {
    custo: `Quanto gastou cada candidato a ${estado.cargo.toLowerCase()} ${em(nome)}, em ${estado.ano}?`,
    patrimonio: `O que separou quem se elegeu ${estado.cargo.toLowerCase()} ${em(nome)}, em ${estado.ano}: o patrimônio`,
    dependencia: `O que separou quem se elegeu ${estado.cargo.toLowerCase()} ${em(nome)}, em ${estado.ano}: o dinheiro público`,
  }[pergunta];
  caixa.innerHTML = `
    <h3>${titulo}</h3>
    <p>${frase}.${comparacao}</p>
    <div class="grafico"></div>
    <div class="rolagem"><table class="tabela">
      <thead><tr><th>Candidato</th><th>Resultado</th><th class="num">Patrimônio</th><th class="num">Gasto</th><th class="num">Dinheiro público</th></tr></thead>
      <tbody>${linhas.map(c => `<tr${c.eleito ? ' class="atual"' : ''}>
        <td class="nome"><a href="politico.html#${c.id}">${c.nome}</a> <span class="apoio situacao">${c.partido}</span></td>
        <td>${resultadoCandidato(c)}</td>
        <td class="num">${c.patrimonio ? formata.real(c.patrimonio) : '<span class="sem-info">nenhum bem</span>'}</td>
        <td class="num">${c.despesa ? formata.real(c.despesa) : '<span class="sem-info">sem despesa</span>'}</td>
        <td class="num">${parcelaPublica(c) == null ? '<span class="sem-info">sem receita</span>' : formata.pct(parcelaPublica(c))}</td></tr>`).join('')}
      </tbody></table></div>
    <p class="apoio">Barras em verde: quem se elegeu. ${linhas.length - comValor.length ? `Sem barra: ${linhas.length - comValor.length} candidato(s) sem ${metrica.rotulo} registrado (${metrica.falta}), em geral candidaturas que não chegaram à eleição.` : ''}</p>`;
  if (grafico) caixa.querySelector('.grafico').append(grafico);
  return caixa;
}

// ---------------------------------------------------------------- controles

function cargosDoAno(ano) {
  const presentes = new Set(brasil.custo.filter(l => l[0] === ano && l[2] === 'BR').map(l => l[1]));
  return brasil.cargos.filter((_, i) => presentes.has(i));
}

function nomeFaixas() {
  return estado.pergunta === 'patrimonio' ? brasil.faixas_patrimonio : brasil.faixas_dependencia;
}

function montaControles() {
  form.elements.pergunta.value = estado.pergunta;
  selAno.innerHTML = brasil.anos.map(a => `<option${a === estado.ano ? ' selected' : ''}>${a}</option>`).join('');
  const cargos = cargosDoAno(estado.ano);
  if (!cargos.includes(estado.cargo)) estado.cargo = cargos.includes('VEREADOR') ? 'VEREADOR' : 'DEPUTADO FEDERAL';
  selCargo.innerHTML = cargos.map(c => `<option value="${c}"${c === estado.cargo ? ' selected' : ''}>${c.toLowerCase()}</option>`).join('');
  const comFaixa = comFaixas();
  selCargo.closest('label').hidden = ehVies();     // o viés usa vereador ou deputado federal, conforme o ano
  document.getElementById('campo-faixa').hidden = !comFaixa || estado.cargo === 'PRESIDENTE';
  if (comFaixa) {
    const nomes = nomeFaixas();
    // padrão: R$ 1 milhão a R$ 5 milhões (patrimônio) e 75% ou mais público (dependência)
    if (estado.faixa == null || estado.faixa >= nomes.length) estado.faixa = estado.pergunta === 'patrimonio' ? 4 : 0;
    selFaixa.innerHTML = nomes.map((n, i) => `<option value="${i}"${i === estado.faixa ? ' selected' : ''}>${n}</option>`).join('');
  }
}

form.addEventListener('change', e => {
  if (e.target.name === 'pergunta') { estado.pergunta = e.target.value; estado.faixa = null; }
  if (e.target.name === 'ano') estado.ano = Number(e.target.value);
  if (e.target.name === 'cargo') estado.cargo = e.target.value;
  if (e.target.name === 'faixa') estado.faixa = Number(e.target.value);
  atualiza();
});

document.getElementById('voltar').addEventListener('click', () => { estado.uf = null; estado.mun = null; atualiza(); });

// ---------------------------------------------------------------- mapa

/** Até cinco classes com o mesmo número de territórios; cortes repetidos (muitos zeros) são unidos.
 *  Com até cinco valores distintos (governador: 0% ou 100%), cada valor ganha sua própria cor. */
function escala(valores) {
  const presentes = Object.values(valores).filter(v => v != null).sort(d3.ascending);
  if (!presentes.length) return null;
  const distintos = [...new Set(presentes)];
  if (distintos.length <= 5) {
    const cores = distintos.length === 1 ? [CORES[2]] : d3.quantize(RAMPA, distintos.length);
    const esc = d3.scaleThreshold().domain(distintos.slice(1).map((v, i) => (v + distintos[i]) / 2)).range(cores);
    esc.rotulos = distintos.map(formatoValor);
    return esc;
  }
  const cortes = [...new Set([0.2, 0.4, 0.6, 0.8].map(q => d3.quantileSorted(presentes, q)))]
    .filter(c => c > presentes[0] && c < presentes.at(-1));
  const cores = cortes.length ? d3.quantize(RAMPA, cortes.length + 1) : [CORES[2]];
  const esc = d3.scaleThreshold().domain(cortes).range(cores);
  esc.limites = [presentes[0], ...cortes, presentes.at(-1)];
  return esc;
}

function formatoValor(v) {
  if (v == null) return 'sem dado';
  if (ehVies()) return String(v).replace('.', ',');
  return estado.pergunta === 'custo' ? formata.real(v) : formata.pct(v);
}

function desenhaLegenda(esc) {
  const legenda = document.getElementById('legenda');
  if (!esc) { legenda.innerHTML = ''; return; }
  if (ehVies()) { legenda.innerHTML = legendaVies(esc); return; }
  const limites = esc.limites;
  const rotulo = i => (esc.rotulos ? esc.rotulos[i] : `${formatoValor(limites[i])} a ${formatoValor(limites[i + 1])}`);
  const titulo = ehVies() ? 'Índice ideológico (0 = esquerda, 10 = direita)' : estado.pergunta === 'custo'
    ? 'Gasto médio de quem se elegeu'
    : `Parcela dos eleitos na faixa "${nomeFaixas()[estado.faixa]}"`;
  legenda.innerHTML = `<span class="legenda-titulo">${titulo}</span>
    <span class="legenda-faixas">${esc.range().map((c, i) => `<span><i style="background:${c}"></i>${rotulo(i)}</span>`).join('')}
    <span><i class="sem-dado"></i>${estado.pergunta === 'custo' || ehVies() ? 'sem dado' : 'sem eleitos com esse dado'}</span></span>`;
}

async function desenhaMapa() {
  // presidente: a eleição é nacional e não se divide por estado nem município
  const presidente = estado.cargo === 'PRESIDENTE' && !ehVies();
  document.querySelector('.mapa-grade').classList.toggle('sem-mapa', presidente);
  if (presidente) {
    svgCaixa.innerHTML = `<div class="aviso-vazio aviso-mapa"><p><strong>A eleição para presidente é nacional.</strong>
      Os votos são somados no país inteiro, então não há custo, patrimônio ou dinheiro público por estado
      para colorir o mapa. A resposta para o Brasil está no santinho.</p></div>`;
    document.getElementById('legenda').innerHTML = '';
    document.getElementById('dica').textContent = 'Escolha outro cargo para ver o mapa.';
    return;
  }
  const largura = svgCaixa.clientWidth || 640;
  const naUF = Boolean(estado.uf);
  const geo = naUF ? await carregaDados(`geo/municipios/${estado.uf}.json`) : geoEstados;
  const municipal = naUF && (ehVies() || CARGOS_MUNICIPAIS.includes(estado.cargo));
  const dados = naUF ? await carregaDados(`mapa/municipios/${estado.uf}.json`) : brasil;
  let valores, esc;
  if (ehVies()) {
    valores = await valoresVies(naUF);
    esc = await escalaVies();
  } else {
    // num estado, cargo estadual: todos os municípios recebem a cor do estado
    valores = naUF && !municipal ? valoresDoMapa(brasil) : valoresDoMapa(dados);
    esc = escala(naUF && !municipal ? valoresDoMapa(brasil) : valores);
  }
  const chave = f => (naUF ? (municipal ? f.properties.mun : estado.uf) : f.properties.uf);

  // a altura acompanha o formato do território (a Paraíba é larga e baixa), até um limite
  const projecao = d3.geoMercator().fitWidth(largura, geo);
  let altura = Math.ceil(d3.geoPath(projecao).bounds(geo)[1][1]);
  const ALTURA_MAX = 640;
  if (altura > ALTURA_MAX) { altura = ALTURA_MAX; projecao.fitSize([largura, altura], geo); }
  const caminho = d3.geoPath(projecao);
  const svg = d3.create('svg').attr('viewBox', [0, 0, largura, altura]).attr('class', 'mapa-svg')
    .attr('role', 'group').attr('aria-label', naUF ? `Municípios de ${NOME_UF[estado.uf]}` : 'Estados do Brasil');
  // hachurado de "sem dado"
  const hachura = svg.append('defs').append('pattern').attr('id', 'sem-dado').attr('patternUnits', 'userSpaceOnUse')
    .attr('width', 6).attr('height', 6).attr('patternTransform', 'rotate(45)');
  hachura.append('rect').attr('width', 6).attr('height', 6).attr('fill', '#cbbd9d');
  hachura.append('rect').attr('width', 1.6).attr('height', 6).attr('fill', '#8f8470');

  const forma = svg.append('g').selectAll('path').data(geo.features).join('path')
    .attr('d', caminho)
    .attr('fill', f => { const v = valores[chave(f)]; return v == null || !esc ? SEM_DADO : esc(v); })
    .attr('class', f => {
      if (naUF) return `municipio${f.properties.mun === estado.mun ? ' selecionado' : ''}`;
      return ufsProjeto.has(f.properties.uf) ? 'estado projeto' : 'estado';
    });

  forma.append('title').text(f => {
    if (naUF) return `${dadosMunicipio(dados, f.properties.mun)?.nome ?? 'Município'}: ${formatoValor(valores[chave(f)])}`;
    const uf = f.properties.uf;
    return `${NOME_UF[uf]}: ${formatoValor(valores[uf])}${ufsProjeto.has(uf) ? '' : ' (fora dos seis estados do projeto)'}`;
  });

  // estados do projeto e municípios são clicáveis e alcançáveis pelo teclado
  const clicavel = naUF ? forma : forma.filter(f => ufsProjeto.has(f.properties.uf));
  clicavel.attr('tabindex', 0).attr('role', 'button')
    .on('click', (_, f) => seleciona(f))
    .on('keydown', (e, f) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); seleciona(f); } });

  svgCaixa.replaceChildren(svg.node());
  desenhaLegenda(esc);
  document.getElementById('dica').textContent = naUF
    ? (municipal ? 'Clique num município para ver os números dele.' : `Cargo estadual: o valor é o mesmo para todo o estado. Escolha prefeito ou vereador para comparar municípios.`)
    : `Os seis estados do projeto têm contorno escuro e podem ser clicados.${ehVies() ? ` Em ${estado.ano}, o índice usa os votos para ${estado.ano % 4 === 0 ? 'vereador' : 'deputado federal'}.` : ''}`;
}

function dadosMunicipio(dados, cod) {
  return dados.municipios?.[cod];
}

function seleciona(f) {
  if (!estado.uf) { estado.uf = f.properties.uf; estado.mun = null; }
  else estado.mun = f.properties.mun === estado.mun ? null : f.properties.mun;
  atualiza();
}

// ---------------------------------------------------------------- painel de respostas

async function nomeTerritorio() {
  if (estado.mun) {
    const dados = await carregaDados(`mapa/municipios/${estado.uf}.json`);
    return `${dadosMunicipio(dados, estado.mun)?.nome ?? estado.mun} (${estado.uf})`;
  }
  return estado.uf ? NOME_UF[estado.uf] : 'Brasil';
}

function territorioAtual() {
  if (estado.mun && (ehVies() || CARGOS_MUNICIPAIS.includes(estado.cargo))) return estado.mun;
  return estado.uf ?? 'BR';
}

async function painelCusto(onde, nome) {
  const dados = await fonte(onde);
  const doAno = custos(dados, r => r.ano === estado.ano && r.territorio === onde);
  const r = doAno.find(x => x.cargo === idxCargo(estado.cargo));
  if (!r) return `<p class="aviso-vazio">Não há ${estado.cargo.toLowerCase()} ${em(nome)} em ${estado.ano}${estado.cargo === 'PRESIDENTE' ? ': o cargo de presidente só tem valor para o Brasil' : ''}.</p>`;
  const linhas = doAno.sort((a, b) => (custoMedio(b) ?? 0) - (custoMedio(a) ?? 0)).map(x => `<tr${x === r ? ' class="atual"' : ''}>
      <td>${brasil.cargos[x.cargo].toLowerCase()}</td><td class="num">${formata.numero(x.vagas ?? 0)}</td>
      <td class="num">${x.vagas ? formata.numero(Math.round(10 * x.candidatos / x.vagas) / 10) : ''}</td>
      <td class="num">${x.vagas ? formata.real(x.gasto / x.vagas) : ''}</td>
      <td class="num">${custoMedio(x) == null ? '' : formata.real(custoMedio(x))}</td></tr>`).join('');
  const html = `
    <h3>Quanto custa uma cadeira de ${estado.cargo.toLowerCase()} ${em(nome)}, em ${estado.ano}?</h3>
    <p class="apoio">O santinho ao lado do mapa traz a resposta; vire-o para ver como foi calculada.</p>
    <div id="individual"></div>
    <h4>Todos os cargos de ${estado.ano} ${em(nome)}</h4>
    <div class="rolagem"><table class="tabela">
      <thead><tr><th>Cargo</th><th class="num">Vagas</th><th class="num">Candidatos por vaga</th><th class="num">Disputa por cadeira</th><th class="num">Gasto médio por eleito</th></tr></thead>
      <tbody>${linhas}</tbody></table></div>`;
  const caixa = document.createElement('div');
  caixa.innerHTML = html;
  const lista = await candidatosDe(onde);
  if (lista.length && lista.length <= LIMITE_INDIVIDUAL) caixa.querySelector('#individual').append(painelIndividual(lista, nome, 'custo'));
  return caixa;
}

async function painelFaixas(onde, nome) {
  const lista = await candidatosDe(onde);
  if (lista.length && lista.length <= LIMITE_INDIVIDUAL) return painelIndividual(lista, nome, estado.pergunta);
  const dados = await fonte(onde);
  const nomes = nomeFaixas();
  const linhas = faixas(dados, r => ehCargo(r) && r.territorio === onde)
    .map(r => ({ ...r, nome: nomes[r.faixa], taxa: taxa(r.eleitos, r.candidatos) }))
    .sort((a, b) => a.faixa - b.faixa);
  if (!linhas.length) return `<p class="aviso-vazio">Não há dados de ${estado.cargo.toLowerCase()} ${em(nome)} em ${estado.ano}.</p>`;
  const cand = d3.sum(linhas, r => r.candidatos), eleitos = d3.sum(linhas, r => r.eleitos);
  const geral = taxa(eleitos, cand);
  const pergunta = estado.pergunta === 'patrimonio'
    ? `Patrimônio declarado ajuda a eleger ${estado.cargo.toLowerCase()}?`
    : `Quem depende de dinheiro público se elege ${estado.cargo.toLowerCase()}?`;
  const grafico = Plot.plot({
    width: Math.min(720, painel.clientWidth || 520), height: 64 + 38 * linhas.length,
    marginLeft: 170, marginRight: 120, marginTop: 30,
    style: { fontFamily: 'Archivo, sans-serif', fontSize: '13px', background: 'transparent' },
    x: { label: 'taxa de vitória (%)', grid: true, nice: true },
    y: { domain: linhas.map(r => r.nome), label: null },
    marks: [
      Plot.barX(linhas, { y: 'nome', x: 'taxa', fill: r => (r.faixa === estado.faixa ? '#00a651' : '#b9de8a'), stroke: '#22201c', strokeWidth: 1 }),
      // média de todos os candidatos: atrás dos rótulos e com o nome escrito no topo
      Plot.ruleX([geral], { stroke: '#22201c', strokeWidth: 1.5, strokeDasharray: '5,3' }),
      Plot.text([geral], { x: d => d, frameAnchor: 'top', dy: -18, text: d => `todos os candidatos: ${formata.pct(d)}`, fontWeight: 700 }),
      Plot.text(linhas, { y: 'nome', x: 'taxa', text: r => `${formata.pct(r.taxa)} (${formata.numero(r.candidatos)})`,
                          dx: 6, textAnchor: 'start', stroke: '#e8dcc4', strokeWidth: 4, fill: '#22201c', paintOrder: 'stroke' }),
    ],
  });
  const caixa = document.createElement('div');
  caixa.innerHTML = `
    <h3>${pergunta}</h3>
    <p>${em(nome)[0].toUpperCase()}${em(nome).slice(1)}, em ${estado.ano}: ${formata.numero(eleitos)} ${eleitos === 1 ? 'eleito' : 'eleitos'} entre ${formata.numero(cand)} candidatos.
      Cada barra é a taxa de vitória de uma faixa, com o número de candidatos entre parênteses; a linha
      tracejada é a taxa de todos os candidatos juntos (${formata.pct(geral)}). Barra que passa da linha
      é faixa que se elege mais do que a média.</p>
    <div class="grafico"></div>
    <p class="apoio">${estado.pergunta === 'patrimonio'
      ? 'Bens declarados ao TSE no registro da candidatura.'
      : 'Parcela da receita vinda do fundo eleitoral e do Fundo Partidário; candidatos sem receita ficam de fora.'}
      A relação não é de causa e efeito: dinheiro, viabilidade e já ocupar o cargo andam juntos.</p>`;
  caixa.querySelector('.grafico').append(grafico);
  return caixa;
}

async function desenhaPainel() {
  const onde = territorioAtual();
  const nome = await nomeTerritorio();
  const conteudo = ehVies() ? await painelVies(onde, nome)
    : estado.pergunta === 'custo' ? await painelCusto(onde, nome) : await painelFaixas(onde, nome);
  if (typeof conteudo === 'string') painel.innerHTML = conteudo;
  else painel.replaceChildren(conteudo);
  if (estado.mun && !ehVies() && !CARGOS_MUNICIPAIS.includes(estado.cargo)) {
    painel.insertAdjacentHTML('afterbegin', `<p class="apoio">${nome} selecionado, mas ${estado.cargo.toLowerCase()} é um cargo estadual: os números abaixo são de ${NOME_UF[estado.uf]}.</p>`);
  }
}

// ---------------------------------------------------------------- o santinho e a pilha de anos

const FONTE_SQL = { custo: 'p01_custo_cadeira.sql', patrimonio: 'p02_taxa_por_patrimonio.sql',
  dependencia: 'p08_dependencia_publica.sql', vies: 'p07_vies_ideologico.sql' };
const abrevia = v => (v >= 1e6 ? `R$ ${String((v / 1e6).toFixed(1)).replace('.', ',')} mi` : `R$ ${Math.round(v / 1e3)} mil`);

/** A resposta da pergunta atual no território `onde` num ano: o que vai no santinho, ou null. */
async function respostaDoAno(onde, ano) {
  if (ehVies()) {
    const linhas = await linhasVies(/^\d{5}$/.test(onde) ? `vies/municipios/${estado.uf}.json` : 'vies/brasil.json');
    const l = linhas.find(x => x.territorio === onde && x.ano === ano);
    if (!l || l.indice == null) return null;
    const cargoAno = ano % 4 === 2 ? 'deputado federal' : 'vereador';
    const st = l.presidente?.segundo_turno ?? [];
    return {
      numero: virgula(l.indice), curto: virgula(l.indice),
      rotulo: `${l.classificacao ?? 'Sem classe'}, de 0 (esquerda) a 10 (direita), nos votos para ${cargoAno}.`,
      linhas: [
        ...(st.length ? [['Presidente, 2º turno', `${apelido(st[0][0])} ${virgula(st[0][2])}%`]] : []),
        ['Votos com nota', `${virgula(l.cobertura_especialistas_pct)}%`],
        ['Régua da Câmara', l.indice_camara == null ? '—' : `${l.indice_camara > 0 ? '+' : ''}${virgula(l.indice_camara)}`],
      ],
      verso: `<p>Cada partido tem uma nota de 0 (esquerda) a 10 (direita) dada por especialistas. O índice é a média
        dessas notas, com peso pelos votos que cada partido recebeu para ${cargoAno}.</p>
        <p>Partidos sem nota ficam fora da média. A régua da Câmara (−100 a +100) refaz a conta com as votações
        dos deputados e mede sobretudo o alinhamento com o governo.</p>`,
    };
  }
  const dados = await fonte(onde);
  const ic = idxCargo(estado.cargo);
  if (estado.pergunta === 'custo') {
    const r = custos(dados, x => x.ano === ano && x.territorio === onde && x.cargo === ic)[0];
    if (!r || custoMedio(r) == null) return null;
    const um = r.eleitos === 1;
    return {
      numero: formata.real(custoMedio(r)), curto: abrevia(custoMedio(r)),
      rotulo: um ? 'gastou a campanha de quem se elegeu.' : `gastou, em média, cada um dos ${formata.numero(r.eleitos)} eleitos.`,
      linhas: [
        ['Disputa por cadeira', r.vagas ? formata.real(r.gasto / r.vagas) : '—'],
        ['Candidatos por vaga', r.vagas ? formata.numero(Math.round(10 * r.candidatos / r.vagas) / 10) : '—'],
        ['Vagas', formata.numero(r.vagas ?? 0)],
      ],
      verso: `<p>O número grande soma as despesas ${um ? 'da campanha vencedora' : `dos ${formata.numero(r.eleitos)} eleitos e divide por ${formata.numero(r.eleitos)}`}:
        quanto custou, para quem venceu, chegar à cadeira.</p>
        <p>A disputa por cadeira soma as despesas de todos os ${formata.numero(r.candidatos)} candidatos, eleitos ou não,
        e divide pelas ${formata.numero(r.vagas ?? 0)} vagas.</p>
        <p>Despesas contratadas pelas campanhas, em reais de cada ano, sem correção pela inflação.</p>`,
    };
  }
  const nomes = nomeFaixas();
  const rs = faixas(dados, x => x.ano === ano && x.cargo === ic && x.territorio === onde);
  const cand = d3.sum(rs, x => x.candidatos), el = d3.sum(rs, x => x.eleitos);
  if (!el) return null;
  const f = rs.find(x => x.faixa === estado.faixa);
  const parcela = (100 * (f?.eleitos ?? 0)) / el;
  return {
    numero: formata.pct(parcela), curto: formata.pct(parcela),
    rotulo: `dos eleitos estavam na faixa "${nomes[estado.faixa]}".`,
    linhas: [
      ['Vitória nessa faixa', f?.candidatos ? formata.pct((100 * f.eleitos) / f.candidatos) : '—'],
      ['Vitória de todos', formata.pct((100 * el) / cand)],
      ['Eleitos', `${formata.numero(el)} de ${formata.numero(cand)}`],
    ],
    verso: `<p>${estado.pergunta === 'patrimonio'
      ? 'Bens declarados ao TSE no registro da candidatura, somados por candidato.'
      : 'Parcela da receita vinda do fundo eleitoral e do Fundo Partidário; candidatos sem receita ficam de fora.'}</p>
      <p>O número grande é a parcela dos eleitos que estava na faixa escolhida, a mesma que colore o mapa. A taxa de
      vitória divide os eleitos da faixa pelos candidatos dela.</p>
      <p>A relação não é de causa e efeito: dinheiro, viabilidade e já ocupar o cargo andam juntos.</p>`,
  };
}

let anoDoSantinho = null;
async function desenhaSantinho() {
  const onde = territorioAtual();
  // município selecionado com cargo estadual: os números são do estado, e o santinho diz isso
  const nome = onde === estado.mun ? await nomeTerritorio() : (estado.uf ? NOME_UF[estado.uf] : 'Brasil');
  const respostas = await Promise.all(brasil.anos.map(a => respostaDoAno(onde, a)));
  const r = respostas[brasil.anos.indexOf(estado.ano)];
  const cargoTxt = ehVies() ? (estado.ano % 4 === 2 ? 'deputado federal' : 'vereador') : estado.cargo.toLowerCase();
  const geral = a => a % 4 === 2;
  const vazio = a => (ehVies() || geral(a) === geral(estado.ano) ? 'sem dado' : geral(a) ? 'troca para deputado' : 'troca para vereador');
  const atras = brasil.anos.map((a, j) => [a, respostas[j]]).filter(([a]) => a !== estado.ano);
  const caixa = document.getElementById('pilha');
  caixa.innerHTML = `
    <div class="pilha-anos" role="group" aria-label="Outros anos da mesma pergunta">
      ${atras.map(([a, r], k) => `<button type="button" class="pilha-ano" data-ano="${a}" style="--k:${k}">
        <b>${a}</b><span>${r?.curto ?? vazio(a)}</span></button>`).join('')}
    </div>
    ${santinho(r ? { faixa: `${cargoTxt} · ${estado.ano}`, nome, ...r, fonte: FONTE_SQL[estado.pergunta] }
      : { faixa: `${cargoTxt} · ${estado.ano}`, nome, numero: '—', rotulo: 'Sem dado para este recorte.', classe: 'santinho-neutro' })}`;
  // o santinho do ano escolhido sai da pilha e assenta na frente
  if (anoDoSantinho != null && anoDoSantinho !== estado.ano) {
    caixa.classList.remove('assenta'); void caixa.offsetWidth; caixa.classList.add('assenta');
  }
  anoDoSantinho = estado.ano;
}

document.getElementById('pilha').addEventListener('click', e => {
  const ano = e.target.closest('.pilha-ano')?.dataset.ano;
  if (ano) { estado.ano = Number(ano); atualiza(); }
});

// ---------------------------------------------------------------- ciclo

async function atualiza() {
  montaControles();
  escreveEndereco();
  document.getElementById('titulo-territorio').textContent = await nomeTerritorio();
  document.getElementById('voltar').hidden = !estado.uf;
  await Promise.all([desenhaMapa(), desenhaPainel(), desenhaSantinho()]);
}

leEndereco();
await atualiza();
// endereço colado ou botões voltar e avançar do navegador
window.addEventListener('hashchange', () => { leEndereco(); atualiza(); });
let redimensiona;
window.addEventListener('resize', () => { clearTimeout(redimensiona); redimensiona = setTimeout(desenhaMapa, 200); });
