// Pergunta 4: escolaridade. No mini mapa, o leitor escolhe o lugar dos números: os seis estados juntos, um deles ou um
// dos seus municípios. A escada dos diplomas põe os candidatos do lugar em oito degraus, de analfabeto a superior completo, com os eleitos em verde e a
// taxa de eleição de cada degrau; o santinho resume a escada. O boletim escolar divide os municípios do lugar em cinco
// grupos pela escolaridade de quem foi votar e dá a nota (de 0 a 7) de quem votou, de quem recebeu os votos e dos eleitos.
//
// Dados: escolaridade/escolaridade.json (candidatos e eleitos por grau, cargo, ano e lugar; o nível médio de quem votou e
// de quem recebeu os votos em cada município) e escolaridade/estados.json (os mesmos níveis nas 27 UFs, no texto que
// aparece ao passar o ponteiro pelo mini mapa).
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { montaPagina, carregaDados, formata, santinho, NOME_UF, registraRetrato, fotoCandidato } from './comum.js?v=20261157';
import { grupoOpcoes, trocaMantendoTeclas, DA_UF } from './pecas.js?v=20261157';
import { comparacao } from './lib/retrato.js?v=20261157';
import { forcaDaRelacao } from './lib/dinheiro.js?v=20261157';
import { quintis } from './lib/indices.js?v=20261157';
import { janelasDoAndar } from './lib/predio.js?v=20261157';
import { NOMES_NIVEIS, nivelEmPalavras, taxa, pearson } from './lib/escolaridade.js?v=20261157';
import { criaMapaDeLugares, PROJETO } from './mapa-lugares.js?v=20261157';

montaPagina();

const [esc, estEsc] = await Promise.all([carregaDados('escolaridade/escolaridade.json'), carregaDados('escolaridade/estados.json')]);
const MUNICIPIOS = esc.municipios.map(([cod, nome, uf], i) => ({ cod, nome, uf, i }));
const POR_COD = new Map(MUNICIPIOS.map(m => [m.cod, m]));
const TODOS = 'TODOS';
const SEIS = 'SEIS';      // o lugar padrão: os seis estados do projeto juntos
const PADRAO = { ano: 2024, cargo: TODOS };
const virgula = (v, casas = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const nomeCargo = c => c.charAt(0) + c.slice(1).toLowerCase();
const maiuscula = t => t.charAt(0).toUpperCase() + t.slice(1);
// o boletim e o mapa precisam de um cargo: em "todos", o de mais candidatos (deputado federal nos anos gerais, vereador
// nos municipais), como o combinado da pergunta 7
const cargoDoBoletim = (ano, cargo) => (cargo === TODOS ? (ano % 4 === 2 ? 'DEPUTADO FEDERAL' : 'VEREADOR') : cargo);
const NOMES_GRUPOS = ['1º grupo: o eleitorado com menos estudo', '2º grupo', '3º grupo', '4º grupo', '5º grupo: o eleitorado com mais estudo'];
// os degraus juntos em três blocos, para o santinho e o retrato
const BLOCOS = [['até o ensino fundamental completo', [0, 1, 2, 3]], ['ensino médio, completo ou não', [4, 5]], ['superior, completo ou não', [6, 7]]];
const somaDegraus = (degraus, ks) => ks.reduce(([c, e], k) => [c + degraus[k][0], e + degraus[k][1]], [0, 0]);
const PASSOS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];
const MAX_BONECOS = 48;   // no degrau mais cheio

// lugar: SEIS, a sigla de um dos seis estados ou o código de um município
// degrau e candidato: o que o leitor abriu na escada (não vão para o endereço)
let estado = { ...PADRAO, lugar: SEIS, degrau: null, candidato: null };
const form = document.getElementById('recorte');
const ufDoLugar = lugar => (lugar === SEIS ? null : POR_COD.get(lugar)?.uf ?? lugar);
const nomeDoLugar = lugar => (lugar === SEIS ? 'Os seis estados' : POR_COD.has(lugar)
  ? `${POR_COD.get(lugar).nome} (${POR_COD.get(lugar).uf})` : NOME_UF[lugar]);

function leEndereco() {
  const p = new URLSearchParams(location.hash.slice(1));
  const ano = Number(p.get('ano'));
  estado.ano = esc.anos.includes(ano) ? ano : PADRAO.ano;
  estado.cargo = esc.cargos[estado.ano].includes(p.get('cargo')) ? p.get('cargo') : TODOS;
  const lugar = p.get('lugar');
  estado.lugar = PROJETO.has(lugar) || POR_COD.has(lugar) ? lugar : SEIS;
}
const escreveEndereco = () => history.replaceState(null, '', `#${new URLSearchParams({ ano: estado.ano,
  ...(estado.cargo === TODOS ? {} : { cargo: estado.cargo }), ...(estado.lugar === SEIS ? {} : { lugar: estado.lugar }) })}`);

function montaSeletor() {
  trocaMantendoTeclas(form, `
    ${grupoOpcoes('ano', 'Ano', esc.anos.map(a => [a, a]), estado.ano)}
    ${grupoOpcoes('cargo', 'Cargo', [[TODOS, 'Todos'], ...esc.cargos[estado.ano].map(c => [c, nomeCargo(c)])], estado.cargo)}`);
}

form.addEventListener('change', e => {
  const { name, value } = e.target;
  if (name === 'ano') {
    estado.ano = Number(value);
    if (!esc.cargos[estado.ano].includes(estado.cargo)) estado.cargo = TODOS;
  }
  if (name === 'cargo') estado.cargo = value;
  atualiza();
});

/** A escada do lugar; um município num ano geral não tem candidatos próprios, e vale a do estado dele. */
function degrausDe() {
  const doAno = esc.escada[estado.ano];
  const vazia = NOMES_NIVEIS.map(() => [0, 0]);
  const lugar = doAno[estado.lugar] ? estado.lugar : ufDoLugar(estado.lugar);
  return { degraus: doAno[lugar]?.[estado.cargo] ?? vazia, lugar };
}
const doCargo = () => (estado.cargo === TODOS ? 'todos os cargos' : nomeCargo(estado.cargo).toLowerCase());

// ---------------------------------------------------------------- o mini mapa

const miniMapa = criaMapaDeLugares({ caixa: document.getElementById('mini-mapa'), chaveSessao: 'mini-mapa-escolaridade',
  aoEscolher: escolheNoMapa, plano: true, larguraMax: 260 });

function escolheNoMapa(k, vista) {
  // no estado, clicar de novo no município escolhido volta ao estado inteiro
  if (vista === 'UF') estado.lugar = k === estado.lugar ? ufDoLugar(k) : k;
  else estado.lugar = k;
  atualiza();
}

/** O texto de cada lugar ao passar o ponteiro: a nota de quem votou e a de quem recebeu os votos. */
function lugaresDoMapa(ano, cargoB, uf) {
  if (!uf) {
    return Object.keys(NOME_UF).map(u => ({ chave: u, nome: NOME_UF[u], eleitor: estEsc.eleitorado[ano]?.[u] ?? null,
      votado: estEsc.votados[ano]?.[cargoB]?.[u] ?? null }));
  }
  const votados = esc.votados[ano][cargoB];
  return MUNICIPIOS.filter(x => x.uf === uf).map(x => ({ chave: x.cod, nome: x.nome, eleitor: esc.eleitorado[ano][x.i],
    votado: votados[x.i]?.[0] ?? null }));
}

function desenhaMiniMapa() {
  const ano = estado.ano, cargoB = cargoDoBoletim(ano, estado.cargo);
  const uf = ufDoLugar(estado.lugar);
  const nota = v => (v == null ? 'sem dado' : virgula(v));
  // sem cores de dado: o mini mapa só escolhe o lugar; os seis estados ficam mais escuros, os outros, para referência
  const porChave = new Map(lugaresDoMapa(ano, cargoB, uf).map(l => [l.chave, {
    cor: uf ? '#cdb98c' : PROJETO.has(l.chave) ? '#b49a63' : '#d6c9ad',
    titulo: `${l.nome}: quem votou ${nota(l.eleitor)} · quem recebeu os votos ${nota(l.votado)}${!uf && !PROJETO.has(l.chave) ? ' · fora dos seis estados do projeto' : ''}` }]));
  miniMapa.desenha({ vista: uf ? 'UF' : 'BR', uf, escolhido: POR_COD.has(estado.lugar) ? estado.lugar : null, porChave });
  document.getElementById('lugar-atual').textContent = nomeDoLugar(estado.lugar);
  document.getElementById('dica-mini').textContent = !uf ? 'Clique num dos seis estados do projeto (contorno escuro).'
    : POR_COD.has(estado.lugar) ? 'Clique em outro município, ou de novo neste para ver o estado inteiro.'
      : 'Clique num município para ver os números dele.';
  const voltar = document.getElementById('voltar-lugar');
  voltar.hidden = !uf;
  voltar.textContent = POR_COD.has(estado.lugar) ? 'Ver o estado inteiro' : 'Voltar aos seis estados';
}

document.getElementById('voltar-lugar').addEventListener('click', () => {
  estado.lugar = POR_COD.has(estado.lugar) ? ufDoLugar(estado.lugar) : SEIS;
  atualiza();
});

// ---------------------------------------------------------------- a escada dos diplomas

function desenhaEscada() {
  const { degraus, lugar } = degrausDe();
  const maior = Math.max(...degraus.map(d => d[0]));
  const passo = maior ? PASSOS.find(q => maior / q <= MAX_BONECOS) ?? Math.ceil(maior / MAX_BONECOS) : 1;
  document.getElementById('t-escada').innerHTML = `<span class="sobre">${nomeDoLugar(estado.lugar)} · ${estado.ano} · ${doCargo()}</span>A escada dos diplomas`;
  // com um candidato por bonequinho, cada um leva a posição dele no degrau (os não eleitos primeiro)
  const bonecos = (n, verde, de) => Array.from({ length: n }, (_, j) => `<i class="boneco${verde ? ' eleito' : ''}"${passo === 1 ? ` data-i="${de + j}"` : ''}></i>`).join('');
  document.getElementById('escada').innerHTML = degraus.map(([candidatos, eleitos], k) => {
    const { janelas, acesas } = janelasDoAndar(candidatos, eleitos, passo);
    const t = taxa([candidatos, eleitos]);
    return `<div class="degrau" style="--k:${k}">
      <button type="button" class="degrau-botao" data-k="${k}" aria-pressed="false"${candidatos ? '' : ' disabled'}
        title="${maiuscula(NOMES_NIVEIS[k])}: ${formata.numero(candidatos)} candidatos, ${formata.numero(eleitos)} eleitos; clique para ver os candidatos">
      <span class="degrau-gente" aria-hidden="true">${bonecos(janelas - acesas, false, 0)}${bonecos(acesas, true, janelas - acesas)}</span>
      <span class="degrau-pedra"><b>${t == null ? '—' : formata.pct(t)}</b><span>${k}</span></span></button>
      <p class="degrau-nome">${NOMES_NIVEIS[k]}<small>${formata.numero(candidatos)} cand. · ${formata.numero(eleitos)} eleitos</small></p>
    </div>`;
  }).join('');
  const notas = [];
  if (lugar !== estado.lugar) notas.push(`Em ${estado.ano} ninguém se candidatou por um município (a eleição foi geral): a escada é a ${DA_UF[lugar]}.`);
  if (estado.lugar === SEIS && estado.ano % 4 === 2) notas.push('Os seis estados juntos incluem os candidatos a presidente.');
  if (!maior) notas.push('Nenhum candidato neste cargo e lugar.');
  else notas.push(passo === 1 ? 'Cada bonequinho é um candidato.'
    : `Cada bonequinho vale cerca de ${formata.numero(passo)} candidatos; um degrau com algum eleito tem ao menos um verde.`);
  document.getElementById('escada-passo').textContent = notas.join(' ');
}

function desenhaSantinho() {
  const { degraus } = degrausDe();
  const blocos = BLOCOS.map(([nome, ks]) => [nome, somaDegraus(degraus, ks)]);
  const total = somaDegraus(degraus, [0, 1, 2, 3, 4, 5, 6, 7]);
  const sup = degraus[7];
  document.getElementById('santinho-escolaridade').innerHTML = santinho({
    faixa: `escolaridade · ${estado.ano}`, nome: `${nomeDoLugar(estado.lugar)} · ${doCargo()}`,
    numero: taxa(sup) == null ? '—' : formata.pct(taxa(sup)),
    rotulo: 'dos candidatos com superior completo se elegeram.',
    linhas: [
      ...blocos.map(([nome, b]) => [`Taxa de eleição: ${nome}`, taxa(b) == null ? '—' : formata.pct(taxa(b))]),
      ['Candidatos', formata.numero(total[0])],
      ['Eleitos', `${formata.numero(total[1])} (${taxa(total) == null ? '—' : formata.pct(taxa(total))})`],
    ],
    verso: `<p>A escolaridade é a que o candidato declarou ao TSE no registro da candidatura, em oito graus, de analfabeto (0)
      a superior completo (7). A taxa de eleição de um grau é o número de eleitos dividido pelo de candidatos dele.</p>
      <p>Num estado, contam as candidaturas do estado e as dos seus municípios; num município, as dele.</p>
      <p>Analfabetos não podem se candidatar (Constituição, art. 14, § 4º); os poucos casos no TSE são erros de cadastro.
      Uma taxa sobre poucos candidatos (como os degraus de baixo nas eleições gerais) muda muito com um ou dois casos.</p>`,
    fonte: 'p04a_escolaridade_sucesso.sql',
  });
}

// ---------------------------------------------------------------- os candidatos de um degrau

/** O arquivo de candidatos do lugar: o do município nos anos municipais, o do estado nos gerais; null quando o lugar
 *  tem candidatos demais para listar (os seis estados juntos, ou um estado inteiro num ano municipal). */
function arquivoDeCandidatos() {
  const uf = ufDoLugar(estado.lugar);
  if (!uf) return null;
  if (estado.ano % 4 === 0) return POR_COD.has(estado.lugar) ? `escolaridade/candidatos/${estado.lugar}-${estado.ano}.json` : null;
  return `escolaridade/candidatos/${uf}-${estado.ano}.json`;
}

/** Os candidatos do degrau k no lugar e cargo: os não eleitos e depois os eleitos (a ordem dos bonequinhos). */
async function candidatosDoDegrau(k) {
  const caminho = arquivoDeCandidatos();
  if (!caminho) return null;
  let arq;
  try { arq = await carregaDados(caminho); } catch { return []; }
  const c = Object.fromEntries(arq.campos.map((n, i) => [n, i]));
  const todos = arq.linhas.map(l => ({ nome: l[c.nome], pid: l[c.pid], sigla: arq.partidos[l[c.partido]], cargo: arq.cargos[l[c.cargo]],
    eleito: Boolean(l[c.eleito]), nivel: l[c.nivel], eleitores: l[c.nivel_eleitores] ?? null, votos: l[c.votos] ?? null, foto: l[c.foto] ?? null }))
    .filter(x => x.nivel === k && (estado.cargo === TODOS || x.cargo === estado.cargo));
  const porVotos = (a, b) => (b.votos ?? 0) - (a.votos ?? 0);
  return [...todos.filter(x => !x.eleito).sort(porVotos), ...todos.filter(x => x.eleito).sort(porVotos)];
}

const MAX_LISTA = 40;
let listaCompleta = false;

async function desenhaCandidatos() {
  const caixa = document.getElementById('candidatos-escada');
  document.querySelectorAll('.degrau-botao').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.k) === estado.degrau)));
  if (estado.degrau == null) { caixa.innerHTML = ''; return; }
  const pedido = `${estado.ano}-${estado.cargo}-${estado.lugar}-${estado.degrau}`;
  const lista = await candidatosDoDegrau(estado.degrau);
  if (pedido !== `${estado.ano}-${estado.cargo}-${estado.lugar}-${estado.degrau}`) return;   // o leitor trocou no meio
  const k = estado.degrau;
  if (lista == null) {
    caixa.innerHTML = `<p class="aviso-vazio">${estado.lugar === SEIS ? 'Escolha um estado' : 'Escolha um município'} no mini mapa
      para ver, um a um, os candidatos com ${NOMES_NIVEIS[k]}: aqui são muitos para listar.</p>`;
    return;
  }
  // na lista, os eleitos primeiro
  const ordem = [...lista.filter(x => x.eleito), ...lista.filter(x => !x.eleito)];
  const mostrados = listaCompleta ? ordem : ordem.slice(0, MAX_LISTA);
  const escolhido = estado.candidato == null ? null : lista[estado.candidato];
  caixa.innerHTML = `<div class="candidatos-grade">
    <section class="candidatos-lista" aria-label="Candidatos com ${NOMES_NIVEIS[k]}">
      <h3>${maiuscula(NOMES_NIVEIS[k])} <small>${formata.numero(lista.length)} ${lista.length === 1 ? 'candidato' : 'candidatos'} · ${nomeDoLugar(estado.lugar)} · ${doCargo()}</small></h3>
      ${lista.length ? `<ul>${mostrados.map(x => `<li><button type="button" class="candidato-linha${x.eleito ? ' eleito' : ''}" data-i="${lista.indexOf(x)}"
        aria-pressed="${x === escolhido}"><b>${x.nome ?? 'Candidato sem nome no banco'}</b><span>${x.sigla} · ${nomeCargo(x.cargo).toLowerCase()}${x.eleito ? ' · eleito' : ''}</span></button></li>`).join('')}</ul>
      ${!listaCompleta && ordem.length > MAX_LISTA ? `<button type="button" class="botao" id="lista-toda">Mostrar todos (${formata.numero(ordem.length)})</button>` : ''}`
        : '<p class="aviso-vazio">Nenhum candidato neste degrau.</p>'}
    </section>
    <div class="candidato-cartao">${escolhido ? miniCartao(escolhido) : '<p class="apoio">Clique num nome para ver quem é.</p>'}</div>
  </div>`;
}

/** O mini cartão: quem é, o grau de escolaridade, a nota de quem votou na candidatura e o link para a carreira. */
function miniCartao(x) {
  const frase = x.eleitores == null ? '' : x.nivel > x.eleitores + 0.5 ? 'Tem mais estudo que a média de quem votou nessa candidatura.'
    : x.nivel < x.eleitores - 0.5 ? 'Tem menos estudo que a média de quem votou nessa candidatura.'
      : 'Tem mais ou menos o mesmo estudo que a média de quem votou nessa candidatura.';
  // o TSE dá a escolaridade de quem foi votar por município, não por candidato: num cargo municipal, é a do município
  const municipal = ['VEREADOR', 'PREFEITO', 'VICE-PREFEITO'].includes(x.cargo);
  return `<article class="mini-cartao${x.eleito ? '' : ' derrota'}">
    <header>${fotoCandidato(x.foto, 'mini-cartao-foto')}<div><b>${x.nome ?? 'Candidato sem nome no banco'}</b>
      <span>${x.sigla} · ${nomeCargo(x.cargo).toLowerCase()} · ${estado.ano}</span>
      <span class="mini-cartao-resultado">${x.eleito ? 'eleito' : '× não eleito'}</span></div></header>
    <dl>
      <div><dt>Escolaridade</dt><dd>${maiuscula(NOMES_NIVEIS[x.nivel])} <small>(${x.nivel} de 7)</small></dd></div>
      <div><dt>Quem votou${municipal ? ' (o eleitorado do município)' : ' (média dos municípios onde teve votos)'}</dt><dd>${x.eleitores == null ? (x.votos ? 'sem dado' : 'sem votos próprios')
        : `nota ${virgula(x.eleitores)} <small>(${nivelEmPalavras(x.eleitores)})</small>`}</dd></div>
      ${x.votos ? `<div><dt>Votos</dt><dd>${formata.numero(x.votos)}</dd></div>` : ''}
    </dl>
    ${frase ? `<p class="mini-cartao-nota">${frase}</p>` : ''}
    ${x.pid ? `<a class="botao" href="pergunta-10.html#${x.pid}">Ver a carreira</a>` : ''}
  </article>`;
}

document.getElementById('escada').addEventListener('click', e => {
  const botao = e.target.closest('.degrau-botao');
  if (!botao) return;
  const k = Number(botao.dataset.k);
  const boneco = e.target.closest('.boneco[data-i]');
  // clicar de novo no degrau aberto fecha a lista; num bonequinho (um por candidato), abre o cartão dele
  estado.candidato = boneco ? Number(boneco.dataset.i) : null;
  estado.degrau = estado.degrau === k && !boneco ? null : k;
  listaCompleta = false;
  desenhaCandidatos();
});
document.getElementById('candidatos-escada').addEventListener('click', e => {
  if (e.target.closest('#lista-toda')) { listaCompleta = true; desenhaCandidatos(); return; }
  const linha = e.target.closest('.candidato-linha');
  if (!linha) return;
  estado.candidato = Number(linha.dataset.i);
  desenhaCandidatos();
});

// ---------------------------------------------------------------- o boletim escolar

/** Os municípios do lugar (todos os 1.238 nos seis estados juntos; os do estado num estado ou município), no ano e
 *  cargo do boletim: [município, quem votou, quem recebeu os votos, eleitos]. */
function linhasDoBoletim() {
  const cargo = cargoDoBoletim(estado.ano, estado.cargo);
  const uf = ufDoLugar(estado.lugar);
  const eleitor = esc.eleitorado[estado.ano], votados = esc.votados[estado.ano][cargo];
  return MUNICIPIOS.filter(m => !uf || m.uf === uf).map(m => [m, eleitor[m.i], votados[m.i]?.[0] ?? null, votados[m.i]?.[1] ?? null])
    .filter(([, e, v]) => e != null && v != null);
}

function grupos(linhas) {
  // o eleitor ordena; cada par leva o município, para as outras médias saírem do mesmo grupo
  return quintis(linhas.map(l => [l[1], l])).map(g => ({ ...g,
    eleitor: d3.mean(g.pares, p => p[1][1]), votado: d3.mean(g.pares, p => p[1][2]), eleitos: d3.mean(g.pares, p => p[1][3]) }));
}

const fraseDaRelacao = r => (r == null ? 'dados insuficientes' : Math.abs(r) < 0.1 ? `${forcaDaRelacao(r)} entre o estudo de quem votou e o de quem recebeu os votos`
  : `${forcaDaRelacao(r)}: onde quem vota estudou mais, os votos tendem a ir para candidatos com ${r > 0 ? 'mais' : 'menos'} estudo`);

function desenhaBoletim() {
  const cargo = cargoDoBoletim(estado.ano, estado.cargo);
  const uf = ufDoLugar(estado.lugar);
  const linhas = linhasDoBoletim();
  const gs = grupos(linhas);
  const r = pearson(linhas.map(l => [l[1], l[2]]));
  const m = POR_COD.get(estado.lugar);
  const doMeu = g => m && g.pares.some(p => p[1][0] === m);
  const nota = (v, classe) => (v == null ? '<td class="num">—</td>'
    : `<td class="nota-escolar ${classe}"><b>${virgula(v)}</b><span class="nota-trilho"><span class="nota-barra" style="--v:${v / 7}"></span></span></td>`);
  document.getElementById('t-boletim-escolar').innerHTML = `<span class="sobre">${uf ? `os municípios ${DA_UF[uf]}` : 'os 1.238 municípios dos seis estados'}</span>Lugares com menos estudo elegem gente parecida?`;
  document.getElementById('boletim-escolar').innerHTML = gs.length ? `<div class="boletim-escolar" role="group" aria-label="Boletim escolar dos municípios">
    <p class="boletim-cabeca"><b>Boletim escolar</b><span>${uf ? NOME_UF[uf] : 'seis estados'} · eleições de ${estado.ano} · ${nomeCargo(cargo).toLowerCase()}${estado.cargo === TODOS ? ' (o cargo de mais candidatos)' : ''} · nota de 0 a 7</span></p>
    <div class="rolagem"><table class="tabela">
      <thead><tr><th>Grupo de municípios</th><th>Quem foi votar</th><th>Quem recebeu os votos</th><th>Os eleitos</th></tr></thead>
      <tbody>${gs.map((g, i) => `<tr${doMeu(g) ? ' class="atual"' : ''}><td class="grupo-escolar"><b>${NOMES_GRUPOS[i]}</b>
        <small>${formata.numero(g.n)} municípios · eleitorado de ${virgula(g.de)} a ${virgula(g.ate)}${doMeu(g) ? ` · inclui ${m.nome}` : ''}</small></td>
        ${nota(g.eleitor, 'eleitor')}${nota(g.votado, 'votado')}${nota(g.eleitos, 'eleitos')}</tr>`).join('')}</tbody>
    </table></div>
    <p class="boletim-pe">0 analfabeto · 1 lê e escreve · 3 fundamental completo · 5 médio completo · 7 superior completo</p>
  </div>` : '<p class="aviso-vazio">Municípios de menos para dividir em cinco grupos.</p>';
  document.getElementById('frase-escolaridade').innerHTML = r == null || !gs.length ? ''
    : `<strong>${maiuscula(fraseDaRelacao(r))}</strong> (correlação de ${virgula(r)} entre os ${formata.numero(linhas.length)} municípios).
      Do 1º ao 5º grupo, a nota de quem recebeu os votos vai de ${virgula(gs[0].votado)} a ${virgula(gs[4].votado)}.`;
}

// ---------------------------------------------------------------- ciclo

function atualiza() {
  estado.degrau = null; estado.candidato = null;
  escreveEndereco();
  montaSeletor();
  desenhaMiniMapa();
  desenhaEscada();
  desenhaSantinho();
  desenhaBoletim();
  desenhaCandidatos();
}

leEndereco();
atualiza();
addEventListener('hashchange', () => { leEndereco(); atualiza(); });

// ---------------------------------------------------------------- o retrato para o oráculo

/** O que a página mostra agora: o lugar, a escada (candidatos, eleitos e taxa de cada grau), os blocos com as
 *  comparações prontas e os cinco grupos de municípios com a correlação. */
registraRetrato(() => {
  const { degraus, lugar } = degrausDe();
  const blocos = BLOCOS.map(([nome, ks]) => [nome, taxa(somaDegraus(degraus, ks))]);
  const cargoB = cargoDoBoletim(estado.ano, estado.cargo);
  const uf = ufDoLugar(estado.lugar);
  const linhas = linhasDoBoletim();
  const gs = grupos(linhas);
  const r = pearson(linhas.map(l => [l[1], l[2]]));
  return {
    numero: 4, pergunta: 'Estudo ajuda a eleger?',
    recorte: `${nomeDoLugar(estado.lugar)} · ${estado.ano} · ${doCargo()}`,
    secoes: [
      { titulo: `Escada dos diplomas de ${nomeDoLugar(lugar)}: candidatos, eleitos e taxa de eleição por grau de escolaridade declarado${lugar !== estado.lugar ? ` (em ano geral, ninguém se candidata por um município: vale a escada do estado)` : ''}`,
        linhas: degraus.map(([c, e], k) => [NOMES_NIVEIS[k], `${formata.numero(c)} candidatos, ${formata.numero(e)} eleitos${c ? `, taxa ${formata.pct(taxa([c, e]))}` : ''}`]) },
      { titulo: 'Taxa de eleição por bloco de escolaridade', linhas: blocos.map(([nome, t]) => [nome, t == null ? 'sem candidatos' : formata.pct(t)]) },
      { titulo: 'Comparações prontas (calculadas pela página)', linhas: [
        // com o nome e o valor de cada bloco, para a comparação não ser atribuída a um degrau só (o superior completo)
        ...[0, 1].map(i => [`Taxa do bloco "${blocos[2][0]}" (${blocos[2][1] == null ? '—' : formata.pct(blocos[2][1])}) em relação à do bloco "${blocos[i][0]}" (${blocos[i][1] == null ? '—' : formata.pct(blocos[i][1])})`,
          comparacao(blocos[2][1], blocos[i][1])]),
      ] },
      { titulo: `Boletim escolar: os ${formata.numero(linhas.length)} municípios ${uf ? DA_UF[uf] : 'dos seis estados'} em cinco grupos pela escolaridade de quem foi votar (nota de 0 a 7), com a de quem recebeu os votos para ${nomeCargo(cargoB).toLowerCase()} e a dos eleitos`,
        linhas: gs.map((g, i) => [null, `${NOMES_GRUPOS[i]} (${g.n} municípios): quem votou ${virgula(g.eleitor)}, quem recebeu os votos ${virgula(g.votado)}, eleitos ${g.eleitos == null ? '—' : virgula(g.eleitos)}`]) },
      { titulo: 'Relação entre os municípios', linhas: [
        ['Correlação (Pearson) entre o estudo de quem votou e o de quem recebeu os votos', r == null ? null : `${virgula(r, 3)}: ${fraseDaRelacao(r)}`],
        ['Quem recebeu os votos, do 1º ao 5º grupo', gs.length ? `${virgula(gs[0].votado)} → ${virgula(gs[4].votado)}` : null],
      ] },
      { titulo: 'Ressalva', linhas: [[null, 'A escolaridade do eleitor no TSE é a declarada ao tirar o título e quase nunca é atualizada, então subestima a escolaridade real; a do candidato é declarada a cada registro. Os dois números não medem exatamente a mesma coisa.']] },
    ],
  };
});
