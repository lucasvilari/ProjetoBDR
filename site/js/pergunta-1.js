// Pergunta 1: quanto custa uma cadeira? O plenário do recorte (em 3D quando o aparelho permite), a
// multidão de quem tentou, as pilhas de moedas do gasto, e as cadeiras por partido e por político.
//
// Dados: mapa/brasil.json e mapa/municipios/UF.json (vagas, candidatos, eleitos e gastos);
// candidaturas/<ue>-<ano>.json (cada candidato); partidos-recorte/<BR ou UF>.json (cadeiras, gasto e votos
// dos eleitos por partido quando não há a lista de candidatos, como nos vereadores de um estado inteiro, e a
// nota de cada partido em cada ano, inclusive dos que já não existem).
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { montaPagina, carregaDados, formata, santinho, NOME_UF, em } from './comum.js?v=20261022';
import { corIdeologia, COR } from './lib/cores.js?v=20261022';
import { custoPorVoto } from './lib/dinheiro.js?v=20261022';
import { ueDoRecorte, MUNICIPAIS } from './lib/recorte.js?v=20261022';
import { assentos, ordenaPorLado, agrupa, bolinhasPorGrupo } from './lib/plenario.js?v=20261022';
import { montaSeletor, leCandidaturas, dispersaoDinheiroVotos, cartaoPolitico, UFS_PROJETO, nomeDe } from './pecas.js?v=20261022';
import { montaPlenario2D } from './plenario-2d.js?v=20261022';

montaPagina();

const MAX_BOLINHAS = 600;
const brasil = await carregaDados('mapa/brasil.json');
const { notas } = await carregaDados('partidos-recorte/BR.json');
const notaPorSigla = (sigla, ano) => notas[ano]?.[sigla] ?? null;
const registro = (campos, linha) => Object.fromEntries(campos.map((c, i) => [c, linha[i]]));
const plural = (n, um, varios) => `${formata.numero(n)} ${n === 1 ? um : varios}`;
const minusculo = c => c.toLowerCase();

let cena = null;                 // o plenário desenhado (3D ou 2D)
let modo = 'partido';            // o que o painel de detalhe mostra
let atual = null;                // { r, nome, custo, lista, cands, dados } do recorte desenhado
let escolhido = null;            // a cadeira escolhida: { assento, partido, candidato }
let partidoFixo = null;          // o partido escolhido (pela cadeira ou pela legenda), aceso no plenário

// ---------------------------------------------------------------- leitura do recorte

const territorio = r => (r.cargo === 'PRESIDENTE' ? 'BR' : MUNICIPAIS.includes(r.cargo) && r.mun ? r.mun : r.uf ?? 'BR');

async function nomeLugar(r) {
  const t = territorio(r);
  if (/^\d{5}$/.test(t)) return (await carregaDados(`mapa/municipios/${r.uf}.json`)).municipios[t]?.nome ?? t;
  return t === 'BR' ? 'Brasil' : NOME_UF[t];
}

/** Linhas de custo (vagas, candidatos, eleitos, gastos) do ano no território do recorte. */
async function custosDoAno(r) {
  const t = territorio(r);
  const dados = /^\d{5}$/.test(t) ? await carregaDados(`mapa/municipios/${r.uf}.json`) : brasil;
  return dados.custo.map(l => registro(brasil.campos_custo, l)).filter(x => x.ano === r.ano && x.territorio === t);
}

/** Eleitos por partido, da esquerda para a direita: [{sigla, nota, n, gasto, votos}], ou null sem eleitos. Com a
 *  lista de candidatos do recorte, conta os eleitos dela; sem ela (Brasil, ou cargo municipal no estado inteiro),
 *  usa os totais por partido de partidos-recorte/. gasto e votos são os dos eleitos do partido. */
async function partidosDoRecorte(r, cands) {
  const ano = r.ano;
  const doCargo = cands.filter(c => c.cargo === r.cargo && c.eleito);
  let lista;
  if (doCargo.length) {
    lista = d3.rollups(doCargo, v => ({ n: v.length, gasto: d3.sum(v, c => c.despesa ?? 0), votos: d3.sum(v, c => c.votos ?? 0) }), c => c.sigla)
      .map(([sigla, x]) => ({ sigla, ...x }));
  } else {
    const t = territorio(r);
    if (/^\d{5}$/.test(t)) return null;
    let dados;
    try { dados = await carregaDados(`partidos-recorte/${t}.json`); } catch { return null; }
    const ic = dados.cargos.indexOf(r.cargo);
    lista = dados.linhas.map(l => Object.fromEntries(dados.campos.map((c, i) => [c, l[i]])))
      .filter(l => l.ano === ano && l.cargo === ic && l.cadeiras > 0)
      .map(l => ({ sigla: dados.partidos[l.partido], n: l.cadeiras, gasto: l.gasto_eleitos, votos: l.votos_eleitos }));
  }
  if (!lista.length) return null;
  return ordenaPorLado(lista.map(p => ({ ...p, nota: notaPorSigla(p.sigla, ano), partido: p.sigla }))).map(({ partido, ...p }) => p);
}

/** Monta o que o plenário precisa: as cadeiras (ou bolinhas, quando são milhares), o partido de cada uma
 *  e, quando cada bolinha é uma cadeira e há a lista de candidatos, quem se sentou em cada uma. */
function dadosDoPlenario(total, lista, cands, custo, r) {
  const passo = agrupa(total, MAX_BOLINHAS);
  const bolinhas = Math.max(1, Math.round(total / passo));
  const geo = assentos(bolinhas);
  const grupos = lista ? [...lista.map(p => p.n), Math.max(0, total - d3.sum(lista, p => p.n))] : [total];
  const porGrupo = bolinhasPorGrupo(grupos, passo, bolinhas);
  const donos = lista ? porGrupo.flatMap((q, i) => Array(q).fill(i < lista.length ? i : null)) : Array(bolinhas).fill(null);
  let ocupantes = null;
  const eleitosDoCargo = cands.filter(c => c.cargo === r.cargo && c.eleito);
  if (passo === 1 && lista && eleitosDoCargo.length) {
    const fila = new Map(lista.map((p, i) => [i, eleitosDoCargo.filter(c => c.sigla === p.sigla).sort((a, b) => (b.votos ?? 0) - (a.votos ?? 0))]));
    ocupantes = donos.map(i => (i == null ? null : fila.get(i)?.shift() ?? null));
  }
  return {
    total, passo, geo, lista, donos, ocupantes,
    cores: lista ? lista.map(p => (p.nota == null ? COR.semDado : corIdeologia(p.nota))) : [],
    multidao: Math.max(0, (custo?.candidatos ?? 0) - (custo?.eleitos ?? 0)),
  };
}

// ---------------------------------------------------------------- o plenário

const CASA = {
  PRESIDENTE: () => 'Presidência da República',
  GOVERNADOR: br => (br ? 'Governos dos estados' : 'Governo do estado'),
  SENADOR: () => 'Senado: cadeiras em disputa',
  'DEPUTADO FEDERAL': br => (br ? 'Câmara dos Deputados' : 'Bancada na Câmara dos Deputados'),
  'DEPUTADO ESTADUAL': br => (br ? 'Assembleias legislativas' : 'Assembleia Legislativa'),
  'DEPUTADO DISTRITAL': () => 'Câmara Legislativa do Distrito Federal',
  PREFEITO: (br, mun) => (mun ? 'Prefeitura' : 'Prefeituras'),
  VEREADOR: (br, mun) => (mun ? 'Câmara Municipal' : 'Câmaras municipais'),
};

/** 3D só com WebGL, sem pedido de menos movimento e sem o leitor ter escolhido o 2D; o 2D tem as mesmas informações. */
let prefere2D = false;
try { prefere2D = sessionStorage.getItem('plenario-2d') === '1'; } catch { /* sem armazenamento */ }
function podeUsar3D() {
  if (prefere2D || matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  try { return Boolean(document.createElement('canvas').getContext('webgl2')); } catch { return false; }
}

const botaoVista = document.getElementById('vista');
function marcaVista(em3D) {
  botaoVista.hidden = !em3D && !prefere2D;
  botaoVista.textContent = em3D ? 'Ver em 2D' : 'Ver em 3D';
}
botaoVista.addEventListener('click', () => {
  prefere2D = !prefere2D;
  try { sessionStorage.setItem('plenario-2d', prefere2D ? '1' : '0'); } catch { /* sem armazenamento */ }
  if (atual?.dados) desenhaPlenario(atual.dados);
});

async function desenhaPlenario(dados) {
  cena?.destroi();
  const alvo = document.getElementById('plenario');
  marcaVista(false);
  if (podeUsar3D()) {
    try {
      const { montaPlenario3D } = await import('./plenario-3d.js?v=20261022');
      cena = montaPlenario3D(alvo, dados, aoEscolher);
      marcaVista(true);
      if (partidoFixo != null) cena.destaca(partidoFixo);
      return;
    } catch (erro) { console.warn('plenário 3D indisponível, usando o 2D', erro); }
  }
  cena = montaPlenario2D(alvo, dados, aoEscolher);
  if (partidoFixo != null) cena.destaca(partidoFixo);
}

function aoEscolher(escolha) {
  escolhido = escolha;
  if (escolha.candidato) { fixaPartido(null); mudaModo('politico'); return; }
  // sem saber quem se sentou ali (cada bolinha vale várias cadeiras, ou não há a lista), a cadeira mostra o partido
  if (escolha.partido != null) escolhePartido(escolha.partido);
}

/** Acende as cadeiras de um partido no plenário até outra escolha (ou null para apagar). */
function fixaPartido(i) {
  partidoFixo = i;
  cena?.destaca(i);
  document.querySelectorAll('#legenda-partidos [data-p]').forEach(li => li.classList.toggle('escolhido', Number(li.dataset.p) === i));
}

/** Escolhe um partido: acende as cadeiras dele, mostra a tabela por partido com a linha dele destacada e rola até ela. */
function escolhePartido(i) {
  fixaPartido(i);
  mudaModo('partido');
  const linha = document.querySelector(`#detalhe tr[data-p="${i}"]`);
  linha?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
}

async function desenhaTopo() {
  const { r, nome, custo, lista, dados } = atual;
  const mun = Boolean(r.mun && MUNICIPAIS.includes(r.cargo));
  document.getElementById('t-plenario').innerHTML = `<span class="sobre">${nome} · ${r.ano}</span>
    ${CASA[r.cargo]?.(territorio(r) === 'BR', mun) ?? minusculo(r.cargo)}`;
  const resumo = document.getElementById('resumo-plenario');
  const legenda = document.getElementById('legenda-partidos');
  const nota = document.getElementById('nota-plenario');
  if (!dados) {
    cena?.destroi(); cena = null;
    document.getElementById('plenario').innerHTML = `<p class="aviso-vazio">Não há eleição para ${minusculo(r.cargo)} ${em(nome)} em ${r.ano}.</p>`;
    resumo.innerHTML = legenda.innerHTML = nota.textContent = '';
    return;
  }
  await desenhaPlenario(dados);
  const tentaram = custo?.candidatos ?? 0;
  resumo.innerHTML = `<strong>${plural(tentaram, 'candidato tentou', 'candidatos tentaram')}</strong>
    ${dados.total === 1 ? 'a cadeira' : `as ${formata.numero(dados.total)} cadeiras`}; ${plural(custo?.eleitos ?? 0, 'conseguiu', 'conseguiram')}.
    ${lista ? `O maior partido é o <strong>${d3.greatest(lista, p => p.n).sigla}</strong>, com ${plural(d3.greatest(lista, p => p.n).n, 'cadeira', 'cadeiras')}.` : ''}`;
  legenda.innerHTML = lista ? lista.map((p, i) => `<li data-p="${i}" tabindex="0"><i style="background:${dados.cores[i]}"></i>
    <span class="sigla">${p.sigla}</span><b>${formata.numero(p.n)}</b></li>`).join('') : '';
  nota.textContent = [
    dados.passo > 1 ? `Com ${formata.numero(dados.total)} cadeiras, cada uma desenhada vale cerca de ${dados.passo}.${MUNICIPAIS.includes(r.cargo) && UFS_PROJETO.includes(r.uf) ? ' Escolha um município para ver cadeira por cadeira.' : ''}` : '',
    lista ? 'Partidos da esquerda para a direita pela nota dos especialistas, com a cor do vermelho (esquerda) ao azul (direita); sem nota, em cinza.' : 'A divisão por partido não está disponível para este recorte.',
    dados.multidao > 2400 ? `A multidão mostra 2.400 dos ${formata.numero(dados.multidao)} que não se elegeram.` : '',
    // vagas sem eleito no TSE (eleição anulada ou refeita depois, por exemplo) ficam nas cadeiras sem cor
    lista && dados.total > d3.sum(lista, p => p.n) ? `${plural(dados.total - d3.sum(lista, p => p.n), 'vaga ficou', 'vagas ficaram')} sem eleito registrado pelo TSE (em geral, eleição anulada ou refeita depois) e ${dados.total - d3.sum(lista, p => p.n) === 1 ? 'aparece' : 'aparecem'} sem cor.` : '',
  ].filter(Boolean).join(' ');
}

for (const id of ['legenda-partidos']) {
  const el = document.getElementById(id);
  el.addEventListener('pointerover', e => { const p = e.target.closest('[data-p]')?.dataset.p; cena?.destaca(p ? Number(p) : null); });
  el.addEventListener('pointerleave', () => cena?.destaca(partidoFixo));
  el.addEventListener('focusin', e => { const p = e.target.closest('[data-p]')?.dataset.p; if (p) cena?.destaca(Number(p)); });
  el.addEventListener('focusout', () => cena?.destaca(partidoFixo));
  el.addEventListener('click', e => { const p = e.target.closest('[data-p]')?.dataset.p; if (p) escolhePartido(Number(p)); });
  el.addEventListener('keydown', e => {
    const p = e.target.closest('[data-p]')?.dataset.p;
    if (p && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); escolhePartido(Number(p)); }
  });
}

// ---------------------------------------------------------------- santinho e moedas

const custoMedio = c => (c?.eleitos ? c.gasto_eleitos / c.eleitos : null);

function desenhaSantinho() {
  const { r, nome, custo } = atual;
  const faixa = `${minusculo(r.cargo)} · ${r.ano}`;
  const caixa = document.getElementById('santinho');
  if (custoMedio(custo) == null) {
    caixa.innerHTML = santinho({ faixa, nome, numero: '—', rotulo: 'Sem dado de gasto para este recorte.', classe: 'santinho-neutro' });
    return;
  }
  const um = custo.eleitos === 1;
  caixa.innerHTML = santinho({
    faixa, nome, numero: formata.real(custoMedio(custo)),
    rotulo: um ? 'gastou a campanha de quem se elegeu.' : `gastou, em média, cada um dos ${formata.numero(custo.eleitos)} eleitos.`,
    linhas: [
      ['Candidatos por vaga', custo.vagas ? formata.numero(Math.round(10 * custo.candidatos / custo.vagas) / 10) : '—'],
      ['Vagas', formata.numero(custo.vagas ?? 0)],
    ],
    verso: `<p>O número grande soma as despesas ${um ? 'da campanha vencedora' : `dos ${formata.numero(custo.eleitos)} eleitos e divide por ${formata.numero(custo.eleitos)}`}:
      quanto custou, para quem venceu, chegar à cadeira.</p>
      <p>Candidatos por vaga: os ${formata.numero(custo.candidatos)} candidatos divididos pelas ${formata.numero(custo.vagas ?? 0)} vagas.</p>
      <p>Despesas contratadas pelas campanhas, em reais de cada ano, sem correção pela inflação.</p>`,
    fonte: 'p01_custo_cadeira.sql',
  });
}

/** Duas pilhas de moedas: o gasto de todos os candidatos e o gasto só dos eleitos, na mesma escala. */
function desenhaMoedas() {
  const { custo } = atual;
  const fig = document.getElementById('moedas');
  if (!custo?.gasto) { fig.innerHTML = ''; return; }
  const pilhas = [['todos os candidatos', custo.gasto, '#cbbd9d'], ['só os eleitos', custo.gasto_eleitos ?? 0, COR.vitoria]];
  const MAX = 16;
  const moedas = v => Math.max(v > 0 ? 1 : 0, Math.round((MAX * v) / custo.gasto));
  const L = 260, A = 40 + MAX * 9;
  const pilha = ([rotulo, valor, cor], i) => {
    const cx = 70 + i * 120;
    const discos = d3.range(moedas(valor)).map(k => `<ellipse cx="${cx}" cy="${A - 24 - k * 9}" rx="34" ry="9" fill="${cor}" stroke="#22201c" stroke-width="1.5"/>`).join('');
    return `${discos}<text x="${cx}" y="${A - 4}" text-anchor="middle" class="moedas-rotulo">${rotulo}</text>`;
  };
  fig.innerHTML = `<svg viewBox="0 0 ${L} ${A}" role="img" aria-label="Gasto de todos os candidatos: ${formata.real(custo.gasto)}; dos eleitos: ${formata.real(custo.gasto_eleitos ?? 0)}">
      ${pilhas.map(pilha).join('')}</svg>
    <figcaption><span><b>${formata.real(custo.gasto)}</b> gastos por todos os candidatos</span>
      <span><b>${formata.real(custo.gasto_eleitos ?? 0)}</b> gastos pelos eleitos (${formata.pct(100 * (custo.gasto_eleitos ?? 0) / custo.gasto)})</span></figcaption>`;
}

// ---------------------------------------------------------------- por partido / por político

const temLista = () => Boolean(atual?.cands.some(c => c.cargo === atual.r.cargo));
function mudaModo(novo) {
  modo = novo === 'politico' && !temLista() ? 'partido' : novo;
  document.querySelectorAll('.alternador [data-modo]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.modo === modo)));
  desenhaDetalhe();
}
document.querySelector('.alternador').addEventListener('click', e => {
  const b = e.target.closest('[data-modo]');
  if (b && b.getAttribute('aria-disabled') !== 'true') mudaModo(b.dataset.modo);
});

function tabelaPartidos() {
  const { lista } = atual;
  if (!lista) return '<p class="aviso-vazio">Ninguém se elegeu neste recorte.</p>';
  const linhas = lista.map((p, i) => ({ ...p, i })).sort((a, b) => b.n - a.n);
  const fixo = partidoFixo == null ? null : lista[partidoFixo];
  return `${fixo ? `<p class="partido-escolhido">Destacado no plenário: <b>${fixo.sigla}</b>, ${plural(fixo.n, 'cadeira', 'cadeiras')}.
      <button type="button" class="botao" id="limpa-partido">Limpar</button></p>` : ''}
  <div class="rolagem"><table class="tabela">
    <thead><tr><th>Partido</th><th class="num">Cadeiras</th><th class="num">Gasto dos eleitos</th><th class="num">Custo por cadeira</th><th class="num">Custo por voto</th></tr></thead>
    <tbody>${linhas.map(p => `<tr data-p="${p.i}"${p.i === partidoFixo ? ' class="atual"' : ''}><td>${p.sigla}</td><td class="num">${formata.numero(p.n)}</td>
      <td class="num">${formata.real(p.gasto)}</td>
      <td class="num">${formata.real(p.gasto / p.n)}</td>
      <td class="num">${custoPorVoto(p.gasto, p.votos) == null ? '—' : formata.porVoto(custoPorVoto(p.gasto, p.votos))}</td></tr>`).join('')}</tbody>
  </table></div>
  <p class="apoio">Custo por cadeira: o que os eleitos do partido gastaram, dividido pelas cadeiras que ganharam. Custo por voto: o mesmo gasto dividido pelos votos que esses eleitos tiveram no 1º turno.</p>`;
}

function desenhaDetalhe() {
  const caixa = document.getElementById('detalhe');
  if (!atual) return;
  const botao = document.querySelector('.alternador [data-modo="politico"]');
  const lista = temLista();
  botao.setAttribute('aria-disabled', String(!lista));
  document.getElementById('sem-lista').hidden = lista;
  if (!lista && modo === 'politico') { mudaModo('partido'); return; }
  if (modo === 'partido') {
    caixa.innerHTML = tabelaPartidos();
    caixa.querySelector('#limpa-partido')?.addEventListener('click', () => { fixaPartido(null); desenhaDetalhe(); });
    return;
  }
  const { cands, r, dados } = atual;
  const doCargo = cands.filter(c => c.cargo === r.cargo);
  const eleitos = doCargo.filter(c => c.eleito).sort((a, b) => (b.votos ?? 0) - (a.votos ?? 0));
  const quem = escolhido?.candidato ?? null;
  caixa.innerHTML = `<div class="p1-politico">
      <div class="p1-cartao">${quem ? cartaoPolitico(quem)
        : `<p class="apoio">${dados?.ocupantes ? 'Clique numa cadeira do plenário, ou escolha um eleito na lista, para ver quem se sentou nela.' : 'Escolha um eleito na lista para ver o cartão dele.'}</p>`}
        <label class="campo campo-largo">Eleito <select id="escolhe-eleito"><option value="">escolher…</option>
          ${eleitos.map((c, i) => `<option value="${i}"${c === quem ? ' selected' : ''}>${nomeDe(c)} (${c.sigla})</option>`).join('')}</select></label>
      </div>
      <div class="p1-dispersao"><h3>Gasto e votos de todos os ${formata.numero(doCargo.length)} candidatos</h3></div>
    </div>`;
  caixa.querySelector('.p1-dispersao').append(dispersaoDinheiroVotos(doCargo, { campo: 'despesa', largura: Math.min(640, caixa.clientWidth || 600) }));
  caixa.querySelector('#escolhe-eleito').addEventListener('change', e => {
    const c = eleitos[Number(e.target.value)];
    if (!c) return;
    const k = dados?.ocupantes?.indexOf(c) ?? -1;
    if (k >= 0 && cena?.escolhe) cena.escolhe(k);
    else { escolhido = { assento: null, partido: null, candidato: c }; desenhaDetalhe(); }
  });
}

// ---------------------------------------------------------------- ciclo

let pedido = 0;
async function atualiza(r) {
  const meu = ++pedido;
  const [nome, doAno, cands] = await Promise.all([nomeLugar(r), custosDoAno(r), leCandidaturas(ueDoRecorte(r), r.ano)]);
  const custo = doAno.find(x => brasil.cargos[x.cargo] === r.cargo);
  const lista = await partidosDoRecorte(r, cands);
  if (meu !== pedido) return;                    // o leitor já mudou de recorte
  const ocupadas = lista ? d3.sum(lista, p => p.n) : 0;
  const total = Math.max(ocupadas, custo?.vagas ?? 0) || custo?.eleitos || 0;
  atual = { r, nome, custo, lista, cands, dados: total ? dadosDoPlenario(total, lista, cands, custo, r) : null };
  escolhido = null;
  partidoFixo = null;
  await desenhaTopo();
  desenhaSantinho();
  desenhaMoedas();
  desenhaDetalhe();
}

montaSeletor(document.getElementById('recorte'), {
  anos: brasil.anos, comLugar: true, padrao: { ano: 2022, cargo: 'DEPUTADO FEDERAL', uf: 'MG' }, aoMudar: atualiza,
});
