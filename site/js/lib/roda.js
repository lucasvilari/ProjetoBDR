// Geometria da roda do oráculo: as perguntas sobre um círculo em volta do olho.

/** n posições igualmente espaçadas num círculo, a primeira no alto e as demais em sentido horário. */
export function posicoesNaRoda(n, raio, cx, cy) {
  return Array.from({ length: n }, (_, i) => {
    const angulo = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return { x: cx + raio * Math.cos(angulo), y: cy + raio * Math.sin(angulo), angulo };
  });
}

/** Deslocamento da pupila para olhar na direção de um ângulo, dentro do alcance do olho
 *  (mais largo que alto, como um olho de verdade). */
export function olharPara(angulo, alcanceX, alcanceY) {
  return { dx: Math.cos(angulo) * alcanceX, dy: Math.sin(angulo) * alcanceY };
}
