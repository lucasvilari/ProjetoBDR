// A rua da campanha (pergunta 9): os desenhos dos objetos e a cena. Cada desenho ocupa uma caixa de 120 × 120
// com o pé no centro de baixo (60, 120); a cena o escala para que a área acompanhe o valor gasto.
import { OBJETOS } from './lib/propaganda.js?v=20261020';

const T = '#22201c', V = '#faf7ef', S = '#d8c9a9', M = '#b3a88f';
const contorno = `stroke="${T}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;

export const DESENHOS = {
  comite: `
    <rect x="10" y="30" width="100" height="90" fill="${S}" ${contorno}/>
    <path d="M4 32 L60 6 L116 32 Z" fill="${M}" ${contorno}/>
    <rect x="20" y="40" width="80" height="18" fill="${V}" ${contorno}/>
    <text x="60" y="54" text-anchor="middle" font-size="12" font-weight="900" fill="${T}" font-family="Archivo, sans-serif">COMITÊ</text>
    <rect x="22" y="68" width="20" height="18" fill="${V}" ${contorno}/><rect x="78" y="68" width="20" height="18" fill="${V}" ${contorno}/>
    <rect x="48" y="84" width="24" height="36" fill="${M}" ${contorno}/><circle cx="67" cy="103" r="2" fill="${T}"/>`,
  santinhos: `
    <g transform="rotate(-12 40 90)"><rect x="18" y="58" width="44" height="60" rx="3" fill="${V}" ${contorno}/>
      <rect x="25" y="65" width="16" height="20" fill="${M}" stroke="${T}" stroke-width="2"/><path d="M25 94h30M25 102h22" ${contorno}/></g>
    <g transform="rotate(8 70 90)"><rect x="52" y="56" width="44" height="60" rx="3" fill="${V}" ${contorno}/>
      <rect x="59" y="63" width="16" height="20" fill="${S}" stroke="${T}" stroke-width="2"/><path d="M59 92h30M59 100h22" ${contorno}/></g>
    <g transform="rotate(-25 84 30)"><rect x="70" y="14" width="26" height="36" rx="2" fill="${V}" ${contorno}/><path d="M76 38h14" ${contorno}/></g>
    <g transform="rotate(20 30 30)"><rect x="18" y="18" width="24" height="32" rx="2" fill="${V}" ${contorno}/><path d="M23 40h12" ${contorno}/></g>`,
  adesivos: `
    <circle cx="48" cy="78" r="38" fill="${V}" ${contorno}/>
    <circle cx="48" cy="78" r="28" fill="none" stroke="${T}" stroke-width="2" stroke-dasharray="4 4"/>
    <text x="48" y="85" text-anchor="middle" font-size="20" font-weight="900" fill="${T}" font-family="Archivo, sans-serif">VOTE</text>
    <path d="M78 40 h30 v30 l-12 12 h-18 z" fill="${S}" ${contorno}/><path d="M96 82 v-12 h12" fill="${M}" ${contorno}/>`,
  celular: `
    <rect x="34" y="14" width="52" height="104" rx="9" fill="${T}"/>
    <rect x="39" y="24" width="42" height="80" rx="3" fill="${V}"/>
    <rect x="44" y="30" width="32" height="20" rx="2" fill="${S}" stroke="${T}" stroke-width="2"/>
    <path d="M44 58h32M44 66h24" ${contorno}/>
    <path d="M49 82 l6 -8 h6 v-6 a4 4 0 0 1 4 4 v4 h7 a3 3 0 0 1 3 3 l-3 10 h-23 z" fill="${M}" stroke="${T}" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="60" cy="110" r="3" fill="${V}"/>`,
  'tv-radio': `
    <path d="M30 50 L82 18" ${contorno}/><circle cx="82" cy="18" r="4" fill="${T}"/>
    <rect x="10" y="50" width="100" height="68" rx="10" fill="${S}" ${contorno}/>
    <circle cx="40" cy="84" r="20" fill="${V}" ${contorno}/>
    <circle cx="40" cy="84" r="9" fill="${M}" stroke="${T}" stroke-width="2"/>
    <rect x="68" y="64" width="32" height="14" rx="2" fill="${V}" ${contorno}/>
    <path d="M72 71h24" stroke="${T}" stroke-width="2"/><circle cx="76" cy="96" r="5" fill="${T}"/><circle cx="94" cy="96" r="5" fill="${T}"/>`,
  comicio: `
    <rect x="6" y="84" width="108" height="36" fill="${M}" ${contorno}/>
    <path d="M6 84h108" stroke="${T}" stroke-width="5"/>
    <path d="M60 84 V40" ${contorno}/><path d="M50 84 h20" ${contorno}/>
    <rect x="54" y="26" width="12" height="18" rx="6" fill="${T}"/>
    <rect x="12" y="40" width="22" height="44" fill="${T}"/><circle cx="23" cy="54" r="7" fill="${S}"/><circle cx="23" cy="72" r="5" fill="${S}"/>
    <rect x="86" y="40" width="22" height="44" fill="${T}"/><circle cx="97" cy="54" r="7" fill="${S}"/><circle cx="97" cy="72" r="5" fill="${S}"/>
    <path d="M36 32 q-6 -6 0 -12 M28 36 q-12 -10 0 -24 M84 32 q6 -6 0 -12 M92 36 q12 -10 0 -24" fill="none" ${contorno}/>`,
  militancia: `
    <path d="M30 118 l8 -34 l8 34 M38 84 v-28 M24 70 l14 -10 l14 10" fill="none" ${contorno}/><circle cx="38" cy="46" r="9" fill="${V}" ${contorno}/>
    <path d="M52 66 V8" ${contorno}/><path d="M52 10 h34 l-8 11 l8 11 h-34 z" fill="${V}" ${contorno}/>
    <path d="M74 118 l8 -34 l8 34 M82 84 v-28 M68 70 l14 -10 l14 10" fill="none" ${contorno}/><circle cx="82" cy="46" r="9" fill="${S}" ${contorno}/>
    <path d="M96 66 V22" ${contorno}/><path d="M96 24 h20 v18 h-20 z" fill="${M}" ${contorno}/>`,
  jornal: `
    <path d="M14 30 h76 v88 h-76 z" fill="${V}" ${contorno}/>
    <path d="M90 46 h16 v66 a6 6 0 0 1 -12 0 z" fill="${S}" ${contorno}/>
    <rect x="22" y="38" width="60" height="14" fill="${T}"/>
    <rect x="22" y="60" width="26" height="24" fill="${M}" stroke="${T}" stroke-width="2"/>
    <path d="M54 62h28M54 70h28M54 78h20M22 94h60M22 102h60M22 110h44" stroke="${T}" stroke-width="2.5"/>`,
  'carro-de-som': `
    <path d="M6 96 v-26 l18 -22 h56 l18 22 h16 v26 z" fill="${S}" ${contorno}/>
    <path d="M30 52 h44 l12 18 h-68 z" fill="${V}" ${contorno}/>
    <path d="M30 48 l-14 -22 h22 z M88 48 l14 -22 h-22 z" fill="${M}" ${contorno}/>
    <path d="M56 48 v-12" ${contorno}/>
    <circle cx="30" cy="104" r="12" fill="${T}"/><circle cx="30" cy="104" r="4" fill="${S}"/>
    <circle cx="90" cy="104" r="12" fill="${T}"/><circle cx="90" cy="104" r="4" fill="${S}"/>
    <path d="M2 18 q-6 6 0 12 M108 18 q6 6 0 12" fill="none" stroke="${T}" stroke-width="2.5"/>`,
};

export const CURTO = { santinhos: 'Santinhos', 'carro-de-som': 'Carro de som', adesivos: 'Adesivos', celular: 'Internet',
  'tv-radio': 'TV e rádio', comicio: 'Comícios', militancia: 'Militância', jornal: 'Jornais', comite: 'Comitê' };

// onde cada objeto fica na rua: x do centro e a linha do chão (a calçada, ou a pista para o carro de som)
const LUGAR = { comite: [92, 300], santinhos: [222, 300], adesivos: [336, 300], militancia: [452, 300], comicio: [578, 300],
  celular: [700, 300], jornal: [806, 300], 'tv-radio': [904, 300], 'carro-de-som': [520, 368] };
const LARGURA = 980, ALTURA = 380, TAMANHO = 124;

const COMITE_MAX = 1.3;   // o comitê pode passar do tamanho cheio até aqui; além disso, fica fora de escala

/** A cena: `valores` é {objeto: reais}; devolve o SVG. Cada objeto escala com a raiz do valor (área ∝ valor), e o
 *  maior objeto de propaganda tem o tamanho cheio. O comitê (bastidores), que costuma ser o maior gasto, usa a
 *  mesma escala até um limite e, acima dele, aparece marcado como fora de escala. Objeto sem gasto fica apagado. */
export function cenaDaRua(valores, formataValor) {
  const total = Object.values(valores).reduce((s, v) => s + v, 0);
  const maior = Math.max(...Object.entries(valores).filter(([id]) => id !== 'comite').map(([, v]) => v), 1);
  const ordem = ['comite', 'santinhos', 'adesivos', 'militancia', 'comicio', 'celular', 'jornal', 'tv-radio', 'carro-de-som'];
  const objetos = ordem.map(id => {
    const v = valores[id] ?? 0;
    const bruta = Math.sqrt(v / maior);
    const fora = id === 'comite' && bruta > COMITE_MAX;
    const escala = v > 0 ? Math.max(0.14, Math.min(bruta, COMITE_MAX)) : 0.38;
    const [x, chao] = LUGAR[id];
    const pct = total ? (100 * v) / total : 0;
    const nome = OBJETOS.find(o => o.id === id).nome;
    const rotulo = `${nome}: ${formataValor(v)}${total ? `, ${String(pct.toFixed(1)).replace('.', ',')}% do total` : ''}`;
    const topo = chao - TAMANHO * escala;
    return `<g class="objeto-rua${v > 0 ? '' : ' sem-gasto'}" data-objeto="${id}" tabindex="0" role="img" aria-label="${rotulo}">
      <title>${rotulo}</title>
      <g transform="translate(${x - (TAMANHO * escala) / 2} ${topo}) scale(${(TAMANHO * escala) / 120})"><g class="objeto-desenho">${DESENHOS[id]}</g></g>
      <text class="rotulo-rua" x="${x}" y="${Math.max(16, topo - 20)}">${CURTO[id]}</text>
      <text class="valor-rua" x="${x}" y="${Math.max(30, topo - 6)}">${formataValor(v)}${fora ? ' · fora de escala' : ''}</text>
    </g>`;
  });
  return `<svg class="rua-svg" viewBox="0 0 ${LARGURA} ${ALTURA}" role="group" aria-label="A rua da campanha: cada objeto do tamanho do gasto">
    <rect class="ceu" width="${LARGURA}" height="300"/>
    <path class="predios" d="M0 300 V210 h70 v-40 h60 v60 h90 v-80 h70 v100 h120 v-60 h80 v-50 h90 v110 h100 v-70 h80 v40 h120 v-30 h100 V300 Z"/>
    <rect class="calcada" y="300" width="${LARGURA}" height="22"/>
    <rect class="pista" y="322" width="${LARGURA}" height="58"/>
    <path class="faixa-pista" d="M0 352 H${LARGURA}"/>
    ${objetos.join('')}
  </svg>`;
}
