// O piscar entre páginas (a transição está em css/estilo.css). O navegador revela a página nova assim que consegue
// desenhar o HTML, antes de o JavaScript montar o topo e o conteúdo; sem nada mais, o olho reabriria sobre uma página
// vazia, e as informações só apareceriam depois. Aqui o olho fica fechado (e o topo antigo à vista) até a página avisar
// que está montada (comum.js chama avisaPaginaPronta), ou por no máximo ESPERA_MAX, e só então reabre.
// É um script comum no <head>, e não um módulo, para estar pronto antes da primeira pintura da página nova.
(function () {
  const ESPERA_MAX = 1500;
  const FECHAR = 360;   // quanto o olho leva para fechar (o atraso de ::view-transition-new(root) no CSS)
  let avisa;
  window.paginaPronta = new Promise(resolve => { avisa = resolve; });
  window.avisaPaginaPronta = () => avisa();

  addEventListener('pagereveal', e => {
    if (!e.viewTransition) return;
    e.viewTransition.ready.then(() => {
      const inicio = performance.now();
      // seguram-se a abertura do olho e a troca do topo; o fechamento do olho segue normalmente
      const segura = document.getAnimations().filter(a =>
        /::view-transition-(new\(root\)|old\(topo\)|new\(topo\)|group\(topo\))/.test(a.effect?.pseudoElement ?? ''));
      segura.forEach(a => a.pause());
      const solta = () => {
        // se a espera passou do tempo de fechar, o olho reabre na hora, sem esperar de novo o atraso do CSS
        const passou = performance.now() - inicio;
        segura.forEach(a => {
          if (a.effect.pseudoElement === '::view-transition-new(root)') a.currentTime = Math.min(passou, FECHAR);
          a.play();
        });
      };
      Promise.race([window.paginaPronta, new Promise(r => setTimeout(r, ESPERA_MAX))]).then(solta);
    }, () => {});
  });
})();
