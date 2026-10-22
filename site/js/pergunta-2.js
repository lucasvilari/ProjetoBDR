// Pergunta 2: patrimônio ajuda a eleger? Um prédio em que cada andar é uma faixa de patrimônio (do térreo, sem bens,
// à cobertura, acima de R$ 5 milhões), cada janela um candidato e cada janela acesa um eleito. Passar o mouse numa
// janela mostra o candidato, com patrimônio e votos; clicar num andar lista os maiores patrimônios dele.
//
// Dados: mapa/brasil.json e mapa/municipios/UF.json (candidatos e eleitos por faixa, para todo recorte);
// candidaturas/<ue>-<ano>.json (cada candidato, com patrimônio e votos, quando o recorte tem a lista).
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { montaPagina, carregaDados, formata, fotoCandidato, NOME_UF, em } from './comum.js?v=20261107';
import { ueDoRecorte, MUNICIPAIS } from './lib/recorte.js?v=20261107';
import { faixaDePatrimonio } from './lib/cifroes.js?v=20261107';
import { agrupa } from './lib/plenario.js?v=20261107';
import { janelasDoAndar, ordemDosAndares, trechoDoPasseio } from './lib/predio.js?v=20261107';
import { montaSeletor, leCandidaturas, nomeDe } from './pecas.js?v=20261107';

montaPagina();

const MAX_JANELAS = 600;         // janelas quando cada uma vale um grupo
const MAX_COM_NOME = 2000;       // até tantos candidatos com a lista, cada janela é uma pessoa
const brasil = await carregaDados('mapa/brasil.json');
const FAIXAS = brasil.faixas_patrimonio;
const minusculo = c => c.toLowerCase();
const reduz = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const territorio = r => (r.cargo === 'PRESIDENTE' ? 'BR' : MUNICIPAIS.includes(r.cargo) && r.mun ? r.mun : r.uf ?? 'BR');
const plural = (n, um, varios) => `${formata.numero(n)} ${n === 1 ? um : varios}`;
const SEM_LISTA = 'A lista com os nomes existe por estado (cargos estaduais e federais), por município (prefeito e vereador) e para presidente.';
let primeiraPintura = true;
let atual = null;               // { r, nome, andares, cands, passo, porAndar } do recorte desenhado
let andarEscolhido = null;

async function nomeLugar(r) {
  const t = territorio(r);
  if (/^\d{5}$/.test(t)) return (await carregaDados(`mapa/municipios/${r.uf}.json`)).municipios[t]?.nome ?? t;
  return t === 'BR' ? 'Brasil' : NOME_UF[t];
}

/** Candidatos e eleitos de cada faixa no recorte, pelo mapa: [{faixa, candidatos, eleitos}], uma por faixa. */
async function faixasDoRecorte(r) {
  const t = territorio(r);
  const dados = /^\d{5}$/.test(t) ? await carregaDados(`mapa/municipios/${r.uf}.json`) : brasil;
  const ic = brasil.cargos.indexOf(r.cargo);
  const linhas = dados.patrimonio.map(l => Object.fromEntries(brasil.campos_faixa.map((c, i) => [c, l[i]])))
    .filter(x => x.ano === r.ano && x.cargo === ic && x.territorio === t);
  return FAIXAS.map((_, f) => linhas.find(x => x.faixa === f) ?? { faixa: f, candidatos: 0, eleitos: 0 });
}

const taxa = a => (a.candidatos ? (100 * a.eleitos) / a.candidatos : null);
const seloResultado = c => `<span class="selo ${c.eleito ? 'selo-vitoria' : 'selo-derrota'}">${c.eleito ? 'eleito' : '× não eleito'}</span>`;
const nomeComLink = c => (c.pid ? `<a href="pergunta-10.html#${c.pid}">${nomeDe(c)}</a>` : nomeDe(c));

// ---------------------------------------------------------------- o prédio

/** Desenha o prédio. Com a lista de candidatos, cada janela é alguém (os maiores patrimônios primeiro, acesa quando
 *  se elegeu); sem ela, ou com candidatos demais, cada janela vale um grupo de candidatos do andar. */
function desenhaPredio() {
  const { andares, porAndar, passo } = atual;
  const caixa = document.getElementById('predio');
  const total = { candidatos: d3.sum(andares, a => a.candidatos), eleitos: d3.sum(andares, a => a.eleitos) };
  if (!total.candidatos) {
    caixa.innerHTML = `<p class="aviso-vazio">Não há candidatos a ${minusculo(atual.r.cargo)} ${em(atual.nome)} em ${atual.r.ano}.</p>`;
    document.getElementById('nota-predio').textContent = '';
    return;
  }
  const janelas = a => {
    const pessoas = porAndar?.[a.faixa];
    if (pessoas) return pessoas.map((c, k) => `<i class="janela${c.eleito ? ' acesa' : ''}" data-f="${a.faixa}" data-k="${k}"></i>`).join('');
    const { janelas: n, acesas } = janelasDoAndar(a.candidatos, a.eleitos, passo);
    // as acesas espalhadas pelo andar, como as luzes de um prédio de verdade, e sempre nos mesmos lugares
    const acesasEm = new Set(d3.range(acesas).map(i => Math.floor(((i + 0.5) * n) / acesas)));
    return d3.range(n).map(k => `<i class="janela${acesasEm.has(k) ? ' acesa' : ''}" data-f="${a.faixa}"></i>`).join('');
  };
  caixa.innerHTML = `
    <div class="predio-telhado" aria-hidden="true"></div>
    ${ordemDosAndares(andares.length).map(f => andares[f]).map(a => `
      <div class="andar${a.faixa === andarEscolhido ? ' escolhido' : ''}${a.candidatos ? '' : ' vazio'}" data-f="${a.faixa}"
           ${a.candidatos ? `tabindex="0" role="button" aria-pressed="${a.faixa === andarEscolhido}"` : ''}
           aria-label="${FAIXAS[a.faixa]}: ${a.candidatos ? `${formata.pct(taxa(a))} se elegeram, ${plural(a.eleitos, 'eleito', 'eleitos')} de ${formata.numero(a.candidatos)}` : 'nenhum candidato'}">
        <span class="andar-rotulo">${FAIXAS[a.faixa]}</span>
        <span class="andar-janelas">${janelas(a)}</span>
        <span class="andar-taxa">${a.candidatos ? `<b>${formata.pct(taxa(a))}</b><small>${formata.numero(a.eleitos)} de ${formata.numero(a.candidatos)}</small>` : '<small>ninguém</small>'}</span>
      </div>`).join('')}
    <div class="predio-chao" aria-hidden="true"><span class="porta"></span></div>
    <p class="predio-total">No prédio inteiro, <b>${formata.pct(taxa(total))}</b> se elegeram: ${plural(total.eleitos, 'eleito', 'eleitos')} de
      ${formata.numero(total.candidatos)} candidatos.</p>`;
  // na primeira vez, as luzes acendem andar por andar, de baixo para cima
  if (primeiraPintura && !reduz()) {
    const todos = [...caixa.querySelectorAll('.andar')];
    todos.forEach((andar, i) => andar.querySelectorAll('.janela.acesa').forEach(j => j.animate(
      [{ backgroundColor: 'var(--janela-apagada)' }, { backgroundColor: 'var(--janela-acesa)' }],
      { duration: 380, delay: 200 + 160 * (todos.length - 1 - i) + Math.random() * 220, fill: 'backwards', easing: 'ease-out' })));
  }
  primeiraPintura = false;
  document.getElementById('nota-predio').textContent = porAndar
    ? 'Cada janela é um candidato; em cada andar, os de maior patrimônio vêm primeiro.'
    : `Cada janela vale cerca de ${plural(passo, 'candidato', 'candidatos')}.${atual.cands.length ? '' : ` ${SEM_LISTA}`}`;
}

const FECHAR = '<button type="button" class="fecha-janela" aria-label="Fechar o cartão">×</button>';
const estreito = () => matchMedia('(max-width: 860px)').matches;

/** Leva o cartão até a altura da janela clicada, para ele acompanhar o andar conforme o leitor desce pelo prédio,
 *  sem sair da coluna. Em tela estreita, onde a coluna fica abaixo do prédio, o cartão abre preso ao pé da tela. */
function posicionaCartao(el) {
  const caixa = document.getElementById('janela');
  if (estreito()) { caixa.classList.add('aberto'); caixa.style.transform = ''; return; }
  const lado = caixa.parentElement.getBoundingClientRect(), janela = el.getBoundingClientRect();
  const alvo = janela.top - lado.top + janela.height / 2 - caixa.offsetHeight / 2;
  const limite = Math.max(0, lado.height - caixa.offsetHeight);
  caixa.style.transform = `translateY(${Math.round(Math.min(limite, Math.max(0, alvo)))}px)`;
}

/** O que aparece ao lado ao clicar numa janela: o candidato, ou o andar, quando a janela é um grupo. */
function mostraJanela(el) {
  const caixa = document.getElementById('janela');
  const f = Number(el.dataset.f);
  const a = atual.andares[f];
  const c = el.dataset.k != null ? atual.porAndar?.[f]?.[Number(el.dataset.k)] : null;
  if (!c) {
    caixa.innerHTML = `${FECHAR}<p class="janela-andar">${FAIXAS[f]}</p>
      <p><b>${formata.pct(taxa(a))}</b> se elegeram: ${plural(a.eleitos, 'eleito', 'eleitos')} de ${formata.numero(a.candidatos)}.</p>
      <p class="apoio">Esta janela vale cerca de ${plural(atual.passo, 'candidato', 'candidatos')}${el.classList.contains('acesa') ? ' que se elegeram' : ''}.</p>`;
    posicionaCartao(el);
    return;
  }
  const porVoto = c.votos > 0 && c.patrimonio > 0 ? c.patrimonio / c.votos : null;
  caixa.innerHTML = `${FECHAR}<p class="janela-andar">${FAIXAS[f]}</p>
    <div class="janela-pessoa">${c.nomeado ? fotoCandidato(c.foto, 'maiores-foto') : ''}
      <div><b>${nomeComLink(c)}</b> <span class="apoio">${c.sigla}</span> ${seloResultado(c)}</div></div>
    <dl class="janela-linhas">
      <div><dt>Patrimônio</dt><dd>${c.patrimonio > 0 ? formata.real(c.patrimonio) : 'nenhum bem'}</dd></div>
      <div><dt>Votos</dt><dd>${c.votos > 0 ? formata.numero(c.votos) : 'sem votos'}</dd></div>
      ${porVoto == null ? '' : `<div><dt>Patrimônio por voto</dt><dd>${formata.porVoto(porVoto)}</dd></div>`}
    </dl>`;
  posicionaCartao(el);
}

document.getElementById('janela').addEventListener('click', e => {
  if (e.target.closest('.fecha-janela')) e.currentTarget.classList.remove('aberto');
});

// ---------------------------------------------------------------- o andar escolhido

function desenhaAndar() {
  const { andares, porAndar } = atual;
  const a = andares[andarEscolhido];
  document.getElementById('t-andar').innerHTML = `<span class="sobre">${FAIXAS[andarEscolhido]}</span>Quem mora neste andar`;
  const caixa = document.getElementById('andar');
  const pessoas = porAndar?.[andarEscolhido] ?? atual.cands.filter(c => faixaDePatrimonio(c.patrimonio) === andarEscolhido);
  if (!pessoas.length) {
    caixa.innerHTML = `<p class="apoio">${plural(a.candidatos, 'candidato', 'candidatos')} neste andar, ${plural(a.eleitos, 'eleito', 'eleitos')}. ${SEM_LISTA}</p>`;
    return;
  }
  const ordem = [...pessoas].sort((x, y) => (y.patrimonio ?? 0) - (x.patrimonio ?? 0) || (y.votos ?? 0) - (x.votos ?? 0));
  const mostrados = ordem.slice(0, 10);
  caixa.innerHTML = `<p>${formata.pct(taxa(a))} deste andar se elegeram (${plural(a.eleitos, 'eleito', 'eleitos')} de ${formata.numero(a.candidatos)}).
      ${andarEscolhido === 0 ? 'Quem não declarou bens, pelos votos:' : 'Os maiores patrimônios:'}</p>
    <ul class="moradores">${mostrados.map(c => `<li>${c.nomeado ? fotoCandidato(c.foto, 'maiores-foto') : ''}
      <span class="maiores-nome">${nomeComLink(c)} <span class="apoio">${c.sigla}</span></span>
      <span class="maiores-dados">${c.patrimonio > 0 ? `<b>${formata.real(c.patrimonio)}</b> · ` : ''}${c.votos > 0 ? `${formata.numero(c.votos)} votos` : 'sem votos'}
        · ${seloResultado(c)}</span></li>`).join('')}</ul>
    ${ordem.length > mostrados.length ? `<p class="apoio">E mais ${formata.numero(ordem.length - mostrados.length)} neste andar.</p>` : ''}`;
}

function escolheAndar(f) {
  if (!atual.andares[f]?.candidatos) return;
  andarEscolhido = f;
  document.querySelectorAll('#predio .andar').forEach(el => {
    const sim = Number(el.dataset.f) === f;
    el.classList.toggle('escolhido', sim);
    if (el.hasAttribute('aria-pressed')) el.setAttribute('aria-pressed', String(sim));
  });
  desenhaAndar();
}

const predio = document.getElementById('predio');
predio.addEventListener('click', e => {
  const j = e.target.closest('.janela');
  if (j) {
    predio.querySelectorAll('.janela.escolhida').forEach(x => x.classList.remove('escolhida'));
    j.classList.add('escolhida');
    mostraJanela(j);
  }
  const andar = e.target.closest('.andar');
  if (andar) escolheAndar(Number(andar.dataset.f));
});
predio.addEventListener('keydown', e => {
  const andar = e.target.closest('.andar');
  if (andar && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); escolheAndar(Number(andar.dataset.f)); }
});

// ---------------------------------------------------------------- ciclo

let pedido = 0;
async function atualiza(r) {
  const meu = ++pedido;
  const [nome, faixas, todos] = await Promise.all([nomeLugar(r), faixasDoRecorte(r), leCandidaturas(ueDoRecorte(r), r.ano)]);
  if (meu !== pedido) return;
  const cands = todos.filter(c => c.cargo === r.cargo);
  // com a lista e poucos candidatos, os andares saem dela e cada janela é alguém; senão, das contagens do mapa
  let andares = faixas, porAndar = null;
  if (cands.length && cands.length <= MAX_COM_NOME) {
    porAndar = FAIXAS.map((_, f) => cands.filter(c => faixaDePatrimonio(c.patrimonio) === f)
      .sort((x, y) => (y.patrimonio ?? 0) - (x.patrimonio ?? 0)));
    andares = porAndar.map((cs, f) => ({ faixa: f, candidatos: cs.length, eleitos: cs.filter(c => c.eleito).length }));
  }
  const passo = porAndar ? 1 : agrupa(d3.sum(andares, a => a.candidatos), MAX_JANELAS);
  atual = { r, nome, andares, cands, passo, porAndar };
  document.getElementById('t-predio').innerHTML = `<span class="sobre">${minusculo(r.cargo)} · ${nome} · ${r.ano}</span>
    Quem se elegeu em cada andar de patrimônio`;
  const comGente = andares.filter(a => a.candidatos);
  if (!comGente.some(a => a.faixa === andarEscolhido)) andarEscolhido = comGente.at(-1)?.faixa ?? null;
  desenhaPredio();
  const cartao = document.getElementById('janela');
  cartao.innerHTML = '<p class="apoio">Clique numa janela para ver quem mora nela.</p>';
  cartao.style.transform = ''; cartao.classList.remove('aberto');
  if (andarEscolhido != null) desenhaAndar();
  else { document.getElementById('t-andar').textContent = 'Quem mora neste andar'; document.getElementById('andar').innerHTML = ''; }
}

// ---------------------------------------------------------------- moradores passando

// de tempos em tempos, um morador atravessa algumas janelas de um andar: a silhueta só aparece no vidro, e some
// atrás da parede entre uma janela e a outra
const SILHUETA = '<svg viewBox="0 0 10 14" aria-hidden="true"><circle cx="5" cy="4.3" r="2.5"/><path d="M0.8 14 Q0.8 8.3 5 8.3 Q9.2 8.3 9.2 14 Z"/></svg>';
let predioNaTela = false;
new IntersectionObserver(([e]) => { predioNaTela = e.isIntersecting; }).observe(predio);

function passeio() {
  const andares = [...predio.querySelectorAll('.andar:not(.vazio) .andar-janelas')];
  if (!andares.length) return;
  const janelas = [...andares[Math.floor(Math.random() * andares.length)].querySelectorAll('.janela')];
  const trecho = trechoDoPasseio(janelas.map(j => j.offsetTop), Math.random)?.map(k => janelas[k]);
  if (!trecho) return;
  // anda de uma ponta à outra da fileira, virada para onde vai. A silhueta tem 70% da largura da janela: entra toda
  // escondida de um lado e sai toda pelo outro
  const paraEsquerda = trecho[0].offsetLeft > trecho.at(-1).offsetLeft;
  const duracao = 800 + Math.random() * 300, [de, ate] = paraEsquerda ? ['143%', '-100%'] : ['-100%', '143%'];
  trecho.forEach((j, k) => {
    const s = document.createElement('span');
    s.className = `silhueta${paraEsquerda ? ' vira' : ''}`;
    s.innerHTML = SILHUETA;
    j.append(s);
    s.animate([{ transform: `translateX(${de})` }, { transform: `translateX(${ate})` }],
      { duration: duracao, delay: k * duracao * 0.78, easing: 'linear', fill: 'both' }).finished.then(() => s.remove(), () => s.remove());
  });
}
// o prédio está sempre movimentado: cada morador atravessa a fileira inteira, então sempre há vários andando ao mesmo
// tempo, em andares diferentes
(function agenda() {
  setTimeout(() => {
    if (predioNaTela && !document.hidden && !reduz()) { passeio(); if (Math.random() < 0.15) passeio(); }
    agenda();
  }, 700 + Math.random() * 700);
})();

montaSeletor(document.getElementById('recorte'), {
  anos: brasil.anos, comLugar: true, padrao: { ano: 2022, cargo: 'DEPUTADO FEDERAL', uf: 'MG' }, aoMudar: atualiza,
  municipioObrigatorio: true,
});
