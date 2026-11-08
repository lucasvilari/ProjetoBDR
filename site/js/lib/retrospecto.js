// Funções puras da pergunta 11 (retrospecto do mandato): setor dominante, faixas por quantis e formatos.

export const SETORES = ['Agropecuária', 'Indústria', 'Serviços', 'Administração pública'];

/** Índice do maior valor, ignorando os ausentes; null se não há nenhum. */
export function indiceDoMaior(valores) {
  let melhor = null;
  valores.forEach((v, i) => { if (v != null && (melhor === null || v > valores[melhor])) melhor = i; });
  return melhor;
}

const quantil = (ordenados, p) => {
  const pos = (ordenados.length - 1) * p, i = Math.floor(pos);
  return ordenados[i] + (ordenados[Math.min(i + 1, ordenados.length - 1)] - ordenados[i]) * (pos - i);
};

/** Limites que dividem os valores em `n` faixas de tamanho parecido (n - 1 limites, crescentes e sem repetição). */
export function limitesPorQuantis(valores, n) {
  const v = valores.filter(x => x != null).sort((a, b) => a - b);
  if (!v.length) return [];
  const limites = [];
  for (let i = 1; i < n; i++) {
    const l = quantil(v, i / n);
    if (!limites.length || l > limites.at(-1)) limites.push(l);
  }
  return limites;
}

/** Limites simétricos em torno de zero para uma escala que diverge (seis faixas: três de cada lado). */
export function limitesDivergentes(valores) {
  const abs = valores.filter(x => x != null).map(Math.abs).sort((a, b) => a - b);
  if (!abs.length) return [];
  const a = quantil(abs, 0.4), b = quantil(abs, 0.8);
  return a > 0 && b > a ? [-b, -a, 0, a, b] : [];
}

/** Em qual faixa cai o valor: 0 se for menor que o 1º limite, e assim por diante. */
export function faixaDe(valor, limites) {
  let i = 0;
  while (i < limites.length && valor >= limites[i]) i++;
  return i;
}

/** Número em português, com sinal explícito quando `comSinal`: "+55,1", "−5,5", "20,0". */
export function numeroBr(v, casas = 1, comSinal = false) {
  if (v == null) return '—';
  const t = Math.abs(v).toFixed(casas).replace('.', ',');
  return `${v < 0 ? '−' : comSinal && v > 0 ? '+' : ''}${t}`;
}

/** Os anos de um mandato iniciado na eleição de `ano`: o prefeito e o governador tomam posse no ano seguinte. */
export const mandatoDe = ano => ({ de: ano + 1, ate: ano + 4 });
