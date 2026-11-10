// Os efeitos sonoros do site, sintetizados pelo próprio navegador (Web Audio), sem arquivos de áudio: o acorde místico
// da abertura, o farfalhar da cortina ao fechar e abrir, o brilho do olho do oráculo, o sino da resposta da cabine e
// o tom grave de quando não há resposta. O leitor liga e desliga no botão do topo (comum.js), e a escolha fica guardada.
// O navegador só deixa tocar depois de um gesto do leitor (clique, toque, tecla); antes disso, os sons não tocam.
import { somLigado, guardaSom } from './lib/som.js?v=20261160';

const VOLUME = 0.32;
const PRAZO = 250;   // ms: se o navegador não liberar o áudio nesse tempo, o som perde a hora e não toca atrasado

const armazenamento = () => { try { return localStorage; } catch { return null; } };
export const ligado = () => somLigado(armazenamento());
export const liga = sim => guardaSom(armazenamento(), sim);

let ctx = null, saida = null, eco = null, ruido = null;

function prepara() {
  if (ctx) return ctx;
  const Contexto = window.AudioContext || window.webkitAudioContext;
  if (!Contexto) return null;
  ctx = new Contexto();
  saida = ctx.createGain();
  saida.gain.value = VOLUME;
  saida.connect(ctx.destination);
  // o eco da cabine: uma reverberação feita de ruído que se apaga em 2,6 s
  const dur = 2.6, n = Math.floor(ctx.sampleRate * dur), resposta = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = resposta.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3;
  }
  const conv = ctx.createConvolver();
  conv.buffer = resposta;
  eco = ctx.createGain();
  eco.gain.value = 0.55;
  eco.connect(conv).connect(saida);
  // ruído branco, a matéria do tecido da cortina
  ruido = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const r = ruido.getChannelData(0);
  for (let i = 0; i < r.length; i++) r[i] = Math.random() * 2 - 1;
  return ctx;
}

/** Destrava o áudio: chamada dentro de um gesto do leitor (o toque na tela de entrada, o botão de som). */
export function destrava() {
  const c = prepara();
  if (c?.state === 'suspended') c.resume().catch(() => {});
}

/** Toca um dos sons (abertura, cortinaFecha, cortinaAbre, oraculo, resposta, vazio), se o som estiver ligado. */
export function toca(nome) {
  if (!ligado() || !SONS[nome]) return;
  const c = prepara();
  if (!c) return;
  if (c.state === 'running') { SONS[nome](c); return; }
  const pedido = performance.now();
  c.resume().then(() => { if (c.state === 'running' && performance.now() - pedido < PRAZO) SONS[nome](c); }).catch(() => {});
}

// ---------------------------------------------------------------- peças

/** Um envelope: sobe até `pico` em `ataque` s, segura e se apaga até `fim` s (tempos contados de `t`). */
function envelope(c, t, pico, ataque, fim, destino) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(pico, t + ataque);
  g.gain.exponentialRampToValueAtTime(0.0001, t + fim);
  g.connect(destino);
  return g;
}

function nota(c, { t, freq, tipo = 'sine', pico, ataque, fim, eco: molhado = 0.6, desafina = 0, ate = null }) {
  const o = c.createOscillator();
  o.type = tipo;
  o.frequency.setValueAtTime(freq, t);
  if (ate) o.frequency.exponentialRampToValueAtTime(ate, t + fim);
  o.detune.value = desafina;
  const seco = envelope(c, t, pico * (1 - molhado * 0.5), ataque, fim, saida);
  const mol = envelope(c, t, pico * molhado, ataque, fim, eco);
  o.connect(seco); o.connect(mol);
  o.start(t); o.stop(t + fim + 0.05);
}

/** O farfalhar do veludo: ruído num filtro que varre de `de` a `para` Hz, com um tremor de pregas. */
function tecido(c, { dur, de, para, pico }) {
  const t = c.currentTime;
  const fonte = c.createBufferSource();
  fonte.buffer = ruido;
  const filtro = c.createBiquadFilter();
  filtro.type = 'bandpass';
  filtro.Q.value = 0.9;
  filtro.frequency.setValueAtTime(de, t);
  filtro.frequency.exponentialRampToValueAtTime(para, t + dur);
  const abafa = c.createBiquadFilter();
  abafa.type = 'lowpass';
  abafa.frequency.value = 2400;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(pico, t + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  // as pregas: um tremor rápido no volume, antes do envelope (que o apaga junto no fim)
  const tremor = c.createOscillator(), fundo = c.createGain(), pregas = c.createGain();
  tremor.frequency.value = 13;
  pregas.gain.value = 0.75;
  fundo.gain.value = 0.25;
  tremor.connect(fundo).connect(pregas.gain);
  fonte.connect(filtro).connect(abafa).connect(pregas).connect(g);
  g.connect(saida);
  const mol = c.createGain();
  mol.gain.value = 0.25;
  g.connect(mol).connect(eco);
  fonte.start(t, Math.random()); fonte.stop(t + dur + 0.05);
  tremor.start(t); tremor.stop(t + dur + 0.05);
}

// ---------------------------------------------------------------- os sons

const SONS = {
  // um acorde de lá maior que surge aos poucos, de baixo para cima, com um brilho agudo que sobe por cima
  abertura(c) {
    const t = c.currentTime + 0.02;
    nota(c, { t, freq: 110, pico: 0.22, ataque: 1.2, fim: 3.6, eco: 0.4 });
    [220, 329.63, 440, 554.37, 659.25, 880].forEach((freq, i) => {
      nota(c, { t: t + i * 0.13, freq, pico: 0.09, ataque: 0.9, fim: 3.4 - i * 0.15, eco: 0.7 });
      nota(c, { t: t + i * 0.13, freq, tipo: 'triangle', pico: 0.035, ataque: 0.9, fim: 3.2 - i * 0.15, eco: 0.8, desafina: 6 });
    });
    nota(c, { t: t + 0.5, freq: 1760, ate: 2637, pico: 0.03, ataque: 0.8, fim: 2.6, eco: 0.9 });
  },
  cortinaFecha(c) { tecido(c, { dur: 0.62, de: 380, para: 1500, pico: 0.5 }); },
  cortinaAbre(c) { tecido(c, { dur: 0.85, de: 1500, para: 320, pico: 0.45 }); },
  // dois toques de cristal
  oraculo(c) {
    const t = c.currentTime + 0.01;
    nota(c, { t, freq: 1318.5, pico: 0.12, ataque: 0.005, fim: 1.0, eco: 0.7 });
    nota(c, { t: t + 0.08, freq: 1975.5, pico: 0.09, ataque: 0.005, fim: 1.1, eco: 0.8 });
  },
  // um sino: a fundamental e os parciais desafinados de um sino de verdade, e um segundo sino mais alto e baixinho
  resposta(c) {
    const t = c.currentTime + 0.01;
    [[1, 0.2, 2.6], [2, 0.07, 1.6], [2.76, 0.09, 1.3], [5.4, 0.035, 0.7]].forEach(([razao, pico, fim]) =>
      nota(c, { t, freq: 523.25 * razao, pico, ataque: 0.004, fim, eco: 0.6 }));
    [[1, 0.09, 2.2], [2.76, 0.04, 1.1]].forEach(([razao, pico, fim]) =>
      nota(c, { t: t + 0.2, freq: 783.99 * razao, pico, ataque: 0.004, fim, eco: 0.7 }));
  },
  // um tom grave que desce e se abafa: a pupila foge
  vazio(c) {
    const t = c.currentTime + 0.01;
    nota(c, { t, freq: 196, ate: 98, pico: 0.22, ataque: 0.03, fim: 1.4, eco: 0.5 });
    nota(c, { t, freq: 293.66, ate: 146.83, tipo: 'triangle', pico: 0.05, ataque: 0.03, fim: 1.1, eco: 0.6 });
  },
};
