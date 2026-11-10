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

/** Posições (em px, numa roda quadrada de lado `lado`) para botões de tamanhos [{w, h}] num círculo de `raio`, sem que
 *  se encostem: cada botão ocupa, ao longo do círculo, a sua medida na direção dele (a largura no alto e no pé, a altura
 *  nas laterais), então os ângulos se repartem por essas medidas, e não por igual. A primeira fica no alto e as demais
 *  seguem em sentido horário; nenhuma sai da largura da roda. */
export function posicoesPorTamanho(tamanhos, raio, lado) {
  const n = tamanhos.length, c = lado / 2;
  const medida = (t, a) => t.w * Math.abs(Math.sin(a)) + t.h * Math.abs(Math.cos(a));
  let angulos = tamanhos.map((_, i) => -Math.PI / 2 + (2 * Math.PI * i) / n);
  for (let passo = 0; passo < 30; passo++) {
    const m = tamanhos.map((t, i) => medida(t, angulos[i]));
    const vaos = m.map((x, i) => (x + m[(i + 1) % n]) / 2);
    const total = vaos.reduce((s, v) => s + v, 0);
    const novos = [-Math.PI / 2];
    for (let i = 1; i < n; i++) novos.push(novos[i - 1] + (2 * Math.PI * vaos[i - 1]) / total);
    // a primeira fica no alto e o resto se acomoda em volta dela (meio passo de cada vez, para não oscilar)
    angulos = angulos.map((a, i) => (a + novos[i]) / 2);
  }
  return angulos.map((angulo, i) => {
    const meia = tamanhos[i].w / 2;
    const x = Math.min(lado - meia, Math.max(meia, c + raio * Math.cos(angulo)));
    return { x, y: c + raio * Math.sin(angulo), angulo };
  });
}
