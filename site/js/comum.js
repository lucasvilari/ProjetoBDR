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
      <a class="marca" href="index.html"><span class="marca-tecla" aria-hidden="true"><svg viewBox="0 0 24 14"><path d="M1 7C5 1 19 1 23 7C19 13 5 13 1 7Z" fill="#faf7ef" stroke="#22201c" stroke-width="1.3"/><circle cx="12" cy="7" r="3.7" fill="#22201c"/><circle cx="13.3" cy="5.7" r="1.2" fill="#faf7ef"/></svg></span>Tá no Olho do Povo</a>
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
  document.addEventListener('click', viraSantinho);
}

/** Um santinho: faixa (cargo, lugar, ano), o número da pergunta, o que ele mede, linhas de apoio e,
 *  no verso, como foi calculado e o que falta. `foto` é um <img> que vai ao lado do número. Devolve HTML. */
export function santinho({ faixa, nome = '', numero, rotulo, linhas = [], verso, fonte = '', classe = '', foto = '' }) {
  return `<div class="santinho ${classe}">
    <div class="santinho-carta">
      <section class="santinho-face santinho-frente">
        <div class="santinho-faixa">${faixa}</div>
        ${nome ? `<span class="santinho-nome">${nome}</span>` : ''}
        ${foto ? '<div class="santinho-com-foto"><div>' : ''}
        <strong class="santinho-numero"><span>${numero}</span></strong>
        <p class="santinho-rotulo">${rotulo}</p>
        ${foto ? `</div>${foto}</div>` : ''}
        ${linhas.length ? `<dl class="santinho-linhas">${linhas.map(([r, v]) => `<div><dt>${r}</dt><dd>${v}</dd></div>`).join('')}</dl>` : ''}
        ${verso ? `<div class="santinho-rodape santinho-cola"><span class="fonte">${fonte}</span>
          <button type="button" class="botao virar" aria-pressed="false">Como se calcula</button></div>` : ''}
      </section>
      ${verso ? `<section class="santinho-face santinho-verso" inert>
        <div class="santinho-faixa">Verso: como se calcula</div>
        <div class="santinho-texto">${verso}</div>
        <div class="santinho-rodape santinho-cola"><span class="fonte">${fonte}</span>
          <button type="button" class="botao virar" aria-pressed="true">Voltar à frente</button></div>
      </section>` : ''}
    </div>
  </div>`;
}

/** Vira o santinho do botão clicado; a face escondida fica inerte, e o foco passa para a outra face. */
function viraSantinho(e) {
  const botao = e.target.closest('.virar');
  if (!botao) return;
  const caixa = botao.closest('.santinho');
  const virado = caixa.classList.toggle('virado');
  const [frente, verso] = caixa.querySelectorAll('.santinho-face');
  frente.inert = virado; verso.inert = !virado;
  (virado ? verso : frente).querySelector('.virar').focus({ preventScroll: true });
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

/** Valor ideológico com seta para o lado em que fica: "← 2,68" (esquerda) ou "6,56 →" (direita).
 *  centro: 5 na escala de 0 a 10, 0 na escala da Câmara (−100 a +100). */
export function comSeta(v, centro = 5, casas = null) {
  if (v == null) return '—';
  const txt = (casas == null ? String(v) : v.toFixed(casas)).replace('.', ',').replace('-', '−');
  if (v < centro) return `<span class="seta seta-esq" title="à esquerda do centro"><i aria-hidden="true"></i>${txt}</span>`;
  if (v > centro) return `<span class="seta seta-dir" title="à direita do centro">${txt}<i aria-hidden="true"></i></span>`;
  return `<span class="seta" title="no centro">${txt}</span>`;
}

export const formata = {
  real: v => fmtReal.format(v),
  numero: v => fmtNum.format(v),
  pct: v => `${fmtPct.format(v)}%`,
};
