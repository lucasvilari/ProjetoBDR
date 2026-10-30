// O retrato de uma página: o que ela mostra agora (o recorte escolhido, os números calculados para ele e o que o
// leitor abriu ou destacou), no formato que o oráculo lê. Cada página monta o seu (js/oraculo.js guarda como).

/** O retrato em texto simples. `retrato`: { numero, pergunta, recorte, secoes: [{ titulo, linhas: [[rótulo, valor]] }] }.
 *  Linhas sem valor e seções sem linhas ficam de fora; uma linha com rótulo nulo é só o valor. */
export function retratoEmTexto({ numero, pergunta, recorte, secoes = [] }) {
  const partes = [`Pergunta ${numero}: ${pergunta}`, `Recorte: ${recorte}`];
  for (const { titulo, linhas } of secoes) {
    const validas = linhas.filter(([, valor]) => valor != null && valor !== '');
    if (!validas.length) continue;
    partes.push('', titulo, ...validas.map(([rotulo, valor]) => (rotulo == null ? `- ${valor}` : `- ${rotulo}: ${valor}`)));
  }
  return partes.join('\n');
}

const umaCasa = v => String(Math.round(v * 10) / 10).replace('.', ',');
const vezes = r => (r >= 10 ? String(Math.round(r)) : umaCasa(r));

/** Quanto `a` é de `b`, em palavras, para o retrato levar a comparação pronta (o modelo do oráculo erra contas):
 *  "cerca de 51 vezes", "cerca de 9% a mais", "cerca de metade (0,52 vez)", "praticamente igual (3% a menos)".
 *  Devolve null quando não há como comparar. */
export function comparacao(a, b) {
  if (a == null || b == null || !(b > 0) || !(a >= 0)) return null;
  const r = a / b;
  const pct = Math.round(Math.abs(r - 1) * 100);
  if (r >= 1.5) return `cerca de ${vezes(r)} vezes`;
  if (r >= 1.05) return `cerca de ${pct}% a mais`;
  if (r > 0.95) return `praticamente igual (${pct}% a ${r >= 1 ? 'mais' : 'menos'})`;
  if (r >= 0.56) return `cerca de ${pct}% a menos`;
  if (r >= 0.44) return `cerca de metade (${String(Math.round(r * 100) / 100).replace('.', ',')} vez)`;
  if (r > 0) return `cerca de ${vezes(1 / r)} vezes menor`;
  return 'zero';
}
