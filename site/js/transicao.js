// A cortina entre páginas (desenhada em js/cortina.js). Ao clicar num link para outra página do site, a cortina se fecha
// sobre a página atual e só então o navegador troca de página; a imagem dela, fechada, fica no sessionStorage. A página
// nova a mostra desde a primeira pintura (antes do JavaScript montar o topo e o conteúdo) e a mantém fechada até avisar
// que está montada (comum.js chama avisaPaginaPronta), ou por no máximo ESPERA_MAX; só então ela se abre.
// É um script comum no <head>, e não um módulo, para estar pronto antes da primeira pintura da página nova.
(function () {
  const ESPERA_MAX = 1500;
  const CHAVE = 'cortina-fechada';                       // a mesma de cortina.js
  const versao = new URL(document.currentScript.src).search;
  const modulo = () => import(`./cortina.js${versao}`);
  let avisa;
  window.paginaPronta = new Promise(resolve => { avisa = resolve; });
  window.avisaPaginaPronta = () => avisa();

  const semMovimento = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  // a página nova nasce com a cortina fechada por cima (a imagem guardada pela página anterior)
  let herdada = null;
  try { herdada = JSON.parse(sessionStorage.getItem(CHAVE)); sessionStorage.removeItem(CHAVE); } catch { herdada = null; }
  if (herdada?.imagem) {
    const estilo = document.createElement('style');
    estilo.textContent = `html::after { content: ""; position: fixed; left: 0; right: 0; top: ${Number(herdada.topo) || 0}px;
      bottom: 0; z-index: 2147483000; pointer-events: none; background: url("${herdada.imagem}") center / 100% 100% no-repeat; }`;
    document.head.append(estilo);
    const tira = () => estilo.remove();
    Promise.race([window.paginaPronta, new Promise(r => setTimeout(r, ESPERA_MAX))])
      .then(modulo).then(m => m.abre(herdada, tira)).catch(tira);
  }

  // um clique comum num link para outra página do site fecha a cortina antes de sair
  addEventListener('click', e => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || semMovimento()) return;
    const a = e.target.closest?.('a[href]');
    if (!a || a.target || a.hasAttribute('download')) return;
    const destino = new URL(a.href, location.href);
    if (destino.origin !== location.origin || !/(\.html|\/)$/.test(destino.pathname)) return;
    if (destino.pathname === location.pathname) return;  // só muda o # (o recorte): sem cortina
    e.preventDefault();
    modulo().then(m => m.fecha(destino.href)).catch(() => { location.href = destino.href; });
  });
  // carrega o módulo cedo, para o clique não esperar por ele
  addEventListener('load', () => setTimeout(() => modulo().catch(() => {}), 300));
})();
