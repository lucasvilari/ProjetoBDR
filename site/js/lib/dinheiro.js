// Dinheiro ao lado dos votos: custo por voto e a força da relação entre dinheiro e votos.

/** Reais por voto; sem valor ou sem votos não há custo por voto. */
export function custoPorVoto(valor, votos) {
  if (valor == null || votos == null || votos <= 0) return null;
  return valor / votos;
}

/** Postos de 1 a n, com a média dos postos para valores empatados. */
function postos(valores) {
  const ordem = valores.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const p = new Array(valores.length);
  for (let i = 0; i < ordem.length;) {
    let j = i;
    while (j + 1 < ordem.length && ordem[j + 1][0] === ordem[i][0]) j += 1;
    for (let k = i; k <= j; k += 1) p[ordem[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return p;
}

/** Correlação de Spearman (a de Pearson sobre os postos); null com menos de três pares ou sem variação. */
export function spearman(pares) {
  if (pares.length < 3) return null;
  const x = postos(pares.map(p => p[0])), y = postos(pares.map(p => p[1]));
  const n = pares.length, mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i += 1) {
    sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2;
  }
  if (!sxx || !syy) return null;
  return Math.round((sxy / Math.sqrt(sxx * syy)) * 1e9) / 1e9;
}

/** A força de uma correlação em palavras, sem dizer o que ela relaciona. */
export function forcaDaRelacao(r) {
  if (r == null) return 'dados insuficientes';
  return Math.abs(r) < 0.1 ? 'quase nenhuma relação' : Math.abs(r) < 0.3 ? 'relação fraca'
    : Math.abs(r) < 0.6 ? 'relação moderada' : 'relação forte';
}

/** A correlação entre dinheiro e votos em palavras, para quem não lê estatística. */
export function descreveCorrelacao(r) {
  if (r == null) return 'dados insuficientes';
  const forca = forcaDaRelacao(r);
  if (Math.abs(r) < 0.1) return forca;
  return `${r > 0 ? 'mais dinheiro, mais votos' : 'mais dinheiro, menos votos'}: ${forca}`;
}

const umaCasa = v => String(Math.round(v * 10) / 10).replace('.', ',');

/** Reais abreviados, para números grandes que não caberiam inteiros: R$ 131,3 mi, R$ 1,5 bi, R$ 850 mil. */
export function abreviaReais(v) {
  if (v >= 1e9) return `R$ ${umaCasa(v / 1e9)} bi`;
  if (v >= 1e6) return `R$ ${umaCasa(v / 1e6)} mi`;
  if (v >= 1e3) return `R$ ${Math.round(v / 1e3)} mil`;
  return `R$ ${Math.round(v)}`;
}
