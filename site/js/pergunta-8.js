// Pergunta 8: dinheiro público elege? O leitor preenche os dez cifrões com a parcela de dinheiro público na receita
// e vê a taxa de vitória de quem tem pelo menos isso, contra quem tem menos; cada candidato como uma torneira (a
// receita dividida em pública e privada); os partidos pela dependência média e pela taxa de vitória; e os que mais
// receberam, com o custo de cada voto pago com dinheiro público.
//
// Dados: dependencia/BR.json e dependencia/municipios/UF.json (candidatos e eleitos por meio cifrão, isto é, por
// fatia de 5% de dinheiro público); mapa/ (anos e nomes dos municípios);
// candidaturas/<ue>-<ano>.json (cada candidato, com receita, receita pública e votos).
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import * as Plot from 'https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.17/+esm';
import { comparacao } from './lib/retrato.js?v=20261156';
import { montaPagina, carregaDados, formata, fotoCandidato, NOME_UF, em, registraRetrato } from './comum.js?v=20261156';
import { custoPorVoto } from './lib/dinheiro.js?v=20261156';
import { COR } from './lib/cores.js?v=20261156';
import { preenchimento, comPeloMenos, meiosDoClique } from './lib/cifroes.js?v=20261156';
import { ueDoRecorte, MUNICIPAIS } from './lib/recorte.js?v=20261156';
import { montaSeletor, leCandidaturas, nomeDe, AVISO_CONTAS_2026 } from './pecas.js?v=20261156';

montaPagina();

// verde-água: o dinheiro público não é ideologia nem resultado, então não usa as cores deles
const PUBLICO = '#2e8b7a', PRIVADO = '#cbbd9d';
const brasil = await carregaDados('mapa/brasil.json');
const minusculo = c => c.toLowerCase();
const reduz = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const territorio = r => (r.cargo === 'PRESIDENTE' ? 'BR' : MUNICIPAIS.includes(r.cargo) && r.mun ? r.mun : r.uf ?? 'BR');
const parcela = c => (c.receita > 0 ? (100 * (c.receita_publica ?? 0)) / c.receita : null);
let primeiraPintura = true;

async function nomeLugar(r) {
  const t = territorio(r);
  if (/^\d{5}$/.test(t)) return (await carregaDados(`mapa/municipios/${r.uf}.json`)).municipios[t]?.nome ?? t;
  return t === 'BR' ? 'Brasil' : NOME_UF[t];
}

/** Candidatos e eleitos de cada meio cifrão de dinheiro público no recorte: [{meio_cifrao, candidatos, eleitos}]. */
async function fatiasDoRecorte(r) {
  const t = territorio(r);
  const dados = await carregaDados(/^\d{5}$/.test(t) ? `dependencia/municipios/${r.uf}.json` : 'dependencia/BR.json');
  const ic = dados.cargos.indexOf(r.cargo);
  return dados.linhas.map(l => Object.fromEntries(dados.campos.map((c, i) => [c, l[i]])))
    .filter(x => x.ano === r.ano && x.cargo === ic && x.territorio === t);
}

/** A torneira desenhada à esquerda de cada barra: a água sai do bico e vira a barra. */
const BICA = `<svg class="bica" viewBox="0 0 30 26" aria-hidden="true">
  <rect x="9" y="1" width="10" height="3.5" rx="1.5"/><rect x="12.5" y="4" width="3" height="5"/>
  <path d="M2 9h17a7 7 0 0 1 7 7v1h-6v-1a2 2 0 0 0-2-2H2z"/><rect x="0" y="8" width="3" height="7" rx="1"/></svg>`;

// as barras só se enchem quando aparecem na tela, como água saindo da torneira, em cascata
const observador = 'IntersectionObserver' in window ? new IntersectionObserver(entradas => {
  entradas.filter(e => e.isIntersecting).forEach((e, i) => {
    observador.unobserve(e.target);
    e.target.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
      { duration: 700, delay: 60 * i, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' });
    e.target.classList.remove('a-encher');          // a animação segura o vazio até a vez desta barra
  });
}, { threshold: 0.6 }) : null;

/** Marca as barras para encherem quando o leitor chegar até elas (sem animação com movimento reduzido). */
function escorre(seletor, raiz) {
  if (reduz() || !observador) return;
  raiz.querySelectorAll(seletor).forEach(el => { el.classList.add('a-encher'); observador.observe(el); });
}

// ---------------------------------------------------------------- os cifrões que o leitor preenche

let meios = 15;                 // a escolha: meios cifrões (cada um, 5% de dinheiro público); 15 = 75%
let estado = null;              // { fatias, cands, nome, r } do recorte desenhado
const caixaCifroes = document.getElementById('cifroes-escolha');
const L = 34, A = 46;
const rotuloEscolha = m => (m === 0 ? 'qualquer parcela de dinheiro público' : m === 20 ? 'campanha toda com dinheiro público'
  : `${m * 5}% ou mais de dinheiro público`);
const aPartirDe = pct => (pct === 100 ? '100%' : `${pct}% ou mais`);

/** Os dez cifrões, preenchidos até `m` meios cifrões (a escolha, ou a prévia sob o mouse). */
function pintaCifroes(m) {
  caixaCifroes.innerHTML = `<svg viewBox="0 0 ${L * 10} ${A}" aria-hidden="true">${preenchimento(m * 5).map((p, i) => `
    <g data-i="${i}" transform="translate(${i * L} 0)"><rect class="alvo-cifrao" width="${L}" height="${A}"/>
      <text x="${L / 2}" y="37" class="cifrao-vazio">$</text>
      <clipPath id="esc-${i}"><rect width="${(L * p).toFixed(2)}" height="${A}"/></clipPath>
      <text x="${L / 2}" y="37" class="cifrao-cheio cifrao-publico" clip-path="url(#esc-${i})">$</text></g>`).join('')}</svg>`;
  document.getElementById('valor-escolha').innerHTML = `<b>${String(m / 2).replace('.', ',')}</b> ${m === 2 ? 'cifrão' : 'cifrões'}: ${rotuloEscolha(m)}`;
}

function meiosDoPonteiro(e) {
  const g = e.target.closest('[data-i]');
  if (!g) return null;
  const r = g.getBoundingClientRect();
  return meiosDoClique(Number(g.dataset.i), (e.clientX - r.left) / r.width);
}

function escolhe(m) {
  meios = Math.max(0, Math.min(20, m));
  caixaCifroes.setAttribute('aria-valuenow', String(meios * 5));
  caixaCifroes.setAttribute('aria-valuetext', rotuloEscolha(meios));
  pintaCifroes(meios);
  if (estado) desenhaResultado();
}

caixaCifroes.addEventListener('pointermove', e => { const m = meiosDoPonteiro(e); if (m != null) pintaCifroes(m); });
caixaCifroes.addEventListener('pointerleave', () => pintaCifroes(meios));
caixaCifroes.addEventListener('click', e => {
  const m = meiosDoPonteiro(e);
  // clicar de novo no mesmo meio cifrão esvazia ele
  if (m != null) escolhe(m === meios ? m - 1 : m);
});
caixaCifroes.addEventListener('keydown', e => {
  const passo = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
  if (passo) { e.preventDefault(); escolhe(meios + passo); }
  if (e.key === 'Home') { e.preventDefault(); escolhe(0); }
  if (e.key === 'End') { e.preventDefault(); escolhe(20); }
});

const cartaoTaxa = (titulo, x, destaque) => `<div class="p8-taxa${destaque ? ' p8-taxa-escolhida' : ''}">
    <span class="p8-taxa-titulo">${titulo}</span>
    <strong>${x.taxa == null ? '—' : formata.pct(x.taxa)}</strong>
    <span class="apoio">${x.candidatos ? `${formata.numero(x.eleitos)} ${x.eleitos === 1 ? 'eleito' : 'eleitos'} de ${formata.numero(x.candidatos)} candidatos` : 'nenhum candidato'}</span>
  </div>`;

function desenhaResultado() {
  const { fatias, cands, r } = estado;
  const caixa = document.getElementById('resultado-cifroes');
  if (!fatias.length) {
    caixa.innerHTML = `<p class="aviso-vazio">Não há candidatos a ${minusculo(r.cargo)} com receita declarada ${em(estado.nome)} em ${r.ano}.</p>`;
    document.getElementById('curva').innerHTML = document.getElementById('eleitos-cifroes').innerHTML = '';
    return;
  }
  const { com, sem } = comPeloMenos(fatias, meios);
  const todos = comPeloMenos(fatias, 0).com;
  const pct = meios * 5;
  const frase = meios === 0 || !sem.candidatos || !com.candidatos ? ''
    : com.taxa > sem.taxa * 1.15 ? `Quem tinha ${aPartirDe(pct)} de dinheiro público se elegeu <strong>mais</strong> que os outros.`
    : com.taxa < sem.taxa / 1.15 ? `Quem tinha ${aPartirDe(pct)} de dinheiro público se elegeu <strong>menos</strong> que os outros.`
    : `Quem tinha ${aPartirDe(pct)} de dinheiro público se elegeu <strong>quase tanto quanto</strong> os outros.`;
  caixa.innerHTML = `<div class="p8-taxas">
      ${cartaoTaxa(meios === 0 ? 'Todos os candidatos' : `Com ${aPartirDe(pct)} público`, com, true)}
      ${meios === 0 ? '' : cartaoTaxa(`Com menos de ${pct}%`, sem, false)}
      ${meios === 0 ? '' : cartaoTaxa('Todos os candidatos', todos, false)}
    </div>${frase ? `<p class="p8-frase">${frase}</p>` : ''}`;

  // a curva: a taxa de quem tem pelo menos cada parcela, de 0% a 100%, com a escolha marcada
  const pontos = d3.range(0, 21).map(k => ({ k, pct: k * 5, ...comPeloMenos(fatias, k).com })).filter(p => p.candidatos);
  const curva = document.getElementById('curva');
  const largura = Math.min(760, curva.clientWidth || 700);
  curva.replaceChildren(Plot.plot({
    width: largura, height: 240, marginLeft: 48, marginBottom: 40,
    style: { fontFamily: 'Archivo, sans-serif', fontSize: '12px', background: 'transparent' },
    x: { domain: [0, 100], label: 'pelo menos esta parcela de dinheiro público (%) →', ticks: d3.range(0, 101, 10) },
    y: { label: '↑ taxa de vitória (%)', grid: true, zero: true, nice: true },
    marks: [
      Plot.ruleY([todos.taxa], { stroke: COR.tecla, strokeDasharray: '4,3' }),
      Plot.line(pontos, { x: 'pct', y: 'taxa', stroke: PUBLICO, strokeWidth: 2.5 }),
      Plot.dot(pontos, { x: 'pct', y: 'taxa', r: p => (p.k === meios ? 7 : 3.5), fill: p => (p.k === meios ? COR.vitoria : PUBLICO),
                         stroke: COR.tecla, strokeWidth: p => (p.k === meios ? 2 : 0.8),
                         title: p => `${p.pct}% ou mais público: ${formata.pct(p.taxa)} (${formata.numero(p.eleitos)} de ${formata.numero(p.candidatos)})` }),
      Plot.text([todos.taxa], { x: 100, y: d => d, text: d => `todos: ${formata.pct(d)}`, textAnchor: 'end', dy: -8, fill: COR.tecla, fontWeight: 700 }),
    ],
  }));
  curva.insertAdjacentHTML('afterbegin', '<p class="p8-curva-titulo">A taxa de vitória para cada ponto dos cifrões</p>');

  // os eleitos com pelo menos a parcela escolhida, quando há a lista de candidatos
  const eleitos = cands.filter(c => c.eleito && parcela(c) != null && parcela(c) >= pct).sort((a, b) => (b.votos ?? 0) - (a.votos ?? 0));
  document.getElementById('eleitos-cifroes').innerHTML = !cands.length ? '' : eleitos.length
    ? `<h3>Quem se elegeu com ${aPartirDe(pct)} de dinheiro público <span class="apoio">(${formata.numero(eleitos.length)})</span></h3>
      <ul class="eleitos-cifroes">${eleitos.slice(0, 12).map(c => `<li>${c.nomeado ? fotoCandidato(c.foto, 'torneira-foto') : ''}
        <span>${c.pid ? `<a href="pergunta-10.html#${c.pid}">${c.nome}</a>` : nomeDe(c)} <span class="apoio">${c.sigla}</span>
        <small>${formata.pct(parcela(c))} público · ${c.votos > 0 ? `${formata.numero(c.votos)} votos` : 'sem votos'}</small></span></li>`).join('')}</ul>
      ${eleitos.length > 12 ? `<p class="apoio">E mais ${formata.numero(eleitos.length - 12)}, com menos votos.</p>` : ''}`
    : `<p class="apoio">Ninguém se elegeu com ${aPartirDe(pct)} de dinheiro público neste recorte.</p>`;
}

function desenhaTorneiras(lista, cands) {
  const maiores = cands.filter(c => c.receita > 0).sort((a, b) => b.receita - a.receita).slice(0, 30);
  if (!maiores.length) { lista.innerHTML = '<li class="aviso-vazio">Nenhum candidato com receita declarada neste recorte.</li>'; return; }
  const maior = maiores[0].receita;
  lista.innerHTML = maiores.map(c => {
    const pub = parcela(c);
    return `<li class="torneira">
      <span class="torneira-quem">${c.nomeado ? fotoCandidato(c.foto, 'torneira-foto') : '<span class="torneira-foto anonima" aria-hidden="true"></span>'}
        <span>${c.pid ? `<a href="pergunta-10.html#${c.pid}">${c.nome}</a>` : nomeDe(c)}
          <span class="apoio">${c.sigla}</span>${c.eleito ? ' <span class="selo selo-vitoria">eleito</span>' : ''}</span></span>
      <span class="torneira-cano">${BICA}<span class="torneira-agua" style="width:${(100 * c.receita) / maior}%"
          role="img" aria-label="${formata.real(c.receita)} de receita, ${formata.pct(pub)} pública">
        <i style="flex-basis:${pub}%;background:${PUBLICO}"></i><i style="flex:1;background:${PRIVADO}"></i></span></span>
      <span class="torneira-n"><b>${formata.real(c.receita)}</b>
        <small>${formata.pct(pub)} público · ${c.votos > 0 ? `${formata.numero(c.votos)} votos` : 'sem votos'}</small></span>
    </li>`;
  }).join('');
  escorre('.torneira-agua', lista);
}

/** Os partidos, cada um uma torneira: a receita média dividida pela parcela pública média dos candidatos,
 *  ao lado da taxa de vitória do partido. */
function porPartido(cands, lista) {
  const grupos = d3.groups(cands, c => c.sigla).map(([sigla, cs]) => {
    const comReceita = cs.filter(c => c.receita > 0);
    const eleitos = cs.filter(c => c.eleito).length;
    return {
      sigla, candidatos: cs.length, eleitos, taxa: (100 * eleitos) / cs.length,
      parcela: comReceita.length ? d3.mean(comReceita, parcela) : null,
      publico: d3.sum(cs, c => c.receita_publica ?? 0),
    };
  }).filter(p => p.parcela != null).sort((a, b) => b.parcela - a.parcela || b.taxa - a.taxa);
  if (!grupos.length) { lista.innerHTML = '<li class="aviso-vazio">Nenhum partido com receita declarada neste recorte.</li>'; return; }
  const tetoTaxa = Math.max(...grupos.map(p => p.taxa), 1);
  lista.innerHTML = grupos.map(p => `<li class="torneira-partido">
      <span class="tp-sigla"><b>${p.sigla}</b> <span class="apoio">${formata.numero(p.candidatos)} cand.</span></span>
      <span class="torneira-cano">${BICA}<span class="torneira-agua" style="width:100%" role="img" aria-label="${formata.pct(p.parcela)} da receita vinda de dinheiro público, em média">
        <i style="flex-basis:${p.parcela}%;background:${PUBLICO}"></i><i style="flex:1;background:${PRIVADO}"></i></span></span>
      <span class="tp-pub"><b>${formata.pct(p.parcela)}</b> <small>${formata.real(p.publico)} públicos</small></span>
      <span class="tp-taxa"><span class="tp-taxa-barra"><i style="width:${(100 * p.taxa) / tetoTaxa}%"></i></span>
        <b>${formata.pct(p.taxa)}</b> <small>${formata.numero(p.eleitos)} ${p.eleitos === 1 ? 'eleito' : 'eleitos'}</small></span>
    </li>`).join('');
  escorre('.torneira-agua', lista);
}

function porPolitico(lista, cands) {
  const top = cands.filter(c => c.receita_publica > 0).sort((a, b) => b.receita_publica - a.receita_publica).slice(0, 10);
  if (!top.length) { lista.innerHTML = '<li class="aviso-vazio">Nenhum candidato com dinheiro público neste recorte.</li>'; return; }
  lista.innerHTML = top.map((c, i) => {
    const porVoto = custoPorVoto(c.receita_publica, c.votos);
    return `<li class="politico-publico">
      <span class="posicao">${i + 1}º</span>
      ${c.nomeado ? fotoCandidato(c.foto, 'torneira-foto') : '<span class="torneira-foto anonima" aria-hidden="true"></span>'}
      <span class="politico-publico-nome">${c.pid ? `<a href="pergunta-10.html#${c.pid}">${c.nome}</a>` : nomeDe(c)}
        <span class="apoio">${c.sigla}</span> <span class="selo ${c.eleito ? 'selo-vitoria' : 'selo-derrota'}">${c.eleito ? 'eleito' : '× não eleito'}</span></span>
      <span class="politico-publico-n"><b>${formata.real(c.receita_publica)}</b> públicos · ${c.votos > 0 ? `${formata.numero(c.votos)} votos` : 'sem votos'}
        <strong class="por-voto">${porVoto == null ? 'sem votos para dividir' : `${formata.porVoto(porVoto)} de dinheiro público por voto`}</strong></span>
    </li>`;
  }).join('');
}

escolhe(meios);

const SEM_LISTA = 'A lista de candidatos existe por estado (cargos estaduais e federais), por município (prefeito e vereador) e para presidente. Escolha um desses recortes para ver cada candidato.';

let pedido = 0;
async function atualiza(r) {
  const meu = ++pedido;
  const [nome, fatias, todos] = await Promise.all([nomeLugar(r), fatiasDoRecorte(r), leCandidaturas(ueDoRecorte(r), r.ano)]);
  if (meu !== pedido) return;
  const cands = todos.filter(c => c.cargo === r.cargo);
  document.getElementById('t-faixas').innerHTML = `<span class="sobre">${minusculo(r.cargo)} · ${nome} · ${r.ano}</span>
    Preencha os cifrões: quanto da campanha veio de dinheiro público?`;
  estado = { fatias, cands, nome, r };
  desenhaResultado();
  const vazio = `<p class="aviso-vazio">${SEM_LISTA}</p>`;
  if (!cands.length) {
    for (const id of ['torneiras', 'politicos', 'partidos']) document.getElementById(id).innerHTML = `<li>${vazio}</li>`;
  } else {
    desenhaTorneiras(document.getElementById('torneiras'), cands);
    porPartido(cands, document.getElementById('partidos'));
    porPolitico(document.getElementById('politicos'), cands);
  }
  primeiraPintura = false;
}

// ---------------------------------------------------------------- o retrato para o oráculo

/** O que a página mostra agora: a parcela de dinheiro público escolhida nos cifrões, a taxa de vitória de quem tem
 *  pelo menos isso e de quem tem menos, a curva de 10 em 10%, os partidos e quem mais recebeu dinheiro público. */
registraRetrato(() => {
  if (!estado) return null;
  const { fatias, cands, nome, r } = estado;
  const taxaTxt = g => (g.candidatos ? `${formata.pct(g.taxa)} se elegeram (${formata.numero(g.eleitos)} de ${formata.numero(g.candidatos)})` : 'ninguém');
  const { com, sem } = comPeloMenos(fatias, meios);
  const comReceita = cands.filter(c => c.receita > 0);
  const partidos = d3.groups(comReceita, c => c.sigla).map(([sigla, cs]) => {
    const todos = cands.filter(c => c.sigla === sigla);
    return { sigla, parcela: d3.mean(cs, parcela), candidatos: todos.length, eleitos: todos.filter(c => c.eleito).length };
  }).sort((a, b) => b.parcela - a.parcela);
  const maiores = [...cands].filter(c => c.receita_publica > 0).sort((a, b) => b.receita_publica - a.receita_publica).slice(0, 10);
  // dinheiro público ÷ votos, como nas torneiras dos políticos: de todos os candidatos juntos e só dos eleitos
  const porVotoDe = cs => custoPorVoto(d3.sum(cs, c => c.receita_publica ?? 0), d3.sum(cs, c => c.votos ?? 0));
  const porVotoTxt = v => (v == null ? null : `${formata.porVoto(v)} de dinheiro público por voto`);
  return {
    numero: 8, pergunta: 'Dinheiro público elege?',
    recorte: `${minusculo(r.cargo)} · ${nome} · ${r.ano}`,
    secoes: [
      { titulo: `A escolha do leitor nos cifrões: pelo menos ${meios * 5}% da receita vinda de dinheiro público (fundo eleitoral e partidário)`,
        linhas: fatias.length ? [
          [meios === 0 ? 'Todos os candidatos' : `Com pelo menos ${meios * 5}%`, taxaTxt(com)],
          ...(meios === 0 ? [] : [[`Com menos de ${meios * 5}%`, taxaTxt(sem)], ['Todos os candidatos', taxaTxt(comPeloMenos(fatias, 0).com)]]),
        ] : [[null, 'Não há candidatos com receita declarada neste recorte.']] },
      { titulo: 'Comparações prontas (calculadas pela página)', linhas: meios === 0 ? [] : [
        [`Taxa de quem tem pelo menos ${meios * 5}% (${com.candidatos ? formata.pct(com.taxa) : '—'}) em relação à de quem tem menos (${sem.candidatos ? formata.pct(sem.taxa) : '—'})`,
          com.candidatos && sem.candidatos ? comparacao(com.taxa, sem.taxa) : null],
      ] },
      { titulo: 'Taxa de vitória de quem tem pelo menos cada parcela de dinheiro público',
        linhas: d3.range(0, 21, 2).map(k => [`${k * 5}% ou mais`, taxaTxt(comPeloMenos(fatias, k).com)]) },
      { titulo: 'Partidos: parcela média de dinheiro público na receita dos candidatos e taxa de vitória',
        linhas: partidos.slice(0, 15).map(p => [null, `${p.sigla}: ${formata.pct(p.parcela)} público em média, ${formata.numero(p.eleitos)} eleitos de ${formata.numero(p.candidatos)}`]) },
      { titulo: 'Quanto custou cada voto pago com dinheiro público (dinheiro público recebido ÷ votos no 1º turno)', linhas: [
        ['Todos os candidatos juntos', porVotoTxt(porVotoDe(cands))],
        ['Só os eleitos', porVotoTxt(porVotoDe(cands.filter(c => c.eleito)))],
      ] },
      { titulo: 'Quem mais recebeu dinheiro público', linhas: maiores.map(c => [null,
        `${nomeDe(c)} (${c.sigla}): ${formata.real(c.receita_publica)} públicos, ${formata.pct(parcela(c))} da receita, ${c.votos > 0 ? `${formata.numero(c.votos)} votos` : 'sem votos'}`
        + `${custoPorVoto(c.receita_publica, c.votos) == null ? '' : `, ${porVotoTxt(custoPorVoto(c.receita_publica, c.votos))}`}, ${c.eleito ? 'eleito' : 'não eleito'}`]) },
    ],
  };
});

montaSeletor(document.getElementById('recorte'), {
  anos: brasil.anos, comLugar: true, padrao: { ano: 2022, cargo: 'DEPUTADO FEDERAL', uf: 'MG' }, aoMudar: atualiza,
  municipioObrigatorio: true,
  aviso: AVISO_CONTAS_2026,
});
