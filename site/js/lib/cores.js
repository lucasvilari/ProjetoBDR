// Cores do Olho do Povo. A urna dá o corpo (bege, teclas, visor) e as cores de resultado
// (CONFIRMA verde para vitória, CORRIGE laranja para derrota). A ideologia tem cores só suas:
// esquerda carmim, centro bege, direita azul; não são usadas para mais nada.

export const COR = {
  urna: '#e8dcc4', sombra: '#d8c9a9', visor: '#faf7ef', tecla: '#22201c',
  vitoria: '#00a651', derrota: '#f26522',
  esquerda: '#a3182f', centro: '#ddd0b4', direita: '#1f4fa3',
  esquerdaTexto: '#8a1426', direitaTexto: '#1f4fa3',
  semDado: '#9a8f7a',
};

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const hex = cs => `#${cs.map(c => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
const mistura = (a, b, t) => hex(rgb(a).map((c, i) => c + (rgb(b)[i] - c) * t));

/** Cor de uma posição ideológica. Especialistas: nota de 0 a 10, com o degradê entre 3 (esquerda)
 *  e 8 (direita) e centro em 5, onde estão quase todos os partidos. Câmara: −100 a +100, centro em 0. */
export function corIdeologia(nota, escala = 'especialistas') {
  if (nota == null || Number.isNaN(nota)) return COR.semDado;
  const [min, centro, max] = escala === 'camara' ? [-100, 0, 100] : [3, 5, 8];
  if (nota <= min) return COR.esquerda;
  if (nota >= max) return COR.direita;
  if (nota === centro) return COR.centro;
  return nota < centro
    ? mistura(COR.esquerda, COR.centro, (nota - min) / (centro - min))
    : mistura(COR.centro, COR.direita, (nota - centro) / (max - centro));
}

/** Razão de contraste da WCAG entre duas cores em hexadecimal. */
export function contraste(a, b) {
  const luz = h => {
    const [r, g, bl] = rgb(h).map(c => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [luz(a), luz(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
