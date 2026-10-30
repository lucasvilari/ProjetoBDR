// Pergunta 3: os índices de um município (PIB per capita, IDHM, eleitores por habitante e isentos) ao lado dos partidos
// que mais recebem votos e elegem nele e de para que lado ele vota. O santinho traz os índices e o voto ideológico; o
// boletim de urna, o ranking dos partidos com a posição de cada um; o mapa pinta as 27 UFs (e, nos seis estados, os
// municípios) pelo índice, pelo voto ou pelos dois juntos; e os grupos de municípios mostram se o voto muda com cada
// índice. O leitor escolhe o cargo: todos (o boletim soma os cargos; o voto é o combinado da pergunta 7) ou um só.
//
// Dados: indices/municipios.json (índices, partido do prefeito e voto ideológico de cada município, combinado e por
// cargo, por ano), indices/ranking/<UF>[-<cargo>].json (votos e eleitos por partido em cada município e ano),
// indices/estados.json (os índices das 27 UFs), vies/brasil.json (o voto de cada UF, da pergunta 7), geo/ (contornos
// do IBGE) e partidos-recorte/BR.json (a nota de cada partido em cada ano).
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { montaPagina, carregaDados, formata, santinho, NOME_UF, registraRetrato } from './comum.js?v=20261155';
import { grupoOpcoes, trocaMantendoTeclas, CAPITAIS, DA_UF } from './pecas.js?v=20261155';
import { comparacao } from './lib/retrato.js?v=20261155';
import { corIdeologia } from './lib/cores.js?v=20261155';
import { spearman, forcaDaRelacao } from './lib/dinheiro.js?v=20261155';
import { quintis, cortes, faixa, posicaoRelativa } from './lib/indices.js?v=20261155';
import { criaMapaDeLugares, PROJETO } from './mapa-lugares.js?v=20261155';

montaPagina();

const [ind, { notas }, estInd, viesBR] = await Promise.all([carregaDados('indices/municipios.json'),
  carregaDados('partidos-recorte/BR.json'), carregaDados('indices/estados.json'), carregaDados('vies/brasil.json')]);
const K = Object.fromEntries(ind.campos.map((c, i) => [c, i]));
const notaDe = (sigla, ano) => notas[ano]?.[sigla] ?? null;
const MUNICIPIOS = ind.municipios.map(([cod, nome, uf], i) => ({ cod, nome, uf, i }));
const POR_COD = new Map(MUNICIPIOS.map(m => [m.cod, m]));
const PADRAO = { ano: 2024, mun: '20516' };      // João Pessoa
const virgula = (v, casas) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

// os quatro índices: como ler e como escrever
const INDICES = [
  { k: 0, nome: 'PIB per capita', curto: 'PIB per capita', artigo: 'o', fmt: v => formata.real(v) },
  { k: 1, nome: 'IDHM (Atlas do Desenvolvimento Humano, 2010)', curto: 'IDHM', artigo: 'o', fmt: v => virgula(v, 3) },
  { k: 2, nome: 'Eleitores aptos por habitante', curto: 'eleitores por habitante', artigo: 'a parcela de', fmt: v => formata.pct(100 * v) },
  { k: 3, nome: 'Isentos: brancos, nulos e abstenções (do 1º turno)', curto: 'isentos', artigo: 'a parcela de', fmt: v => formata.pct(v) },
];

// o cargo em foco: TODOS (o boletim soma os cargos e o voto é o combinado da pergunta 7: deputado federal nos anos
// gerais, vereador nos municipais) ou um cargo do ano
const TODOS = 'TODOS';
const nomeCargo = c => c.charAt(0) + c.slice(1).toLowerCase();
const slug = c => c.toLowerCase().replaceAll(' ', '-');
const cargoDoVoto = ano => (estado.cargo === TODOS ? (ano % 4 === 2 ? 'deputado federal' : 'vereador') : estado.cargo.toLowerCase());
const arquivoRanking = m => `indices/ranking/${estado.cargo === TODOS ? m.uf : `${m.uf}-${slug(estado.cargo)}`}.json`;

// o voto ideológico do cargo em foco: o índice da pergunta 7, de 0 (esquerda) a 10 (direita)
const ideoClasse = (ano, m) => (estado.cargo === TODOS
  ? (valor(ano, m, K.ideologia) == null ? null : [valor(ano, m, K.ideologia), valor(ano, m, K.classificacao)])
  : ind.ideologia_cargos[ano]?.[estado.cargo]?.[m.i] ?? null);
const ideo = (ano, m) => ideoClasse(ano, m)?.[0] ?? null;
const classeDe = (ano, m) => (ideoClasse(ano, m) ? ind.classificacoes[ideoClasse(ano, m)[1]] : null);
const medianaVoto = ano => d3.median(MUNICIPIOS, x => ideo(ano, x));
const posicaoVoto = (ano, m) => {
  const v = ideo(ano, m), todos = MUNICIPIOS.map(x => ideo(ano, x)).filter(x => x != null);
  return v == null ? null : (100 * todos.filter(x => x < v).length) / todos.length;
};
const bolinha = v => `<i class="ponto-vies" style="--cor:${corIdeologia(v)}" aria-hidden="true"></i>`;
const NOMES_GRUPOS = ['os 20% mais baixos', 'o 2º grupo', 'o grupo do meio', 'o 4º grupo', 'os 20% mais altos'];

// vista: o mapa do Brasil (BR) ou dos municípios do estado escolhido (UF); pinta: indice, voto ou dois
let estado = { ...PADRAO, cargo: TODOS, rel: 0, vista: 'BR', pinta: 'dois' };
const form = document.getElementById('recorte');

function leEndereco() {
  const p = new URLSearchParams(location.hash.slice(1));
  const ano = Number(p.get('ano'));
  estado = { ...estado, ano: ind.anos.includes(ano) ? ano : PADRAO.ano, mun: POR_COD.has(p.get('mun')) ? p.get('mun') : PADRAO.mun };
  estado.cargo = ind.cargos[estado.ano].includes(p.get('cargo')) ? p.get('cargo') : TODOS;
}
const escreveEndereco = () => history.replaceState(null, '', `#${new URLSearchParams({ ano: estado.ano, mun: estado.mun,
  ...(estado.cargo === TODOS ? {} : { cargo: estado.cargo }) })}`);

// ---------------------------------------------------------------- seletor

function montaSeletor() {
  const foco = form.contains(document.activeElement) ? document.activeElement.name : null;
  trocaMantendoTeclas(form, `
    ${grupoOpcoes('ano', 'Ano', ind.anos.map(a => [a, a]), estado.ano)}
    ${grupoOpcoes('cargo', 'Cargo', [[TODOS, 'Todos'], ...ind.cargos[estado.ano].map(c => [c, nomeCargo(c)])], estado.cargo)}`);
  if (foco) form.querySelector(`[name="${foco}"]:checked`)?.focus();
}

form.addEventListener('change', e => {
  const { name, value } = e.target;
  if (name === 'ano') {
    estado.ano = Number(value);
    // um cargo que não houve no ano novo (prefeito num ano geral) volta para todos
    if (!ind.cargos[estado.ano].includes(estado.cargo)) estado.cargo = TODOS;
  }
  if (name === 'cargo') estado.cargo = value;
  atualiza();
});

// ---------------------------------------------------------------- números

const valoresDo = ano => ind.valores[ano];
const valor = (ano, m, k) => valoresDo(ano)[m.i][k];
/** Em quantos por cento dos municípios o índice é menor que o deste (só entre os que têm o dado). */
function posicao(ano, m, k) {
  const v = valor(ano, m, k);
  if (v == null) return null;
  const todos = valoresDo(ano).map(l => l[k]).filter(x => x != null);
  return (100 * todos.filter(x => x < v).length) / todos.length;
}
const mediana = (ano, k) => d3.median(valoresDo(ano), l => l[k]);
const anoDoPrefeito = ano => (ano % 4 === 0 ? ano : ano - 2);


// ---------------------------------------------------------------- santinho e boletim

function desenhaSantinho(m) {
  const ano = estado.ano;
  const [pib, idhm, razao, isentos, pref] = valoresDo(ano)[m.i];
  const v = ideo(ano, m), st = valor(ano, m, K.segundo_turno);
  document.getElementById('santinho-municipio').innerHTML = santinho({
    faixa: `índices · ${ano}`, nome: `${m.nome} (${m.uf})`,
    numero: idhm == null ? '—' : virgula(idhm, 3),
    rotulo: 'de IDHM, o índice de desenvolvimento humano do município (de 0 a 1).',
    linhas: [
      [`PIB per capita (${ind.ano_pib[ano]})`, pib == null ? '—' : formata.real(pib)],
      ['Eleitores por habitante', razao == null ? '—' : formata.pct(100 * razao)],
      ['Isentos (brancos, nulos e abstenções)', isentos == null ? '—' : formata.pct(isentos)],
      [`Partido do prefeito (eleito em ${anoDoPrefeito(ano)})`, pref == null ? '—' : ind.partidos[pref]],
      [`Para que lado votou para ${cargoDoVoto(ano)} (0 esquerda, 10 direita)`, v == null ? '—' : `${bolinha(v)}${virgula(v, 2)} (${classeDe(ano, m).toLowerCase()})`],
      ...(st ? [['Presidente, 2º turno', `${st[0]} ${formata.pct(st[1])} × ${st[2]} ${formata.pct(st[3])}`]] : []),
    ],
    verso: `<p>PIB per capita: o PIB do município dividido pela população, do ano mais recente publicado até a eleição
      (IBGE). IDHM: o índice do Atlas do Desenvolvimento Humano, de 2010, o último anterior às eleições.</p>
      <p>Eleitores por habitante: os eleitores aptos divididos pela população. Isentos: brancos, nulos e abstenções do 1º
      turno de prefeito (anos municipais) ou de presidente (anos gerais), em relação aos aptos.</p>
      <p>Para que lado votou: o índice da pergunta 7, a média das notas dos partidos dada por especialistas (0 esquerda,
      10 direita), com peso pelos votos de cada partido no cargo escolhido; em "todos", os votos para deputado federal
      (anos gerais) ou vereador (anos municipais).</p>`,
    fonte: 'p03a_indices_municipio.sql',
  });
}

async function desenhaBoletim(m) {
  const ano = estado.ano;
  const cargo = estado.cargo;
  const rank = await carregaDados(arquivoRanking(m));
  if (cargo !== estado.cargo || ano !== estado.ano) return;   // o leitor trocou enquanto o arquivo chegava
  const r = rank.anos[ano]?.[m.cod];
  document.getElementById('t-boletim').innerHTML = `<span class="sobre">${m.nome} (${m.uf}) · ${ano} · ${cargo === TODOS ? 'todos os cargos' : nomeCargo(cargo).toLowerCase()}</span>Os partidos que mais recebem votos e elegem`;
  const caixa = document.getElementById('boletim');
  if (!r) { caixa.innerHTML = '<p class="aviso-vazio">Sem votos por partido neste município, ano e cargo.</p>'; return; }
  const local = cargo === TODOS ? ano % 4 === 0 : ['PREFEITO', 'VEREADOR'].includes(cargo);
  const eleitosAli = cargo === TODOS ? 'prefeito e vereadores' : cargo === 'PREFEITO' ? 'o prefeito' : 'vereadores';
  caixa.innerHTML = `<div class="nota-fiscal boletim-urna" role="group" aria-label="Votos e eleitos por partido em ${m.nome}">
    <p class="nota-cabeca"><b>Boletim de urna</b><span>${m.nome} (${m.uf}) · eleição de ${ano} · 1º turno</span>
      <span>${cargo === TODOS ? 'todos os cargos' : nomeCargo(cargo).toLowerCase()}</span></p>
    ${ideo(ano, m) == null ? '' : `<p class="nota-palavra">para que lado votou para ${cargoDoVoto(ano)}: <b>${bolinha(ideo(ano, m))}${virgula(ideo(ano, m), 2)} · ${classeDe(ano, m).toLowerCase()}</b></p>`}
    <p class="nota-legenda"><span>partido · nota</span><span>votos · eleitos ali</span></p>
    <ol class="nota-itens">${r.partidos.map(([p, votos, eleitos], k) => `<li><span class="nota-n">${String(k + 1).padStart(2, '0')}</span>
      <span class="nota-texto">${bolinha(notaDe(rank.partidos[p], ano))}${rank.partidos[p]}${notaDe(rank.partidos[p], ano) == null ? '' : ` · ${virgula(notaDe(rank.partidos[p], ano), 1)}`}</span><b>${formata.numero(votos)} (${formata.pct((100 * votos) / r.total)})${eleitos ? ` · ${eleitos}` : ''}</b></li>`).join('')}</ol>
    <p class="nota-rodape"><span>total de votos em partidos</span><b>${formata.numero(r.total)}</b></p>
    <p class="nota-pe">a bolinha e a nota são a posição do partido (especialistas: 0 esquerda, 10 direita); votos nominais
      e de legenda do 1º turno, ${cargo === TODOS ? 'somados de todos os cargos votados no município' : `só para ${cargo.toLowerCase()}`};
      ${local ? `eleitos: ${eleitosAli}` : 'neste cargo ninguém é eleito pelo município: a vaga é do estado ou do país'}</p>
  </div>`;
}

// ---------------------------------------------------------------- os índices e o voto

/** Os municípios em cinco grupos pelo índice escolhido, com o voto ideológico médio de cada grupo e a correlação. */
function relacao(ano, k) {
  const pares = MUNICIPIOS.map(x => [valor(ano, x, k), ideo(ano, x)]);
  const validos = pares.filter(([a, b]) => a != null && b != null);
  return { grupos: quintis(pares), r: spearman(validos) };
}
const fraseRelacao = (ix, r) => (r == null ? '' : Math.abs(r) < 0.1 ? `${forcaDaRelacao(r)} entre ${ix.curto} e o lado do voto`
  : `${forcaDaRelacao(r)}: quanto maior ${ix.artigo} ${ix.curto}, mais à ${r > 0 ? 'direita' : 'esquerda'} tende a ser o voto`);

function desenhaRelacao(m) {
  const ano = estado.ano;
  const ix = INDICES[estado.rel];
  const escolha = document.getElementById('escolhe-indice');
  trocaMantendoTeclas(escolha, `${grupoOpcoes('rel', 'Índice', INDICES.map(i => [i.k, i.curto]), ix.k)}
    ${grupoOpcoes('pinta', 'Pintar o mapa', [['dois', 'Índice e voto'], ['indice', 'Só o índice'], ['voto', 'Só o voto']], estado.pinta)}`);
  const { grupos, r } = relacao(ano, ix.k);
  const meuValor = valor(ano, m, ix.k);
  const frase = fraseRelacao(ix, r);
  document.getElementById('cargo-relacao').textContent = `o voto para ${cargoDoVoto(ano)}`;
  document.getElementById('frase-relacao').innerHTML = `<strong>${frase.charAt(0).toUpperCase()}${frase.slice(1)}.</strong>`;
  // a régua do voto vai do mais à esquerda ao mais à direita entre as médias, com folga, para as diferenças aparecerem
  const medias = grupos.map(g => g.media);
  const [lo, hi] = [Math.min(...medias, 5) - 0.4, Math.max(...medias, 5) + 0.4];
  const pos = v => (100 * (v - lo)) / (hi - lo);
  const fundo = `linear-gradient(90deg, ${d3.range(0, 1.001, 0.125).map(t => `${corIdeologia(lo + t * (hi - lo))} ${100 * t}%`).join(', ')})`;
  document.getElementById('quintis').style.setProperty('--fundo', fundo);
  document.getElementById('quintis-escala').innerHTML = `<span>${virgula(lo, 1)} · mais à esquerda</span><span>mais à direita · ${virgula(hi, 1)}</span>`;
  document.getElementById('quintis').innerHTML = grupos.map((g, i) => {
    const doMeu = meuValor != null && meuValor >= g.de && meuValor <= g.ate;
    return `<li class="quintil${doMeu ? ' atual' : ''}">
      <span class="quintil-nome"><b>${NOMES_GRUPOS[i]}</b> em ${ix.curto}<small>${ix.fmt(g.de)} a ${ix.fmt(g.ate)} · ${formata.numero(g.n)} municípios${doMeu ? ` · inclui ${m.nome}` : ''}</small></span>
      <span class="quintil-trilho" style="--centro:${pos(5)}%"><i class="ponto-quintil" style="left:${pos(g.media)}%;--cor:${corIdeologia(g.media)}"></i></span>
      <b class="quintil-valor">${virgula(g.media, 2)}</b></li>`;
  }).join('');
}

document.getElementById('escolhe-indice').addEventListener('change', e => {
  if (e.target.name === 'rel') estado.rel = Number(e.target.value);
  if (e.target.name === 'pinta') estado.pinta = e.target.value;
  const m = POR_COD.get(estado.mun);
  desenhaRelacao(m);
  desenhaMapa();
});

// ---------------------------------------------------------------- o mapa

// o voto de cada UF, da pergunta 7: {ano: {cargo: {UF: índice}}}; "todos" é o combinado, e o DF tem deputado distrital
const VOTO_UF = {};
{
  const c = Object.fromEntries(viesBR.campos.map((n, i) => [n, i]));
  for (const l of viesBR.linhas) {
    const uf = l[c.territorio];
    if (!NOME_UF[uf] || l[c.indice] == null) continue;
    const cargo = l[c.cargo] === 'COMBINADO' ? TODOS : l[c.cargo] === 'DEPUTADO DISTRITAL' ? 'DEPUTADO ESTADUAL' : l[c.cargo];
    ((VOTO_UF[l[c.ano]] ??= {})[cargo] ??= {})[uf] = l[c.indice];
  }
}
// índice: cinco tons de ameixa, do mais baixo ao mais alto (os mesmos cinco grupos da lista abaixo do mapa)
const TONS_INDICE = ['#f3e6f0', '#dbb6d5', '#b77eb0', '#874c84', '#5b2457'];

const mapaLugares = criaMapaDeLugares({ caixa: document.getElementById('mapa-indices'), botaoVista: document.getElementById('vista-mapa'),
  chaveSessao: 'mapa-indices-2d', aoEscolher: escolheNoMapa, aoTrocarVista: () => desenhaMapa() });

function escolheNoMapa(k, vista) {
  if (vista === 'UF') estado.mun = k;
  else { estado.vista = 'UF'; estado.mun = CAPITAIS[k]; }
  atualiza();
}

/** Os lugares da vista atual: { chave, nome, indice, voto }, das 27 UFs ou dos municípios do estado escolhido. */
function lugaresDoMapa(ano, k, m) {
  if (estado.vista === 'BR') {
    return Object.keys(NOME_UF).map(uf => ({ chave: uf, nome: NOME_UF[uf], indice: estInd.valores[ano]?.[uf]?.[k] ?? null,
      voto: VOTO_UF[ano]?.[estado.cargo]?.[uf] ?? null }));
  }
  return MUNICIPIOS.filter(x => x.uf === m.uf).map(x => ({ chave: x.cod, nome: x.nome, indice: valor(ano, x, k), voto: ideo(ano, x) }));
}

async function desenhaMapa() {
  const m = POR_COD.get(estado.mun);
  const ano = estado.ano;
  const ix = INDICES[estado.rel];
  const naUF = estado.vista === 'UF';
  const lugares = lugaresDoMapa(ano, ix.k, m);
  // os grupos e as alturas: no Brasil, entre as 27 UFs; nos municípios, entre os 1.238 dos seis estados (como a lista)
  const base = naUF ? MUNICIPIOS.map(x => ({ chave: x.cod, indice: valor(ano, x, ix.k) })) : lugares;
  const c5 = cortes(base.map(l => l.indice), 5);
  const posicoes = posicaoRelativa(base.map(l => l.indice));
  const alturaDe = new Map(base.map((l, i) => [l.chave, posicoes[i]]));
  const cor = l => (estado.pinta === 'indice' ? (l.indice == null ? null : TONS_INDICE[faixa(l.indice, c5)])
    : (l.voto == null ? null : corIdeologia(l.voto)));
  const titulo = l => `${l.nome}: ${ix.curto} ${l.indice == null ? 'sem dado' : ix.fmt(l.indice)} · voto ${l.voto == null ? 'sem dado' : virgula(l.voto, 2)}${!naUF && !PROJETO.has(l.chave) ? ' · fora dos seis estados do projeto' : ''}`;
  const porChave = new Map(lugares.map(l => [l.chave, { cor: cor(l), titulo: titulo(l),
    altura: estado.pinta === 'voto' ? 0 : alturaDe.get(l.chave) ?? null }]));
  const { em3D } = await mapaLugares.desenha({ vista: estado.vista, uf: m.uf, escolhido: naUF ? m.cod : m.uf, porChave });

  document.getElementById('titulo-mapa').textContent = naUF ? `Municípios ${DA_UF[m.uf]}` : 'Os 27 estados';
  document.getElementById('voltar-brasil').hidden = !naUF;
  desenhaLegendaMapa(ix, c5, naUF, base.map(l => l.indice).filter(v => v != null), em3D);
  const r = naUF ? null : spearman(lugares.filter(l => l.indice != null && l.voto != null).map(l => [l.indice, l.voto]));
  const comoMexer = em3D ? 'Arraste para girar e use a roda para aproximar. ' : '';
  document.getElementById('dica-mapa').innerHTML = naUF
    ? `${comoMexer}Clique num município para ver, abaixo, os índices e os partidos dele (agora: <strong>${m.nome}</strong>, em
       laranja).`
    : `Entre os 27 estados, com o voto para ${cargoDoVoto(ano)}: <strong>${fraseRelacao(ix, r)}</strong>. ${comoMexer}Clique
       num dos seis estados do projeto (contorno escuro) para ver os municípios dele; os outros aparecem para comparação.
       Abaixo, os números de <strong>${m.nome} (${m.uf})</strong>.`;
}

function desenhaLegendaMapa(ix, c5, naUF, valores, em3D) {
  const entre = naUF ? 'entre os 1.238 municípios' : 'entre os 27 estados';
  const semDado = `<span><i class="sem-dado"></i>sem dado${em3D ? ' (cinza, rente ao chão)' : ''}</span>`;
  const limites = [null, ...c5, null];
  const faixaTexto = i => (limites[i] == null ? `até ${ix.fmt(limites[i + 1])}`
    : limites[i + 1] == null ? `${ix.fmt(limites[i])} ou mais` : `${ix.fmt(limites[i])} a ${ix.fmt(limites[i + 1])}`);
  const pos = v => (100 * (v - 3)) / 5;
  const paradas = d3.range(3, 8.001, 0.25).map(v => `${corIdeologia(v)} ${pos(v)}%`).join(', ');
  const escalaVoto = `<span class="legenda-titulo">A cor: para que lado votou para ${cargoDoVoto(estado.ano)} (0 = esquerda, 10 = direita)</span>
    <span class="escala-vies"><i style="background: linear-gradient(90deg, ${paradas})"></i>
    ${[4, 5, 6, 7].map(v => `<b style="left:${pos(v)}%">${v}</b>`).join('')}<em class="ponta-esq">esquerda</em><em class="ponta-dir">direita</em></span>`;
  const relevo = !em3D || estado.pinta === 'voto' ? '' : `<span class="legenda-titulo legenda-relevo">A altura: ${ix.artigo} ${ix.curto},
    pela posição ${entre}: o mais baixo fica rente ao chão (${ix.fmt(d3.min(valores))}) e o mais alto, no topo
    (${ix.fmt(d3.max(valores))})</span>`;
  const html = estado.pinta === 'indice'
    ? `<span class="legenda-titulo">A cor: ${ix.nome}, em cinco grupos ${entre}</span><span class="legenda-faixas">
      ${TONS_INDICE.map((t, i) => `<span><i style="background:${t}"></i>${faixaTexto(i)}</span>`).join('')}</span>${relevo}`
    : `${escalaVoto}${relevo}`;
  document.getElementById('legenda-indices').innerHTML = `${html}<span class="legenda-faixas">${semDado}</span>`;
}

document.getElementById('voltar-brasil').addEventListener('click', () => { estado.vista = 'BR'; desenhaMapa(); });

// ---------------------------------------------------------------- ciclo

async function atualiza() {
  escreveEndereco();
  montaSeletor();
  const m = POR_COD.get(estado.mun);
  desenhaSantinho(m);
  desenhaRelacao(m);
  await Promise.all([desenhaMapa(), desenhaBoletim(m)]);
}

leEndereco();
await atualiza();
addEventListener('hashchange', () => { leEndereco(); atualiza(); });
let redimensiona;
addEventListener('resize', () => { clearTimeout(redimensiona); redimensiona = setTimeout(desenhaMapa, 200); });

// ---------------------------------------------------------------- o retrato para o oráculo

/** O que a página mostra agora: os índices do município e a posição dele entre os 1.238, o voto do cargo escolhido,
 *  os grupos de municípios por índice e o ranking dos partidos, com as comparações prontas. */
registraRetrato(async () => {
  const m = POR_COD.get(estado.mun);
  const ano = estado.ano;
  const rank = await carregaDados(arquivoRanking(m));
  const r = rank.anos[ano]?.[m.cod];
  const pref = valoresDo(ano)[m.i][4];
  const doCargo = estado.cargo === TODOS ? 'todos os cargos' : estado.cargo.toLowerCase();
  const meu = k => valor(ano, m, k);
  return {
    numero: 3, pergunta: 'Município rico vota diferente?',
    recorte: `${m.nome} (${m.uf}) · ${ano} · cargo: ${doCargo}`,
    secoes: [
      { titulo: 'Índices do município', linhas: INDICES.map(ix => [ix.nome, meu(ix.k) == null ? 'sem dado'
        : `${ix.fmt(meu(ix.k))} (mediana dos 1.238 municípios: ${ix.fmt(mediana(ano, ix.k))})`]) },
      { titulo: 'Comparações prontas (calculadas pela página)', linhas: INDICES.map(ix => [
        `${ix.curto} em relação à mediana dos municípios`, comparacao(meu(ix.k), mediana(ano, ix.k))]).concat(
        INDICES.map(ix => [`Posição de ${ix.curto}`, posicao(ano, m, ix.k) == null ? null
          : `maior que o de ${formata.pct(posicao(ano, m, ix.k))} dos municípios dos seis estados`])) },
      { titulo: `Para que lado o município votou para ${cargoDoVoto(ano)} (índice da pergunta 7: média das notas dos partidos, 0 esquerda a 10 direita, com peso pelos votos de cada partido)`,
        linhas: ideo(ano, m) == null ? [] : [
          ['Índice do município', `${virgula(ideo(ano, m), 2)} (${classeDe(ano, m).toLowerCase()})`],
          ['Mediana dos 1.238 municípios', virgula(medianaVoto(ano), 2)],
          // dito pelos dois lados: só "mais à direita que X%" o modelo do oráculo às vezes invertia
          ['Posição', `${formata.pct(posicaoVoto(ano, m))} dos municípios dos seis estados votaram mais à esquerda que ele, e os outros ${formata.pct(100 - posicaoVoto(ano, m))} votaram igual ou mais à direita`],
          ...(valor(ano, m, K.segundo_turno) ? [['Presidente, 2º turno no município', (([a, pa, b, pb]) => `${a} ${formata.pct(pa)}, ${b} ${formata.pct(pb)}`)(valor(ano, m, K.segundo_turno))]] : []),
        ] },
      ...INDICES.map(ix => {
        const { grupos, r } = relacao(ano, ix.k);
        return { titulo: `Voto médio para ${cargoDoVoto(ano)} dos municípios em cinco grupos por ${ix.curto}, do grupo mais baixo ao mais alto (entre os 1.238)`,
          linhas: [...grupos.map((g, i) => [null, `${NOMES_GRUPOS[i]} (${ix.fmt(g.de)} a ${ix.fmt(g.ate)}): voto médio ${virgula(g.media, 2)}`]),
            ['Do grupo mais baixo ao mais alto', grupos.length ? `${virgula(grupos[0].media, 2)} → ${virgula(grupos[4].media, 2)}, diferença de ${virgula(Math.abs(grupos[4].media - grupos[0].media), 2)} ponto, ${grupos[4].media > grupos[0].media ? 'mais à direita' : 'mais à esquerda'} no grupo mais alto` : null],
            ['Correlação entre os municípios', fraseRelacao(ix, r)]] };
      }),
      (() => {
        const ix = INDICES[estado.rel];
        const ufs = Object.keys(NOME_UF).map(uf => ({ uf, indice: estInd.valores[ano]?.[uf]?.[ix.k] ?? null, voto: VOTO_UF[ano]?.[estado.cargo]?.[uf] ?? null }));
        const r = spearman(ufs.filter(l => l.indice != null && l.voto != null).map(l => [l.indice, l.voto]));
        return { titulo: `Mapa dos 27 estados: ${ix.curto} (soma dos municípios do estado) e voto para ${cargoDoVoto(ano)}, do maior ao menor ${ix.curto}${estado.vista === 'UF' ? `; o leitor abriu o mapa dos municípios ${DA_UF[m.uf]}` : ''}`,
          linhas: [['Correlação entre os 27 estados', fraseRelacao(ix, r)],
            ['Brasil', `${ix.curto} ${estInd.valores[ano]?.BR?.[ix.k] == null ? '—' : ix.fmt(estInd.valores[ano].BR[ix.k])}`],
            ...ufs.sort((a, b) => (b.indice ?? -1) - (a.indice ?? -1)).map(l => [null,
              `${NOME_UF[l.uf]}${PROJETO.has(l.uf) ? ' (do projeto)' : ''}: ${l.indice == null ? 'sem dado' : ix.fmt(l.indice)}, voto ${l.voto == null ? 'sem dado' : virgula(l.voto, 2)}`])] };
      })(),
      { titulo: `Partido do prefeito (eleito em ${anoDoPrefeito(ano)})`, linhas: pref == null ? [] : [
        ['Partido', ind.partidos[pref]],
      ] },
      { titulo: `Partidos mais votados no município (votos nominais e de legenda do 1º turno, ${doCargo}) e eleitos ali`,
        linhas: r ? r.partidos.slice(0, 10).map(([p, votos, eleitos]) => [null,
          `${rank.partidos[p]} (nota ${notaDe(rank.partidos[p], ano) == null ? '—' : virgula(notaDe(rank.partidos[p], ano), 1)}): ${formata.pct((100 * votos) / r.total)} dos votos${eleitos ? `, ${eleitos} ${eleitos === 1 ? 'eleito' : 'eleitos'}` : ''}`]) : [] },
    ],
  };
});
