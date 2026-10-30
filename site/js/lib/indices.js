// Pergunta 3: os municípios em cinco grupos de mesmo tamanho por um índice (do 20% mais baixo ao 20% mais alto), com a
// média de outra medida em cada grupo. Serve para ver se o voto ideológico muda com a riqueza, o IDHM etc.

/** Os pares [x, y] com os dois valores, ordenados por x e divididos em cinco grupos de tamanho quase igual, como o
 *  NTILE(5) do banco (os primeiros grupos levam um a mais quando a divisão não é exata). Cada grupo: { de, ate (o
 *  menor e o maior x), n, media (a média de y), pares }. */
export function quintis(pares) {
  const validos = pares.filter(([x, y]) => x != null && y != null).sort((a, b) => a[0] - b[0]);
  const n = validos.length;
  if (n < 5) return [];
  const tamanho = k => Math.floor(n / 5) + (k < n % 5 ? 1 : 0);
  let inicio = 0;
  return Array.from({ length: 5 }, (_, k) => {
    const grupo = validos.slice(inicio, (inicio += tamanho(k)));
    return { de: grupo[0][0], ate: grupo.at(-1)[0], n: grupo.length, media: grupo.reduce((s, p) => s + p[1], 0) / grupo.length, pares: grupo };
  });
}

/** Os limites que dividem os valores (sem os vazios) em `partes` grupos de tamanho quase igual: o primeiro valor de
 *  cada grupo a partir do segundo. Com eles, o mapa pinta cada lugar pelo grupo em que cai. */
export function cortes(valores, partes) {
  const v = valores.filter(x => x != null).sort((a, b) => a - b);
  if (v.length < partes) return [];
  return Array.from({ length: partes - 1 }, (_, k) => v[Math.round(((k + 1) * v.length) / partes)]);
}

/** Em qual grupo (0 a cortes.length) o valor cai; null sem valor. */
export const faixa = (v, limites) => (v == null ? null : limites.filter(c => v >= c).length);

/** A posição de cada valor entre os outros, de 0 (o menor) a 1 (o maior); valores iguais ficam com a posição média e
 *  os vazios, vazios. É a altura de cada lugar no mapa em relevo: a ordem, não a distância, para um município muito rico
 *  não achatar todos os outros. */
export function posicaoRelativa(valores) {
  const ordem = valores.map((v, i) => [v, i]).filter(([v]) => v != null).sort((a, b) => a[0] - b[0]);
  const saida = valores.map(() => null);
  const n = ordem.length;
  for (let a = 0; a < n;) {
    let b = a;
    while (b + 1 < n && ordem[b + 1][0] === ordem[a][0]) b += 1;
    const pos = n === 1 ? 0.5 : (a + b) / 2 / (n - 1);
    for (let k = a; k <= b; k += 1) saida[ordem[k][1]] = pos;
    a = b + 1;
  }
  return saida;
}
