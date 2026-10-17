// O plenário em SVG: a versão sem 3D (aparelho sem WebGL ou movimento reduzido), com as mesmas
// informações da cena 3D. Cada bolinha é uma cadeira, ou um grupo delas quando são milhares.
import { formata } from './comum.js?v=20261022';

/** Desenha o plenário em `alvo`. dados: { total, passo, geo: {pontos, raio, interno}, lista, donos, ocupantes, cores }.
 *  Clicar (ou Enter) numa cadeira chama aoEscolher({ assento, partido, candidato }). Devolve { destroi, destaca }. */
export function montaPlenario2D(alvo, dados, aoEscolher) {
  const { total, passo, geo: { pontos, raio, interno }, lista, donos, ocupantes, cores } = dados;
  const E = 100;                         // unidades do desenho por raio
  const um = pontos.length === 1;
  const [L, topo, base] = um ? [1.6 * E, -0.8 * E, -0.1 * E] : [1.12 * E, -1.12 * E, 0.2 * E];
  const circulos = pontos.map((pt, k) => {
    const i = donos?.[k];
    const p = i == null ? null : lista[i];
    const quem = ocupantes?.[k];
    const titulo = quem ? `${quem.nome ?? 'candidato de outro estado'} (${quem.sigla})` : p ? `${p.sigla}: ${p.n} ${p.n === 1 ? 'cadeira' : 'cadeiras'}` : 'cadeira sem eleito registrado';
    return `<circle cx="${(pt.x * E).toFixed(2)}" cy="${(-pt.y * E).toFixed(2)}" r="${(raio * E).toFixed(2)}" data-k="${k}" data-p="${i ?? ''}"
      fill="${p ? cores[i] : 'var(--visor)'}" tabindex="${pontos.length <= 120 ? 0 : -1}"><title>${titulo}</title></circle>`;
  }).join('');
  const fonte = Math.min(26, (1.7 * (interno - raio) * E) / (0.6 * formata.numero(total).length)).toFixed(1);
  alvo.innerHTML = `<svg viewBox="${-L} ${topo} ${2 * L} ${base - topo}" class="plenario-svg${raio < 0.02 ? ' miudo' : ''}"
      role="img" aria-label="${total} ${total === 1 ? 'cadeira' : 'cadeiras'}${lista ? ', coloridas pelo partido' : ''}">
    ${circulos}
    ${um ? '' : `<text x="0" y="${-0.06 * E}" class="plenario-total" font-size="${fonte}">${formata.numero(total)}</text>
    <text x="0" y="${0.1 * E}" class="plenario-rotulo">${total === 1 ? 'cadeira' : 'cadeiras'}</text>
    ${passo > 1 ? `<text x="0" y="${0.17 * E}" class="plenario-escala">cada bolinha ≈ ${passo} cadeiras</text>` : ''}`}
  </svg>`;
  const svg = alvo.querySelector('svg');
  const escolhe = el => {
    const k = Number(el.dataset.k);
    svg.querySelectorAll('circle.escolhida').forEach(c => c.classList.remove('escolhida'));
    el.classList.add('escolhida');
    aoEscolher({ assento: k, partido: donos?.[k] ?? null, candidato: ocupantes?.[k] ?? null });
  };
  const aoClicar = e => { const c = e.target.closest('circle'); if (c) escolhe(c); };
  const aoTecla = e => { const c = e.target.closest('circle'); if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); escolhe(c); } };
  svg.addEventListener('click', aoClicar);
  svg.addEventListener('keydown', aoTecla);
  return {
    destroi() { alvo.innerHTML = ''; },
    destaca(i) {
      svg.classList.toggle('destacando', i != null);
      svg.querySelectorAll('circle').forEach(c => c.classList.toggle('ativo', c.dataset.p === String(i)));
    },
  };
}
