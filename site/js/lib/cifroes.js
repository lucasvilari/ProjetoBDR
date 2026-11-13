// As faixas de dinheiro público da pergunta 8 (os dados vêm em meios cifrões, fatias de 5% da receita) e as faixas de
// patrimônio da pergunta 2.

/** A faixa de patrimônio de um candidato, com os mesmos cortes da consulta do gerador
 *  (sem bens, até 100 mil, até 500 mil, até 1 milhão, até 5 milhões, acima de 5 milhões). */
export function faixaDePatrimonio(valor) {
  const v = Number(valor) || 0;
  if (v <= 0) return 0;
  return [100_000, 500_000, 1_000_000, 5_000_000].filter(c => v >= c).length + 1;
}


/** A faixa de 10% de uma parcela de dinheiro público (0 a 100): 0 (menos de 10%) a 9 (90% a menos de 100%), e 10 para a
 *  campanha toda pública. Os mesmos cortes do meio cifrão do gerador, de dois em dois. */
export function faixaDaParcela(pct) {
  if (pct == null) return null;
  const meio = Math.min(20, Math.floor((20 * pct) / 100));
  return meio === 20 ? 10 : Math.floor(meio / 2);
}

/** Pergunta 8: os candidatos e os eleitos de cada faixa de dinheiro público, cada faixa só com quem está nela.
 *  `fatias`: [{meio_cifrao, candidatos, eleitos}]; devolve as 11 faixas, mesmo as vazias. */
export function porFaixa(fatias) {
  const faixas = Array.from({ length: 11 }, (_, faixa) => ({ faixa, de: faixa * 10, ate: Math.min(100, faixa * 10 + 10), candidatos: 0, eleitos: 0, taxa: null }));
  for (const f of fatias) {
    const x = faixas[f.meio_cifrao === 20 ? 10 : Math.floor(f.meio_cifrao / 2)];
    x.candidatos += f.candidatos; x.eleitos += f.eleitos;
  }
  for (const x of faixas) if (x.candidatos) x.taxa = (100 * x.eleitos) / x.candidatos;
  return faixas;
}
