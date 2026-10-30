// A rua da campanha (pergunta 9): os desenhos dos objetos e a cena. Cada desenho ocupa uma caixa de 120 × 120
// com o pé no centro de baixo (60, 120); a cena o escala para que a área acompanhe o valor gasto.
import { OBJETOS } from './lib/propaganda.js?v=20261156';

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
  // cada santinho mexe sozinho: um balança, e os pequenos (e mais dois escondidos) caem do céu
  santinhos: `
    <g class="pa pa-balanca"><g transform="rotate(-12 40 90)"><rect x="18" y="58" width="44" height="60" rx="3" fill="${V}" ${contorno}/>
      <rect x="25" y="65" width="16" height="20" fill="${M}" stroke="${T}" stroke-width="2"/><path d="M25 94h30M25 102h22" ${contorno}/></g></g>
    <g transform="rotate(8 70 90)"><rect x="52" y="56" width="44" height="60" rx="3" fill="${V}" ${contorno}/>
      <rect x="59" y="63" width="16" height="20" fill="${S}" stroke="${T}" stroke-width="2"/><path d="M59 92h30M59 100h22" ${contorno}/></g>
    <g class="pa pa-cai" style="--x:-14px;--giro:200deg;--atraso:0s"><g transform="rotate(-25 84 30)"><rect x="70" y="14" width="26" height="36" rx="2" fill="${V}" ${contorno}/><path d="M76 38h14" ${contorno}/></g></g>
    <g class="pa pa-cai" style="--x:12px;--giro:-160deg;--atraso:0.5s"><g transform="rotate(20 30 30)"><rect x="18" y="18" width="24" height="32" rx="2" fill="${V}" ${contorno}/><path d="M23 40h12" ${contorno}/></g></g>
    <g class="pa pa-extra pa-cai" style="--x:-8px;--giro:240deg;--atraso:0.9s"><g transform="rotate(10 60 0)"><rect x="48" y="-16" width="22" height="30" rx="2" fill="${V}" ${contorno}/><path d="M53 4h12" ${contorno}/></g></g>
    <g class="pa pa-extra pa-cai" style="--x:16px;--giro:-220deg;--atraso:1.3s"><g transform="rotate(-15 100 -4)"><rect x="90" y="-20" width="20" height="28" rx="2" fill="${V}" ${contorno}/><path d="M94 -2h12" ${contorno}/></g></g>`,
  // o adesivo redondo descola pela borda e cola de novo; o quadrado levanta a ponta dobrada
  adesivos: `
    <ellipse class="pa pa-sombra-adesivo" cx="52" cy="82" rx="36" ry="36" fill="${M}" opacity="0"/>
    <g class="pa pa-descola">
      <circle cx="48" cy="78" r="38" fill="${V}" ${contorno}/>
      <circle cx="48" cy="78" r="28" fill="none" stroke="${T}" stroke-width="2" stroke-dasharray="4 4"/>
      <text x="48" y="85" text-anchor="middle" font-size="20" font-weight="900" fill="${T}" font-family="Archivo, sans-serif">VOTE</text></g>
    <g class="pa pa-levanta"><path d="M78 40 h30 v30 l-12 12 h-18 z" fill="${S}" ${contorno}/><path d="M96 82 v-12 h12" fill="${M}" ${contorno}/></g>`,
  // o celular vibra e as notificações chegam: a bolinha com o número e os balões subindo da tela
  celular: `
    <g class="pa pa-vibra">
      <rect x="34" y="14" width="52" height="104" rx="9" fill="${T}"/>
      <rect x="39" y="24" width="42" height="80" rx="3" fill="${V}"/>
      <rect x="44" y="30" width="32" height="20" rx="2" fill="${S}" stroke="${T}" stroke-width="2"/>
      <path d="M44 58h32M44 66h24" ${contorno}/>
      <path d="M49 82 l6 -8 h6 v-6 a4 4 0 0 1 4 4 v4 h7 a3 3 0 0 1 3 3 l-3 10 h-23 z" fill="${M}" stroke="${T}" stroke-width="2.5" stroke-linejoin="round"/>
      <circle cx="60" cy="110" r="3" fill="${V}"/></g>
    <g class="pa pa-extra pa-balao" style="--atraso:0s"><rect x="8" y="30" width="34" height="16" rx="8" fill="${V}" ${contorno}/><path d="M15 38h18" stroke="${T}" stroke-width="2.5"/></g>
    <g class="pa pa-extra pa-balao" style="--atraso:0.6s"><rect x="78" y="44" width="34" height="16" rx="8" fill="${V}" ${contorno}/><path d="M85 52h14" stroke="${T}" stroke-width="2.5"/></g>
    <g class="pa pa-extra pa-badge"><circle cx="86" cy="16" r="10" fill="#f26522" stroke="${T}" stroke-width="2.5"/>
      <text x="86" y="21" text-anchor="middle" font-size="13" font-weight="900" fill="${V}" font-family="Archivo, sans-serif">3</text></g>`,
  // a TV e o rádio soltam notas musicais
  'tv-radio': `
    <path d="M30 50 L82 18" ${contorno}/><circle cx="82" cy="18" r="4" fill="${T}"/>
    <rect x="10" y="50" width="100" height="68" rx="10" fill="${S}" ${contorno}/>
    <circle class="pa pa-alto" cx="40" cy="84" r="20" fill="${V}" ${contorno}/>
    <circle cx="40" cy="84" r="9" fill="${M}" stroke="${T}" stroke-width="2"/>
    <rect x="68" y="64" width="32" height="14" rx="2" fill="${V}" ${contorno}/>
    <path d="M72 71h24" stroke="${T}" stroke-width="2"/><circle cx="76" cy="96" r="5" fill="${T}"/><circle cx="94" cy="96" r="5" fill="${T}"/>
    ${[['♪', 30, 0, -18], ['♫', 48, 0.45, 14], ['♪', 22, 0.9, 8], ['♫', 40, 1.35, -12]].map(([n, x, a, d]) => `<text class="pa pa-extra pa-nota" x="${x}" y="58" font-size="24" font-weight="700" fill="${T}" style="--atraso:${a}s;--x:${d}px">${n}</text>`).join('')}`,
  // o comício solta confete do palco
  comicio: `
    <rect x="6" y="84" width="108" height="36" fill="${M}" ${contorno}/>
    <path d="M6 84h108" stroke="${T}" stroke-width="5"/>
    <path d="M60 84 V40" ${contorno}/><path d="M50 84 h20" ${contorno}/>
    <rect x="54" y="26" width="12" height="18" rx="6" fill="${T}"/>
    <rect x="12" y="40" width="22" height="44" fill="${T}"/><circle cx="23" cy="54" r="7" fill="${S}"/><circle cx="23" cy="72" r="5" fill="${S}"/>
    <rect x="86" y="40" width="22" height="44" fill="${T}"/><circle cx="97" cy="54" r="7" fill="${S}"/><circle cx="97" cy="72" r="5" fill="${S}"/>
    <path d="M36 32 q-6 -6 0 -12 M28 36 q-12 -10 0 -24 M84 32 q6 -6 0 -12 M92 36 q12 -10 0 -24" fill="none" ${contorno}/>
    ${[[-46, -70, '#f26522', 0], [-20, -92, '#00a651', 0.1], [8, -100, '#1f4fa3', 0.05], [30, -84, '#e8b730', 0.15], [52, -66, '#a3182f', 0.08],
      [-36, -50, '#e8b730', 0.5], [-8, -78, '#f26522', 0.55], [18, -88, '#a3182f', 0.6], [44, -56, '#00a651', 0.52], [0, -60, '#1f4fa3', 0.62]]
      .map(([dx, dy, cor, a], i) => `<rect class="pa pa-extra pa-confete" x="${57 + (i % 3)}" y="34" width="${i % 2 ? 6 : 4}" height="${i % 2 ? 4 : 8}" fill="${cor}" style="--dx:${dx}px;--dy:${dy}px;--atraso:${a}s;--giro:${(i % 2 ? 1 : -1) * (180 + i * 40)}deg"/>`).join('')}`,
  // a militância: cada um acena com um braço e, com o outro, ergue e abaixa a bandeira, que tremula
  militancia: `
    <path d="M30 118 l8 -34 l8 34 M38 84 v-28" fill="none" ${contorno}/><circle cx="38" cy="46" r="9" fill="${V}" ${contorno}/>
    <path class="pa pa-acena" d="M38 60 l-14 10" fill="none" ${contorno}/>
    <g class="pa pa-ergue"><path d="M38 60 l14 10" fill="none" ${contorno}/></g>
    <g class="pa pa-bandeira"><path d="M52 66 V8" ${contorno}/><path class="pa pa-pano" d="M52 10 h34 l-8 11 l8 11 h-34 z" fill="${V}" ${contorno}/></g>
    <path d="M74 118 l8 -34 l8 34 M82 84 v-28" fill="none" ${contorno}/><circle cx="82" cy="46" r="9" fill="${S}" ${contorno}/>
    <path class="pa pa-acena pa-depois" d="M82 60 l-14 10" fill="none" ${contorno}/>
    <g class="pa pa-ergue pa-depois"><path d="M82 60 l14 10" fill="none" ${contorno}/></g>
    <g class="pa pa-bandeira pa-depois"><path d="M96 66 V22" ${contorno}/><path class="pa pa-pano" d="M96 24 h20 v18 h-20 z" fill="${M}" ${contorno}/></g>`,
  // o jornal é folheado: uma página vira por cima da primeira
  jornal: `
    <path d="M14 30 h76 v88 h-76 z" fill="${V}" ${contorno}/>
    <path d="M90 46 h16 v66 a6 6 0 0 1 -12 0 z" fill="${S}" ${contorno}/>
    <rect x="22" y="38" width="60" height="14" fill="${T}"/>
    <rect x="22" y="60" width="26" height="24" fill="${M}" stroke="${T}" stroke-width="2"/>
    <path d="M54 62h28M54 70h28M54 78h20M22 94h60M22 102h60M22 110h44" stroke="${T}" stroke-width="2.5"/>
    <g class="pa pa-extra pa-pagina"><path d="M52 30 h38 v88 h-38 z" fill="${V}" ${contorno}/>
      <path d="M58 40h26M58 48h26M58 56h18M58 70h26M58 78h26M58 86h22M58 100h26M58 108h16" stroke="${T}" stroke-width="2.5"/></g>`,
  // o carro de som, com a caixa de som no teto: anda, as rodas giram, o corpo sacode, saem riscos de velocidade e,
  // da caixa, ondas de som e notas musicais
  'carro-de-som': `
    <path class="pa pa-extra pa-vento" d="M-26 62 h22 M-34 76 h28 M-22 90 h16" fill="none" ${contorno}/>
    <g class="pa pa-sacode">
      <path d="M6 96 v-26 l18 -22 h56 l18 22 h16 v26 z" fill="${S}" ${contorno}/>
      <path d="M30 52 h44 l12 18 h-68 z" fill="${V}" ${contorno}/>
      <rect x="34" y="22" width="44" height="26" rx="3" fill="${M}" ${contorno}/>
      ${[46, 66].map(x => `<g class="pa pa-cone"><circle cx="${x}" cy="35" r="8" fill="${T}"/><circle cx="${x}" cy="35" r="3" fill="${S}"/></g>`).join('')}
      ${[['M30 24 q-8 11 0 22', -1, 0], ['M22 18 q-12 17 0 34', -1, 0.25], ['M82 24 q8 11 0 22', 1, 0], ['M90 18 q12 17 0 34', 1, 0.25]]
        .map(([d, lado, a]) => `<path class="pa pa-extra pa-onda" d="${d}" fill="none" stroke="${T}" stroke-width="3" stroke-linecap="round" style="--lado:${lado};--atraso:${a}s"/>`).join('')}
      ${[['♪', 40, 0, -16], ['♫', 64, 0.6, 14], ['♪', 54, 1.2, 4]].map(([n, x, a, d]) => `<text class="pa pa-extra pa-nota" x="${x}" y="20" font-size="20" font-weight="700" fill="${T}" style="--atraso:${a}s;--x:${d}px">${n}</text>`).join('')}</g>
    ${[30, 90].map(x => `<g class="pa pa-roda"><circle cx="${x}" cy="104" r="12" fill="${T}"/>
      <path d="M${x} 95 v18 M${x - 9} 104 h18" stroke="${S}" stroke-width="2.5"/><circle cx="${x}" cy="104" r="4" fill="${S}"/></g>`).join('')}`,
};

export const CURTO = { santinhos: 'Santinhos', 'carro-de-som': 'Carro de som', adesivos: 'Adesivos', celular: 'Internet',
  'tv-radio': 'TV e rádio', comicio: 'Comícios', militancia: 'Militância', jornal: 'Jornais', comite: 'Comitê' };

// onde cada objeto fica na rua: x do centro e a linha do chão (a calçada, ou a pista para o carro de som)
const LUGAR = { comite: [92, 300], santinhos: [222, 300], adesivos: [336, 300], militancia: [452, 300], comicio: [578, 300],
  celular: [700, 300], jornal: [806, 300], 'tv-radio': [904, 300], 'carro-de-som': [520, 368] };
const LARGURA = 980, ALTURA = 380, TAMANHO = 124;
// as duas vistas da cena (viewBox): a rua de perto e, afastada, a rua embaixo com o céu de nuvens em cima
export const VISTAS = { rua: [0, 0, LARGURA, ALTURA], ceu: [-490, -400, 1960, 780] };
const CEU = { x0: -470, x1: 1450, y0: -285, y1: -25 };   // onde as nuvens cabem (abaixo da seta, acima dos prédios)

const COMITE_MAX = 1.3;   // o comitê pode passar do tamanho cheio até aqui; além disso, fica fora de escala

/** A cena: `valores` é {objeto: reais}; devolve o SVG. Cada objeto escala com a raiz do valor (área ∝ valor), e o
 *  maior objeto de propaganda tem o tamanho cheio. O comitê (bastidores), que costuma ser o maior gasto, usa a
 *  mesma escala até um limite e, acima dele, aparece marcado como fora de escala. Objeto sem gasto fica apagado. */
export function cenaDaRua(valores, formataValor, ceu = '') {
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
  // o céu, a calçada e a pista passam das bordas da rua, para a vista afastada (com as nuvens) não mostrar o vazio
  const [cx, cy, cw, ch] = VISTAS.ceu;
  return `<svg class="rua-svg" viewBox="${VISTAS.rua.join(' ')}" role="group" aria-label="A rua da campanha: cada objeto do tamanho do gasto">
    <rect class="ceu" x="${cx}" y="${cy}" width="${cw}" height="${300 - cy}"/>
    <path class="predios" d="M${cx} 300 V240 h80 v-50 h70 v70 h110 v-40 h90 v-30 h${-cx - 350} V300 Z"/>
    <path class="predios" d="M0 300 V210 h70 v-40 h60 v60 h90 v-80 h70 v100 h120 v-60 h80 v-50 h90 v110 h100 v-70 h80 v40 h120 v-30 h100 V300 Z"/>
    <path class="predios" d="M${LARGURA} 300 V230 h90 v-60 h80 v50 h110 v-40 h90 v70 h${cx + cw - LARGURA - 370} V300 Z"/>
    <rect class="calcada" x="${cx}" y="300" width="${cw}" height="22"/>
    <rect class="pista" x="${cx}" y="322" width="${cw}" height="${cy + ch - 322}"/>
    <path class="faixa-pista" d="M${cx} 352 H${cx + cw}"/>
    ${ceu}
    ${objetos.join('')}
  </svg>`;
}

// ---------------------------------------------------------------- o céu de palavras

/** O contorno de uma nuvem centrada em (0, 0): base reta com as pontas arredondadas e calombos em cima. */
function contornoDeNuvem(w, h) {
  const r = h / 2, x0 = -w / 2, x1 = w / 2, yb = h / 2, yt = -h / 2;
  const n = Math.max(2, Math.round((w - h) / (h * 0.8)));
  const passo = (w - h) / n;
  let d = `M${x0 + r} ${yb} L${x1 - r} ${yb} A${r} ${r} 0 0 0 ${x1 - r} ${yt}`;
  for (let i = 0; i < n; i++) {
    const de = x1 - r - i * passo, ate = de - passo;
    d += ` A${passo * 0.62} ${passo * 0.55} 0 0 0 ${ate.toFixed(1)} ${yt}`;
  }
  return `${d} A${r} ${r} 0 0 0 ${x0 + r} ${yb} Z`;
}

const soma = xs => xs.reduce((s, v) => s + v, 0);

/** Uma nuvem por palavra, do tamanho da frequência, arrumadas em fileiras no céu acima da rua. `palavras`:
 *  [[palavra, frequência, valor]]; `cor(valor)` pinta o texto. Devolve o <g> do céu. */
export function ceuDePalavras(palavras, cor) {
  if (!palavras.length) return '';
  const fMax = Math.max(...palavras.map(p => p[1]));
  const mistura = w => [...w].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 9973, 7);
  const ordem = palavras.map((p, i) => ({ palavra: p[0], f: p[1], v: p[2], i })).sort((a, b) => mistura(a.palavra) - mistura(b.palavra));
  // encolhe todas as nuvens até caberem no céu
  for (let fator = 2; fator > 0.3; fator *= 0.92) {
    const nuvens = ordem.map(p => {
      const fonte = (18 + 34 * Math.sqrt(p.f / fMax)) * fator;
      const h = fonte * 1.9;
      const w = Math.max(h * 1.6, p.palavra.length * fonte * 0.56 + h * 0.9);
      return { ...p, fonte, w, h, dx: w / 2, dy: h / 2 };
    });
    // fileiras da esquerda para a direita; depois cada fileira é centrada e as fileiras se espalham pelo céu
    const fileiras = [[]];
    let x = CEU.x0;
    for (const n of nuvens) {
      if (x + n.w > CEU.x1 && fileiras.at(-1).length) { fileiras.push([]); x = CEU.x0; }
      fileiras.at(-1).push(n);
      x += n.w + 34 * fator;
    }
    const alturas = fileiras.map(f => Math.max(...f.map(n => n.h)));
    const folga = (CEU.y1 - CEU.y0) - soma(alturas);
    if (folga >= 12 * fator * (fileiras.length - 1)) {
      const vao = fileiras.length > 1 ? folga / (fileiras.length - 1) : 0;
      const postas = [];
      let y = fileiras.length > 1 ? CEU.y0 : (CEU.y0 + CEU.y1 - alturas[0]) / 2;
      fileiras.forEach((f, k) => {
        const largura = f.reduce((s, n) => s + n.w, 0) + 34 * fator * (f.length - 1);
        let xi = (CEU.x0 + CEU.x1 - largura) / 2 + ((k % 2) - 0.5) * Math.min(30, CEU.x1 - CEU.x0 - largura);
        for (const n of f) {
          const sobe = (mistura(n.palavra + 'y') % 14) - 7;          // um pouco fora da linha, como nuvens de verdade
          postas.push({ ...n, cx: xi + n.dx, cy: y + (alturas[k] - n.h) / 2 + n.dy + sobe * fator });
          xi += n.w + 34 * fator;
        }
        y += alturas[k] + vao;
      });
      return `<g class="ceu-nuvens">${postas.map(n => `<g transform="translate(${n.cx.toFixed(1)} ${n.cy.toFixed(1)})">
        <g class="nuvem" data-i="${n.i}" tabindex="-1" role="button" aria-label="${n.palavra}: ${n.f} ${n.f === 1 ? 'vez' : 'vezes'}"
           style="--d:${(7 + (mistura(n.palavra) % 6)).toFixed(0)}s;--a:-${mistura(n.palavra + 'a') % 7}s">
          <path class="nuvem-corpo" d="${contornoDeNuvem(n.w, n.h)}"/>
          <text class="nuvem-texto" y="${(n.fonte * 0.35).toFixed(1)}" style="font-size:${n.fonte.toFixed(1)}px;fill:${cor(n.v)}">${n.palavra}</text>
        </g></g>`).join('')}</g>`;
    }
  }
  return '';
}
