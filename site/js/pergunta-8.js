// Pergunta 8: dinheiro público elege? Os candidatos em colunas pela parcela de dinheiro público na receita, de 10 em
// 10%: quantos estão em cada faixa, quantos dela se elegeram e a taxa de vitória; cada candidato como uma torneira (a
// receita dividida em pública e privada); os partidos pela dependência média e pela taxa de vitória; e os que mais
// receberam, com o custo de cada voto pago com dinheiro público.
//
// Dados: dependencia/BR.json e dependencia/municipios/UF.json (candidatos e eleitos por meio cifrão, isto é, por
// fatia de 5% de dinheiro público); mapa/ (anos e nomes dos municípios);
// candidaturas/<ue>-<ano>.json (cada candidato, com receita, receita pública e votos).
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { comparacao } from './lib/retrato.js?v=20261161';
import { montaPagina, carregaDados, formata, fotoCandidato, NOME_UF, em, registraRetrato } from './comum.js?v=20261161';
import { custoPorVoto } from './lib/dinheiro.js?v=20261161';
import { porFaixa, faixaDaParcela } from './lib/cifroes.js?v=20261161';
import { ueDoRecorte, MUNICIPAIS } from './lib/recorte.js?v=20261161';
import { montaSeletor, leCandidaturas, nomeDe, AVISO_CONTAS_2026 } from './pecas.js?v=20261161';

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

// ---------------------------------------------------------------- as colunas por faixa de dinheiro público

let faixa = null;               // a coluna escolhida (0 a 10); null: a de mais eleitos
let estado = null;              // { fatias, cands, nome, r } do recorte desenhado
let pidDoLink = null;           // o candidato pedido no endereço (pid, de um link da cabine): marcado uma vez, na chegada
const nomeFaixa = f => (f.faixa === 10 ? '100% público' : f.faixa === 9 ? '90% a menos de 100%' : `${f.de}% a ${f.ate}%`);
const rotuloX = f => (f.faixa === 10 ? '100%' : f.faixa === 9 ? '90–99' : `${f.de}–${f.ate}`);
// a taxa sobre a coluna, sem casa decimal para caber no celular (a exata está na faixa escolhida e no rótulo acessível)
const taxaCurta = t => (t == null ? '' : t > 0 && t < 1 ? '<1%' : `${Math.round(t)}%`);
const eleitosTxt = n => `${formata.numero(n)} ${n === 1 ? 'eleito' : 'eleitos'}`;

function desenhaColunas() {
  const { fatias, cands, r } = estado;
  const caixa = document.getElementById('colunas-faixas'), frase = document.getElementById('frase-faixas');
  if (!fatias.length) {
    caixa.innerHTML = `<p class="aviso-vazio">Não há candidatos a ${minusculo(r.cargo)} com receita declarada ${em(estado.nome)} em ${r.ano}.</p>`;
    frase.innerHTML = document.getElementById('eleitos-faixa').innerHTML = '';
    return;
  }
  const fs = porFaixa(fatias);
  const candidatos = d3.sum(fs, f => f.candidatos), eleitos = d3.sum(fs, f => f.eleitos);
  const maisEleitos = fs.reduce((a, b) => (b.eleitos > a.eleitos ? b : a));
  if (faixa == null || !fs[faixa].candidatos) faixa = maisEleitos.candidatos ? maisEleitos.faixa : fs.find(f => f.candidatos).faixa;
  const teto = Math.max(...fs.map(f => f.candidatos));
  caixa.innerHTML = fs.map(f => {
    const altura = (100 * f.candidatos) / teto;
    // o verde é a parte eleita da coluna; com poucos eleitos, ao menos um fio, para não sumir
    const verde = f.eleitos ? Math.max((100 * f.eleitos) / f.candidatos, 2) : 0;
    return `<button type="button" class="p8-coluna${f.faixa === 10 ? ' p8-coluna-toda' : ''}" data-faixa="${f.faixa}" aria-pressed="${f.faixa === faixa}"
        ${f.candidatos ? '' : 'disabled'} aria-label="${nomeFaixa(f)}: ${formata.numero(f.candidatos)} candidatos, ${eleitosTxt(f.eleitos)}${f.taxa == null ? '' : `, taxa de vitória de ${formata.pct(f.taxa)}`}">
      <span class="p8-coluna-poco"><span class="p8-coluna-barra" style="height:${altura}%"><i style="height:${verde}%"></i>
        <span class="p8-coluna-taxa">${taxaCurta(f.taxa)}</span></span></span>
      <span class="p8-coluna-x">${rotuloX(f)}</span>
    </button>`;
  }).join('');
  if (primeiraPintura && !reduz()) caixa.querySelectorAll('.p8-coluna-barra').forEach((el, i) =>
    el.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 700, delay: 40 * i, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' }));
  const toda = fs[10];
  const partes = [`Dos ${formata.numero(candidatos)} candidatos com receita, ${eleitosTxt(eleitos)} (${formata.pct((100 * eleitos) / candidatos)}).`];
  if (maisEleitos.eleitos) partes.push(`A faixa com mais eleitos é a de <strong>${nomeFaixa(maisEleitos)}</strong>: ${formata.numero(maisEleitos.eleitos)} dos ${formata.numero(eleitos)}, de ${formata.numero(maisEleitos.candidatos)} candidatos nela.`);
  if (toda.candidatos) partes.push(`<strong>${formata.pct((100 * toda.candidatos) / candidatos)} dos candidatos</strong> fizeram a campanha toda com dinheiro público, e ${toda.eleitos ? `${eleitosTxt(toda.eleitos)} (${formata.pct(toda.taxa)})` : '<strong>nenhum se elegeu</strong>'}.`);
  frase.innerHTML = partes.join(' ');
  desenhaEleitosDaFaixa(fs[faixa]);
}

document.getElementById('colunas-faixas').addEventListener('click', e => {
  const b = e.target.closest('[data-faixa]');
  if (!b || b.disabled) return;
  faixa = Number(b.dataset.faixa);
  document.querySelectorAll('#colunas-faixas [data-faixa]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  desenhaEleitosDaFaixa(porFaixa(estado.fatias)[faixa]);
});

/** Quem se elegeu na faixa escolhida, quando há a lista de candidatos do recorte. */
function desenhaEleitosDaFaixa(f) {
  const { cands } = estado;
  const caixa = document.getElementById('eleitos-faixa');
  const cabeca = `<h3>${nomeFaixa(f)} de dinheiro público <span class="apoio">${formata.numero(f.candidatos)} candidatos · ${eleitosTxt(f.eleitos)}${f.taxa == null ? '' : ` · ${formata.pct(f.taxa)} se elegeram`}</span></h3>`;
  if (!cands.length) { caixa.innerHTML = cabeca; return; }
  const eleitos = cands.filter(c => c.eleito && faixaDaParcela(parcela(c)) === f.faixa).sort((a, b) => (b.votos ?? 0) - (a.votos ?? 0));
  caixa.innerHTML = cabeca + (eleitos.length
    ? `<ul class="eleitos-cifroes">${eleitos.slice(0, 12).map(c => `<li>${c.nomeado ? fotoCandidato(c.foto, 'torneira-foto') : ''}
        <span>${c.pid ? `<a href="pergunta-10.html#${c.pid}">${c.nome}</a>` : nomeDe(c)} <span class="apoio">${c.sigla}</span>
        <small>${formata.pct(parcela(c))} público · ${c.votos > 0 ? `${formata.numero(c.votos)} votos` : 'sem votos'}</small></span></li>`).join('')}</ul>
      ${eleitos.length > 12 ? `<p class="apoio">E mais ${formata.numero(eleitos.length - 12)}, com menos votos.</p>` : ''}`
    : '<p class="apoio">Ninguém se elegeu nesta faixa.</p>');
}

function desenhaTorneiras(lista, cands, destaque = null) {
  const ordem = cands.filter(c => c.receita > 0).sort((a, b) => b.receita - a.receita);
  const maiores = ordem.slice(0, 30);
  // o candidato pedido no endereço entra no fim da lista, se não estiver entre as 30 maiores receitas
  if (destaque && ordem.includes(destaque) && !maiores.includes(destaque)) maiores.push(destaque);
  if (!maiores.length) { lista.innerHTML = '<li class="aviso-vazio">Nenhum candidato com receita declarada neste recorte.</li>'; return; }
  const maior = maiores[0].receita;
  lista.innerHTML = maiores.map(c => {
    const pub = parcela(c);
    return `<li class="torneira${c === destaque ? ' destacado' : ''}">
      <span class="torneira-quem">${c.nomeado ? fotoCandidato(c.foto, 'torneira-foto') : '<span class="torneira-foto anonima" aria-hidden="true"></span>'}
        <span>${c === destaque && !ordem.slice(0, 30).includes(c) ? `<span class="apoio">${ordem.indexOf(c) + 1}º</span> ` : ''}${c.pid ? `<a href="pergunta-10.html#${c.pid}">${c.nome}</a>` : nomeDe(c)}
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

const SEM_LISTA = 'A lista de candidatos existe por estado (cargos estaduais e federais), por município (prefeito e vereador) e para presidente. Escolha um desses recortes para ver cada candidato.';

let pedido = 0;
async function atualiza(r) {
  const meu = ++pedido;
  const [nome, fatias, todos] = await Promise.all([nomeLugar(r), fatiasDoRecorte(r), leCandidaturas(ueDoRecorte(r), r.ano)]);
  if (meu !== pedido) return;
  const cands = todos.filter(c => c.cargo === r.cargo);
  document.getElementById('t-faixas').innerHTML = `<span class="sobre">${minusculo(r.cargo)} · ${nome} · ${r.ano}</span>
    Onde estão os candidatos, e onde estão os eleitos?`;
  if (estado && (estado.r.ano !== r.ano || estado.r.cargo !== r.cargo)) faixa = null;
  estado = { fatias, cands, nome, r };
  desenhaColunas();
  const vazio = `<p class="aviso-vazio">${SEM_LISTA}</p>`;
  if (!cands.length) {
    for (const id of ['torneiras', 'politicos', 'partidos']) document.getElementById(id).innerHTML = `<li>${vazio}</li>`;
  } else {
    const doLink = pidDoLink ? cands.find(c => c.pid === pidDoLink) : null;
    pidDoLink = null;
    desenhaTorneiras(document.getElementById('torneiras'), cands, doLink);
    if (doLink) (document.querySelector('#torneiras .destacado') ?? document.getElementById('torneiras')).scrollIntoView({ block: 'center' });
    porPartido(cands, document.getElementById('partidos'));
    porPolitico(document.getElementById('politicos'), cands);
  }
  primeiraPintura = false;
}

// ---------------------------------------------------------------- o retrato para o oráculo

/** O que a página mostra agora: as colunas por faixa de dinheiro público (candidatos, eleitos e taxa de cada faixa), a
 *  faixa escolhida, os partidos e quem mais recebeu dinheiro público. */
registraRetrato(() => {
  if (!estado) return null;
  const { fatias, cands, nome, r } = estado;
  const fs = porFaixa(fatias);
  const candidatos = d3.sum(fs, f => f.candidatos), eleitos = d3.sum(fs, f => f.eleitos);
  const comReceita = cands.filter(c => c.receita > 0);
  const partidos = d3.groups(comReceita, c => c.sigla).map(([sigla, cs]) => {
    const todos = cands.filter(c => c.sigla === sigla);
    return { sigla, parcela: d3.mean(cs, parcela), candidatos: todos.length, eleitos: todos.filter(c => c.eleito).length };
  }).sort((a, b) => b.parcela - a.parcela);
  const maiores = [...cands].filter(c => c.receita_publica > 0).sort((a, b) => b.receita_publica - a.receita_publica).slice(0, 10);
  // dinheiro público ÷ votos, como nas torneiras dos políticos: de todos os candidatos juntos e só dos eleitos
  const porVotoDe = cs => custoPorVoto(d3.sum(cs, c => c.receita_publica ?? 0), d3.sum(cs, c => c.votos ?? 0));
  const porVotoTxt = v => (v == null ? null : `${formata.porVoto(v)} de dinheiro público por voto`);
  const pctDe = (n, total) => (total ? formata.pct((100 * n) / total) : '—');
  const escolhida = faixa == null ? null : fs[faixa];
  const eleitosEscolhida = escolhida && cands.length ? cands.filter(c => c.eleito && faixaDaParcela(parcela(c)) === escolhida.faixa) : [];
  return {
    numero: 8, pergunta: 'Dinheiro público elege?',
    recorte: `${minusculo(r.cargo)} · ${nome} · ${r.ano}`,
    secoes: [
      { titulo: 'Colunas por faixa de dinheiro público na receita (fundo eleitoral e partidário); cada faixa conta só quem está nela',
        linhas: fatias.length ? [
          ['Total', `${formata.numero(candidatos)} candidatos com receita, ${eleitosTxt(eleitos)} (${pctDe(eleitos, candidatos)})`],
          ...fs.filter(f => f.candidatos).map(f => [nomeFaixa(f),
            `${formata.numero(f.candidatos)} candidatos (${pctDe(f.candidatos, candidatos)} dos candidatos), ${eleitosTxt(f.eleitos)} (${pctDe(f.eleitos, eleitos)} dos eleitos), taxa de vitória ${formata.pct(f.taxa)}`]),
        ] : [[null, 'Não há candidatos com receita declarada neste recorte.']] },
      ...(escolhida ? [{ titulo: `Faixa escolhida pelo leitor: ${nomeFaixa(escolhida)}`, linhas: [
        ['Taxa da faixa em relação à de todos', comparacao(escolhida.taxa, candidatos ? (100 * eleitos) / candidatos : null)],
        ...eleitosEscolhida.sort((a, b) => (b.votos ?? 0) - (a.votos ?? 0)).slice(0, 12).map(c => [null, `${nomeDe(c)} (${c.sigla}): ${formata.pct(parcela(c))} público, ${c.votos > 0 ? `${formata.numero(c.votos)} votos` : 'sem votos'}`]),
      ] }] : []),
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

pidDoLink = Number(new URLSearchParams(location.hash.slice(1)).get('pid')) || null;
montaSeletor(document.getElementById('recorte'), {
  anos: brasil.anos, comLugar: true, padrao: { ano: 2022, cargo: 'DEPUTADO FEDERAL', uf: 'MG' }, aoMudar: atualiza,
  municipioObrigatorio: true,
  aviso: AVISO_CONTAS_2026,
});
