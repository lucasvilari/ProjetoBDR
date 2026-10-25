// Página inicial: a abertura (o olho se abre e voa até o logo) e a roda do oráculo, com as dez
// perguntas em volta do olho; apontar uma pergunta faz o olho olhar para ela e mostra o que ela
// responde e como é calculada.
import { montaPagina } from './comum.js?v=20261109';
import { PERGUNTAS } from './lib/perguntas.js?v=20261109';
import { posicoesNaRoda, olharPara } from './lib/roda.js?v=20261109';

montaPagina();

const reduzMovimento = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const SAI = 'cubic-bezier(0.16, 1, 0.3, 1)';

// ---------------------------------------------------------------- abertura

/** O olho grande se abre no centro e voa até a tecla do logo; uma vez por sessão.
 *  Clique, tecla ou movimento reduzido pulam direto para o fim. */
function abertura() {
  const camada = document.getElementById('abertura-olho');
  const marca = document.querySelector('.marca-tecla');
  let jaViu = false;
  try { jaViu = sessionStorage.getItem('olho-aberto') === '1'; sessionStorage.setItem('olho-aberto', '1'); } catch { /* sem armazenamento */ }
  if (jaViu || reduzMovimento() || !camada?.animate || !marca) { camada?.remove(); return; }

  marca.classList.add('marca-esperando');
  const olho = camada.querySelector('.olho-grande');
  const palpebra = camada.querySelector('.olho-palpebra');
  let acabou = false;
  const fim = () => {
    if (acabou) return;
    acabou = true;
    marca.classList.remove('marca-esperando');
    // pulando a abertura no meio, a tecla e o olhinho vão direto ao estado final, sem começar a surgir depois
    [marca, marca.querySelector('svg')].forEach(el => el?.getAnimations().forEach(a => a.finish()));
    camada.remove();
    removeEventListener('keydown', fim); removeEventListener('pointerdown', fim);
  };
  addEventListener('keydown', fim); addEventListener('pointerdown', fim);

  const abre = palpebra.animate([{ transform: 'scaleY(0.04)' }, { transform: 'scaleY(1)' }],
    { duration: 900, easing: SAI, fill: 'both' });
  abre.finished.then(() => {
    if (acabou) return;
    // o olho grande voa até o olhinho da tecla (não até a tecla inteira), para pousar exatamente sobre ele
    const olhinho = marca.querySelector('svg');
    const de = olho.getBoundingClientRect(), para = olhinho.getBoundingClientRect();
    const escala = para.width / de.width;
    const dx = para.left + para.width / 2 - (de.left + de.width / 2);
    const dy = para.top + para.height / 2 - (de.top + de.height / 2);
    const VOO = 700, ESPERA = 250;
    camada.animate([{ backgroundColor: 'rgb(232 220 196 / 0.96)' }, { backgroundColor: 'rgb(232 220 196 / 0)' }],
      { duration: VOO, delay: ESPERA, easing: SAI, fill: 'forwards' });
    // a tecla preta surge nos últimos instantes do voo, crescendo de leve, em vez de aparecer de uma vez
    marca.animate([{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'scale(1)' }],
      { duration: 380, delay: ESPERA + VOO - 380, easing: SAI, fill: 'forwards' });
    olho.animate([{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(${escala})` }],
      { duration: VOO, delay: ESPERA, easing: SAI, fill: 'forwards' }).finished.then(() => {
      if (acabou) return;
      // na chegada, o olho grande se desfaz enquanto o olhinho aparece no mesmo lugar: não fica quadro vazio
      olho.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' });
      olhinho.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, fill: 'forwards' }).finished.then(fim, fim);
    }, fim);
  }, fim);
}

// ---------------------------------------------------------------- roda

const roda = document.getElementById('roda');
const lista = document.getElementById('perguntas');
const detalhe = document.getElementById('detalhe');
const pupila = document.getElementById('pupila');
const estreita = matchMedia('(max-width: 640px)');

const posicoes = posicoesNaRoda(PERGUNTAS.length, 43, 50, 50);   // em % da roda

lista.innerHTML = PERGUNTAS.map((p, i) => {
  const rotulo = `<span class="roda-n">${p.n}</span><span class="roda-titulo">${p.titulo}</span>`;
  const estilo = `style="--x:${posicoes[i].x}%;--y:${posicoes[i].y}%"`;
  return `<li ${estilo} data-i="${i}">${p.href
    ? `<a class="roda-pergunta" href="${p.href}">${rotulo}</a>`
    : `<button type="button" class="roda-pergunta" aria-disabled="true">${rotulo}<span class="so-leitor"> (ainda não respondida)</span></button>`}</li>`;
}).join('');

function mostra(i) {
  const p = PERGUNTAS[i];
  const { dx, dy } = olharPara(posicoes[i].angulo, 30, 14);
  pupila.style.transform = `translate(${dx}px, ${dy}px)`;
  detalhe.innerHTML = `<strong>${p.n}. ${p.titulo}</strong>
    <span>${p.oQue}</span>
    <span class="roda-como"><b>Como se calcula:</b> ${p.como}</span>
    ${p.href ? '' : '<span class="roda-indisponivel">Ainda não respondida no site.</span>'}`;
  lista.querySelectorAll('li').forEach(li => li.classList.toggle('ativa', Number(li.dataset.i) === i));
  // na tela estreita, o detalhamento abre logo abaixo da pergunta escolhida
  if (estreita.matches) lista.querySelector(`li[data-i="${i}"]`).append(detalhe);
  else if (detalhe.parentElement !== roda.querySelector('.roda-centro')) roda.querySelector('.roda-centro').append(detalhe);
}

lista.addEventListener('mouseover', e => { const li = e.target.closest('li'); if (li) mostra(Number(li.dataset.i)); });
lista.addEventListener('focusin', e => { const li = e.target.closest('li'); if (li) mostra(Number(li.dataset.i)); });
lista.addEventListener('click', e => { if (e.target.closest('[aria-disabled="true"]')) e.preventDefault(); });
estreita.addEventListener('change', () => { const ativa = lista.querySelector('li.ativa'); if (ativa) mostra(Number(ativa.dataset.i)); });

detalhe.innerHTML = '<strong>O oráculo está de olho.</strong><span>Escolha uma das perguntas em volta.</span>';
abertura();
