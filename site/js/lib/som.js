// Partes puras dos efeitos sonoros: a preferência do leitor (ligado ou desligado), quando mostrar a tela "toque para
// entrar na cabine" e quando a resposta do oráculo é a recusa das névoas. Os sons ficam em js/som.js.

const CHAVE = 'som';

/** O som está ligado? Começa ligado; sem armazenamento (ou com ele bloqueado), também. */
export function somLigado(armazenamento) {
  try { return armazenamento?.getItem(CHAVE) !== 'desligado'; } catch { return true; }
}

/** Guarda a escolha do leitor; sem armazenamento, a escolha vale só até sair da página. */
export function guardaSom(armazenamento, ligado) {
  try { armazenamento?.setItem(CHAVE, ligado ? 'ligado' : 'desligado'); } catch { /* sem armazenamento */ }
}

/** A tela de toque só existe para destravar o som da abertura: sem abertura ou sem som, não aparece. */
export const mostraPortao = ({ abertura, som }) => abertura && som;

const NEVOAS = 'as nevoas';
const sem = t => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trimStart();

/** A resposta (até onde chegou) é a recusa das névoas? true, false, ou null se ainda é cedo para saber. */
export function ehRecusa(texto) {
  const t = sem(texto);
  if (t.startsWith(NEVOAS)) return true;
  return NEVOAS.startsWith(t) ? null : false;
}
