// Partes comuns às quatro páginas: cabeçalho, rodapé, leitura dos dados e formatos.
// Cada página importa este módulo e chama montaPagina() antes do próprio conteúdo.

const PAGINAS = [
  { id: 'mapa', rotulo: 'Mapa', href: 'mapa.html' },
  { id: 'partido', rotulo: 'Partido', href: 'partido.html' },
  { id: 'politico', rotulo: 'Político', href: 'politico.html' },
];

const REPOSITORIO = 'https://github.com/lucasvilari/ProjetoBDR';

/** Escreve o cabeçalho e o rodapé e marca a página atual na navegação. */
export function montaPagina() {
  const atual = document.body.dataset.pagina;
  const topo = document.querySelector('header.topo');
  topo.innerHTML = `
    <div class="topo-interno">
      <a class="marca" href="index.html"><span class="marca-tecla" aria-hidden="true"></span>Confirma</a>
      <nav class="nav" aria-label="Seções do site">
        ${PAGINAS.map(p => `<a href="${p.href}"${p.id === atual ? ' aria-current="page"' : ''}>${p.rotulo}</a>`).join('')}
      </nav>
    </div>`;
  const rodape = document.querySelector('footer.rodape');
  rodape.innerHTML = `
    <div class="rodape-interno">
      <span>Dados abertos do TSE, do IBGE, do Atlas do Desenvolvimento Humano e de especialistas em partidos.</span>
      <a href="${REPOSITORIO}">Código e consultas no GitHub</a>
    </div>`;
}

const cache = new Map();

/** Lê um arquivo JSON de dados/, uma vez por página. */
export function carregaDados(caminho) {
  if (!cache.has(caminho)) {
    cache.set(caminho, fetch(`dados/${caminho}`).then(r => {
      if (!r.ok) throw new Error(`dados/${caminho}: ${r.status}`);
      return r.json();
    }));
  }
  return cache.get(caminho);
}

const fmtReal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const fmtNum = new Intl.NumberFormat('pt-BR');
const fmtPct = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export const formata = {
  real: v => fmtReal.format(v),
  numero: v => fmtNum.format(v),
  pct: v => `${fmtPct.format(v)}%`,
};
