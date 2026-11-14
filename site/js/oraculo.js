// O oráculo: um olho flutuante, no canto da tela, que acompanha o ponteiro. Clicado, abre um painel que lê o que a
// página mostra agora (o retrato: o recorte escolhido, os números calculados e o que o leitor abriu) e pede uma
// interpretação desses dados à função do oráculo na Cloudflare (pasta oraculo/ do repositório), que responde aos poucos.
import { retratoEmTexto } from './lib/retrato.js?v=20261162';
import { achaNoTexto, recorteDoPedido } from './lib/leitor.js?v=20261162';
import { toca } from './som.js?v=20261162';

let montaRetrato = null;
let recortePedido = null;

// a função do oráculo (Cloudflare Workers, plano gratuito); vazia, o painel avisa que o oráculo não está ligado
export const ENDERECO = 'https://oraculo.olhodopovo.workers.dev';

/** A página diz como montar o seu retrato. A função é chamada na hora do clique, então o retrato sempre reflete os
 *  filtros e as escolhas daquele momento. Devolve (ou promete) { numero, pergunta, recorte, secoes }, ou null. */
export function registraRetrato(funcao) {
  montaRetrato = funcao;
}

/** A página diz que recortes a pergunta do leitor pode pedir e como aplicá-los: antes de responder, o oráculo procura
 *  na pergunta um ano, um cargo, um estado, um município ou o Brasil e, se a página tiver esse recorte, muda a página
 *  para ele (o leitor vê os mesmos números que a IA leu). `config`: { opcoes: { anos, cargosDoAno?, lugar?: 'mun' |
 *  'uf', brasil? } (ou função que as devolve), atual: () => { ano, cargo?, uf?, mun? }, aplica: async novo => (a
 *  página redesenhada) o recorte que ficou, rotulo?: recorte => texto }. */
export function registraRecortes(config) {
  recortePedido = config;
}

const reduz = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const OLHO = `<svg viewBox="0 0 48 30" aria-hidden="true">
  <path d="M3 15C12 3 36 3 45 15C36 27 12 27 3 15Z" fill="#faf7ef" stroke="#22201c" stroke-width="2.4"/>
  <g class="oraculo-pupila"><circle cx="24" cy="15" r="7.5" fill="#22201c"/><circle cx="26.6" cy="12.4" r="2.2" fill="#faf7ef"/></g>
</svg>`;

/** Põe o olho e o painel na página (montaPagina chama em toda página com topo, menos a inicial). */
export function montaOraculo() {
  // na página inicial não há dados para interpretar, e a cabine já é o oráculo inteiro
  if (['inicio', 'cabine'].includes(document.body.dataset.pagina) || document.getElementById('oraculo-olho')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <button type="button" class="oraculo-olho" id="oraculo-olho" aria-expanded="false" aria-controls="oraculo-painel">
      ${OLHO}<span class="so-leitor">Abrir o oráculo: uma interpretação dos dados desta página</span></button>
    <section class="oraculo-painel" id="oraculo-painel" role="dialog" aria-labelledby="oraculo-titulo" hidden>
      <header class="oraculo-cabeca"><h2 id="oraculo-titulo">O oráculo</h2>
        <button type="button" class="oraculo-fecha" aria-label="Fechar o oráculo">×</button></header>
      <div class="oraculo-corpo">
        <form class="oraculo-pergunta" id="oraculo-form">
          <label for="oraculo-texto">Pergunte algo sobre estes dados</label>
          <textarea id="oraculo-texto" rows="2" maxlength="300" placeholder="Ex.: resuma a página, ou: por que o gasto dos eleitos é tão maior?"></textarea>
          <button type="submit" class="botao" disabled>Interpretar</button>
        </form>
        <div class="oraculo-mudanca" id="oraculo-mudanca" aria-live="polite" hidden></div>
        <div class="oraculo-resposta" id="oraculo-resposta" aria-live="polite"></div>
        <p class="oraculo-aviso">O oráculo é uma inteligência artificial e pode errar. Confira os números na página.</p>
      </div>
    </section>`);
  const olho = document.getElementById('oraculo-olho');
  const painel = document.getElementById('oraculo-painel');
  const pupila = olho.querySelector('.oraculo-pupila');

  // a pupila olha para o ponteiro (no máximo 3 unidades do centro)
  let quadro = 0;
  addEventListener('pointermove', e => {
    if (reduz() || quadro) return;
    quadro = requestAnimationFrame(() => {
      quadro = 0;
      const r = olho.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1, alcance = Math.min(1, d / 300);
      pupila.style.transform = `translate(${((dx / d) * 4 * alcance).toFixed(2)}px, ${((dy / d) * 2.5 * alcance).toFixed(2)}px)`;
    });
  });

  const abre = async () => {
    toca('oraculo');
    painel.hidden = false;
    olho.setAttribute('aria-expanded', 'true');
    const retrato = await montaRetrato?.();
    document.getElementById('oraculo-form').hidden = !retrato;
    document.getElementById('oraculo-resposta').textContent = retrato ? '' : 'Esta página ainda não mostra os seus dados ao oráculo.';
    document.getElementById(retrato ? 'oraculo-texto' : 'oraculo-titulo').focus?.();
  };
  const fecha = () => {
    painel.hidden = true;
    olho.setAttribute('aria-expanded', 'false');
    olho.focus();
  };
  olho.addEventListener('click', () => (painel.hidden ? abre() : fecha()));
  painel.querySelector('.oraculo-fecha').addEventListener('click', fecha);
  painel.addEventListener('keydown', e => { if (e.key === 'Escape') fecha(); });

  // o botão só funciona com uma pergunta escrita (pelo menos três letras); se ela faz sentido, quem julga é o oráculo
  const campo = document.getElementById('oraculo-texto');
  const botao = document.querySelector('#oraculo-form button');
  const temPergunta = () => (campo.value.match(/\p{L}/gu) ?? []).length >= 3;
  campo.addEventListener('input', () => { if (!botao.classList.contains('esperando')) botao.disabled = !temPergunta(); });
  // Enter envia; Shift+Enter quebra a linha
  campo.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!botao.disabled) document.getElementById('oraculo-form').requestSubmit(); }
  });

  document.getElementById('oraculo-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (!temPergunta()) return;
    const texto = document.getElementById('oraculo-texto').value;
    // a pergunta pode pedir outro recorte ("presidente em 2026"): a página muda antes, e o retrato já sai do novo
    await mudaRecorte(texto);
    const retrato = await montaRetrato?.();
    if (!retrato) return;
    // o retrato é montado no envio: se o leitor mudou um filtro com o painel aberto, vale o novo
    pergunta(retrato.numero, retratoEmTexto(retrato), texto);
  });
}

// ---------------------------------------------------------------- o recorte pedido na pergunta

let lugares = null;      // os municípios dos seis estados ([cod, nome, uf]), lidos na primeira pergunta que precisa
async function municipios() {
  if (!lugares) {
    const { carregaDados } = await import('./comum.js?v=20261162');
    try { lugares = (await carregaDados('lugares.json')).municipios; } catch { lugares = []; }
  }
  return lugares;
}

/** O recorte em palavras: "presidente · Brasil · 2026", "vereador · João Pessoa (PB) · 2024". */
async function rotuloPadrao(r, opcoes) {
  const { NOME_UF } = await import('./comum.js?v=20261162');
  const mun = r.mun ? (await municipios()).find(([cod]) => cod === r.mun) : null;
  const lugar = mun ? `${mun[1]} (${mun[2]})` : r.uf ? NOME_UF[r.uf] : opcoes.lugar ? (opcoes.brasil === 'seis' ? 'os seis estados' : 'Brasil') : null;
  return [r.cargo?.toLowerCase(), lugar, r.ano].filter(Boolean).join(' · ');
}

/** Procura na pergunta um recorte que a página tem e muda a página para ele; mostra no painel o que mudou (com o botão
 *  de desfazer) e o que a página não tem. */
async function mudaRecorte(texto) {
  const caixa = document.getElementById('oraculo-mudanca');
  caixa.hidden = true;
  caixa.innerHTML = '';
  if (!recortePedido) return;
  const opcoes = typeof recortePedido.opcoes === 'function' ? recortePedido.opcoes() : recortePedido.opcoes;
  const achados = achaNoTexto(texto, opcoes.lugar ? await municipios() : []);
  const antes = recortePedido.atual();
  const { novo, avisos } = recorteDoPedido(achados, antes, opcoes);
  let rotulo = null;
  if (novo) {
    const ficou = await recortePedido.aplica(novo);
    const mudou = JSON.stringify(ficou ?? novo) !== JSON.stringify(antes);
    if (mudou) rotulo = await (recortePedido.rotulo ?? (r => rotuloPadrao(r, opcoes)))(ficou ?? novo);
  }
  if (!rotulo && !avisos.length) return;
  caixa.innerHTML = `${rotulo ? `<p><span>A página mudou para <strong></strong>.</span>
      <button type="button" class="oraculo-desfaz">Desfazer</button></p>` : ''}
    ${avisos.map(() => '<p class="oraculo-mudanca-aviso"></p>').join('')}`;
  if (rotulo) caixa.querySelector('strong').textContent = rotulo;
  caixa.querySelectorAll('.oraculo-mudanca-aviso').forEach((p, i) => { p.textContent = avisos[i]; });
  caixa.hidden = false;
  caixa.querySelector('.oraculo-desfaz')?.addEventListener('click', async e => {
    e.currentTarget.disabled = true;
    await recortePedido.aplica(antes);
    caixa.innerHTML = '<p>A página voltou ao recorte de antes; a resposta fala do recorte que a pergunta pediu.</p>';
  });
}

export const AVISOS = {
  400: 'O oráculo não entendeu o pedido. Escreva uma pergunta sobre os dados desta página.',
  403: 'O oráculo só atende a partir do site publicado.',
  429: 'Muitas perguntas em pouco tempo. Espere um minuto e tente de novo.',
  503: 'O oráculo está descansando: a cota gratuita do dia acabou ou a IA está fora do ar. Volte mais tarde.',
};

/** Manda o retrato à função do oráculo e escreve a resposta à medida que ela chega. */
let pedidoAtual = null;
async function pergunta(numero, retrato, texto) {
  const alvo = document.getElementById('oraculo-resposta');
  const botao = document.querySelector('#oraculo-form button');
  if (!ENDERECO) { escreve(alvo, 'O oráculo ainda não está ligado a uma IA.'); return; }
  pedidoAtual?.abort();
  const pedido = pedidoAtual = new AbortController();
  alvo.classList.add('pensando');
  alvo.textContent = 'O oráculo está lendo os dados…';
  botao.disabled = true;
  botao.classList.add('esperando');
  try {
    const resposta = await fetch(ENDERECO, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: pedido.signal,
      body: JSON.stringify({ numero, retrato, pergunta: texto }),
    });
    if (!resposta.ok) { alvo.textContent = AVISOS[resposta.status] ?? 'O oráculo não conseguiu responder agora.'; return; }
    const leitor = resposta.body.getReader(), decodifica = new TextDecoder();
    let primeiro = true;
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      if (primeiro) { alvo.textContent = ''; alvo.classList.remove('pensando'); primeiro = false; }
      alvo.textContent += decodifica.decode(value, { stream: true });
    }
    if (primeiro) alvo.textContent = 'O oráculo não conseguiu responder agora.';
  } catch (e) {
    if (e.name !== 'AbortError') alvo.textContent = 'Não foi possível falar com o oráculo. Verifique a conexão.';
  } finally {
    if (pedido === pedidoAtual) {
      alvo.classList.remove('pensando');
      botao.classList.remove('esperando');
      botao.disabled = (document.getElementById('oraculo-texto').value.match(/\p{L}/gu) ?? []).length < 3;
    }
  }
}

/** Escreve o texto aos poucos, como a resposta da IA vai chegar. */
function escreve(alvo, texto) {
  clearInterval(alvo._escrevendo);
  if (reduz()) { alvo.textContent = texto; return; }
  let i = 0;
  alvo.textContent = '';
  alvo._escrevendo = setInterval(() => {
    i = Math.min(texto.length, i + 3);
    alvo.textContent = texto.slice(0, i);
    if (i >= texto.length) clearInterval(alvo._escrevendo);
  }, 16);
}
