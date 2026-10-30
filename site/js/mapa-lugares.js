// O mapa de lugares das perguntas 3 e 4: as 27 UFs (os seis estados do projeto com contorno escuro e clicáveis) ou os
// municípios de um dos seis estados. É em relevo (3D, relevo-3d.js) quando há WebGL, o leitor não pediu menos movimento
// nem escolheu o plano; o plano tem as mesmas cores, sem a altura. A página diz a cor, a altura e o texto de cada lugar;
// o mapa monta a cena, troca de vista, avisa o clique e cuida do botão entre relevo e plano.
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { carregaDados, NOME_UF } from './comum.js?v=20261156';
import { UFS_PROJETO, DA_UF } from './pecas.js?v=20261156';

export const PROJETO = new Set(UFS_PROJETO);

/** caixa: onde o mapa é desenhado; botaoVista: o botão entre relevo e plano; chaveSessao: onde guardar a preferência;
 *  aoEscolher(chave, vista): clique num lugar clicável (a UF no Brasil, o código do município num estado);
 *  aoTrocarVista(): o leitor trocou entre relevo e plano (a página redesenha o mapa e a legenda); plano: sempre plano,
 *  sem o botão (o mini mapa da pergunta 4); larguraMax: a largura do mapa plano.
 *  Devolve { desenha }, que desenha um de cada vez (trocar de vista no meio de outro desenho montaria dois mapas). */
export function criaMapaDeLugares({ caixa, botaoVista, chaveSessao, aoEscolher, aoTrocarVista, plano = false, larguraMax = 760 }) {
  let prefere2D = false;
  try { prefere2D = sessionStorage.getItem(chaveSessao) === '1'; } catch { /* sem armazenamento */ }
  const podeUsar3D = () => {
    if (plano || prefere2D || matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    try { return Boolean(document.createElement('canvas').getContext('webgl2')); } catch { return false; }
  };
  let mapa = null;   // { id, em3D, geo, e a cena (3D) ou forma, contornos e caminho (plano) }
  let fila = Promise.resolve();

  async function constroi(vista, uf, geo, id) {
    const naUF = vista === 'UF';
    const chave = f => (naUF ? f.properties.mun : f.properties.uf);
    const rotulo = naUF ? `Municípios ${DA_UF[uf]}` : 'Estados do Brasil';
    const escolhe = k => aoEscolher(k, vista);
    mapa?.cena?.destroi();
    if (podeUsar3D()) {
      try {
        const { montaRelevo } = await import('./relevo-3d.js?v=20261156');
        const clicaveis = new Set(geo.features.map(chave).filter(k => naUF || PROJETO.has(k)));
        return { id, em3D: true, geo, cena: montaRelevo(caixa, { geo, chave, clicaveis, rotulo, aoEscolher: escolhe,
          alturaMax: naUF ? 0.14 : 0.34 }) };
      } catch (erro) { console.warn('mapa em relevo indisponível, usando o plano', erro); }
    }
    const largura = Math.min(larguraMax, caixa.clientWidth || 640);
    const projecao = d3.geoMercator().fitWidth(largura, geo);
    let altura = Math.ceil(d3.geoPath(projecao).bounds(geo)[1][1]);
    const alturaMax = Math.round(largura * 0.74);
    if (altura > alturaMax) { altura = alturaMax; projecao.fitSize([largura, altura], geo); }
    const caminho = d3.geoPath(projecao);
    const svg = d3.create('svg').attr('viewBox', [0, 0, largura, altura]).attr('class', 'mapa-svg').attr('role', 'group').attr('aria-label', rotulo);
    const hachura = svg.append('defs').append('pattern').attr('id', 'sem-dado').attr('patternUnits', 'userSpaceOnUse')
      .attr('width', 6).attr('height', 6).attr('patternTransform', 'rotate(45)');
    hachura.append('rect').attr('width', 6).attr('height', 6).attr('fill', '#cbbd9d');
    hachura.append('rect').attr('width', 1.6).attr('height', 6).attr('fill', '#8f8470');
    const forma = svg.append('g').selectAll('path').data(geo.features).join('path').attr('d', caminho)
      .attr('class', f => (naUF ? 'municipio' : PROJETO.has(f.properties.uf) ? 'estado projeto' : 'estado'));
    const clicavel = naUF ? forma : forma.filter(f => PROJETO.has(f.properties.uf));
    clicavel.attr('tabindex', 0).attr('role', 'button').on('click', (_, f) => escolhe(chave(f)))
      .on('keydown', (e, f) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); escolhe(chave(f)); } });
    // contornos por cima: os seis estados (Brasil) ou o município escolhido, para os vizinhos não os cobrirem
    const contornos = svg.append('g').attr('class', 'contornos').attr('aria-hidden', 'true');
    // a etiqueta com o nome do lugar sob o ponteiro (ou com o foco do teclado), para saber o que o clique vai abrir
    const dica = document.createElement('div');
    dica.className = 'mapa-dica';
    dica.hidden = true;
    const mostra = (texto, x, y) => {
      dica.textContent = texto;
      dica.hidden = false;
      const r = caixa.getBoundingClientRect();
      dica.style.left = `${Math.max(4, Math.min(x - r.left + 12, r.width - dica.offsetWidth - 4))}px`;
      dica.style.top = `${y - r.top + 14}px`;
    };
    forma.on('pointermove', (e, f) => mostra(e.currentTarget.getAttribute('aria-label') ?? '', e.clientX, e.clientY))
      .on('pointerleave', () => { dica.hidden = true; })
      .on('focus.dica', e => { const r = e.currentTarget.getBoundingClientRect(); mostra(e.currentTarget.getAttribute('aria-label') ?? '', r.left + r.width / 2, r.top + r.height / 2); })
      .on('blur.dica', () => { dica.hidden = true; });
    caixa.replaceChildren(svg.node(), dica);
    return { id, em3D: false, geo, forma, contornos, caminho, chave };
  }

  /** vista: 'BR' ou 'UF'; uf: o estado da vista UF (e, no Brasil, o estado em laranja); escolhido: a chave em laranja;
   *  porChave: Map chave → { cor, altura (0 a 1 ou null), titulo }. Devolve { em3D }. */
  async function desenhaAgora(pedido) {
    const { vista, uf, escolhido, porChave } = pedido;
    const naUF = vista === 'UF';
    const geo = naUF ? await carregaDados(`geo/municipios/${uf}.json`) : await carregaDados('geo/estados.json');
    const em3D = podeUsar3D();
    const id = `${vista}-${naUF ? uf : ''}-${em3D ? '3d' : Math.min(larguraMax, caixa.clientWidth || 640)}`;
    if (mapa?.id !== id) mapa = await constroi(vista, uf, geo, id);
    if (botaoVista) {
      botaoVista.hidden = !mapa.em3D && !prefere2D;
      botaoVista.textContent = mapa.em3D ? 'Ver plano' : 'Ver em relevo';
    }
    if (mapa.em3D) {
      mapa.cena.pinta(porChave, { escolhido, realcadas: naUF ? new Set() : PROJETO });
    } else {
      mapa.forma.attr('fill', f => porChave.get(mapa.chave(f))?.cor ?? 'url(#sem-dado)');
      mapa.forma.attr('aria-label', f => porChave.get(mapa.chave(f))?.titulo ?? '');
      const destaque = mapa.geo.features.filter(f => (naUF ? f.properties.mun === escolhido : PROJETO.has(f.properties.uf)));
      mapa.contornos.selectAll('path').data(destaque).join('path').attr('d', mapa.caminho)
        .attr('class', f => (naUF ? 'municipio selecionado' : `estado projeto${f.properties.uf === escolhido ? ' atual' : ''}`));
    }
    return { em3D: mapa.em3D };
  }

  const desenha = pedido => (fila = fila.then(() => desenhaAgora(pedido)).catch(e => { console.error(e); return { em3D: false }; }));
  botaoVista?.addEventListener('click', () => {
    prefere2D = !prefere2D;
    try { sessionStorage.setItem(chaveSessao, prefere2D ? '1' : '0'); } catch { /* sem armazenamento */ }
    aoTrocarVista();
  });
  return { desenha };
}
