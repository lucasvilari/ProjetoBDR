// Endereços antigos do site (mapa, cadeiras, partido, político) e a página nova de cada um, com o recorte junto,
// para não quebrar links já compartilhados.

const PERGUNTA_DO_MAPA = { custo: 'pergunta-1', patrimonio: 'pergunta-2', dependencia: 'pergunta-8', vies: 'pergunta-7' };

const comHash = (pagina, params) => `${pagina}.html${[...params].length ? `#${params}` : ''}`;

/** O endereço novo de uma página antiga, a partir do hash que ela recebeu. */
export function destinoDe(pagina, hash) {
  const bruto = hash.replace(/^#/, '');
  if (pagina === 'mapa') {
    const p = new URLSearchParams(bruto);
    const destino = PERGUNTA_DO_MAPA[p.get('pergunta')] ?? 'pergunta-1';
    p.delete('pergunta');
    return comHash(destino, p);
  }
  if (pagina === 'cadeiras') {
    const p = new URLSearchParams(bruto);
    const onde = p.get('onde');
    p.delete('onde');
    if (onde && onde !== 'BR') p.set('uf', onde);
    // o município vinha depois do lugar: refaz a ordem para mun ficar no fim, como nas páginas novas
    const mun = p.get('mun');
    if (mun) { p.delete('mun'); p.set('mun', mun); }
    return comHash('pergunta-1', p);
  }
  if (pagina === 'partido') {
    const sigla = decodeURIComponent(bruto);
    return comHash('pergunta-7', new URLSearchParams(sigla ? { partido: sigla } : {}));
  }
  return /^\d+$/.test(bruto) ? `pergunta-10.html#${bruto}` : 'pergunta-10.html';
}
