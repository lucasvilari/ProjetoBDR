// Partes comuns às páginas: cabeçalho, rodapé, leitura dos dados e formatos.
// Cada página importa este módulo e chama montaPagina() antes do próprio conteúdo.

import { PERGUNTAS } from './lib/perguntas.js?v=20261157';
import { montaOraculo, registraRetrato } from './oraculo.js?v=20261157';

// cada página registra aqui como montar o retrato do que mostra, que o oráculo lê
export { registraRetrato };

// a navegação são as teclas da urna: uma por pergunta respondida, com o título por extenso no rótulo
const PAGINAS = PERGUNTAS.filter(p => p.href).map(p => ({ id: `pergunta-${p.n}`, rotulo: String(p.n), titulo: p.titulo, href: p.href }));

const REPOSITORIO = 'https://github.com/lucasvilari/ProjetoBDR';

/** Escreve o cabeçalho e o rodapé e marca a página atual na navegação. */
export function montaPagina() {
  const atual = document.body.dataset.pagina;
  const topo = document.querySelector('header.topo');
  topo.innerHTML = `
    <div class="topo-interno">
      <a class="marca" href="index.html"><span class="marca-tecla" aria-hidden="true"><svg viewBox="0 0 24 14"><path d="M1 7C5 1 19 1 23 7C19 13 5 13 1 7Z" fill="#faf7ef" stroke="#22201c" stroke-width="1.3"/><circle cx="12" cy="7" r="3.7" fill="#22201c"/><circle cx="13.3" cy="5.7" r="1.2" fill="#faf7ef"/></svg></span>Olho do Povo</a>
      <nav class="nav" aria-label="Seções do site">
        <a class="nav-todas" href="index.html"${atual === 'inicio' ? ' aria-current="page"' : ''}>Perguntas</a>
        ${PAGINAS.map(p => `<a class="nav-tecla" href="${p.href}" title="${p.titulo}" aria-label="Pergunta ${p.rotulo}: ${p.titulo}"${p.id === atual ? ' aria-current="page"' : ''}>${p.rotulo}</a>`).join('')}
        <a class="nav-tecla nav-cabine" href="cabine.html" title="Pergunte ao oráculo" aria-label="A cabine do oráculo: faça uma pergunta geral"${atual === 'cabine' ? ' aria-current="page"' : ''}>?</a>
      </nav>
    </div>`;
  const rodape = document.querySelector('footer.rodape');
  rodape.innerHTML = `
    <div class="rodape-interno">
      <span>Dados abertos do TSE, do IBGE, do Atlas do Desenvolvimento Humano e de especialistas em partidos.</span>
      <a href="${REPOSITORIO}">Código e consultas no GitHub</a>
    </div>`;
  document.addEventListener('click', viraSantinho);
  apertaTeclas();
  montaOraculo();
  confereSePronta();
}

// as teclas afundam ao clique (css/estilo.css, :active); um clique rápido dura menos que a descida, e a tecla mal se
// mexeria. A classe .apertada a mantém afundada por pelo menos APERTO_MIN, com o mouse, o dedo ou o teclado
const TECLAS = '.nav a, .botao, .pergunta label, .roda-pergunta:not([aria-disabled="true"]), .ver-ceu';
const APERTO_MIN = 110;
function apertaTeclas() {
  const aperta = tecla => {
    const inicio = performance.now();
    tecla.classList.add('apertada');
    return () => setTimeout(() => tecla.classList.remove('apertada'), Math.max(0, APERTO_MIN - (performance.now() - inicio)));
  };
  document.addEventListener('pointerdown', e => {
    const tecla = e.target.closest?.(TECLAS);
    if (!tecla || e.button !== 0) return;
    const solta = aperta(tecla);
    const fim = () => { solta(); removeEventListener('pointerup', fim); removeEventListener('pointercancel', fim); };
    addEventListener('pointerup', fim);
    addEventListener('pointercancel', fim);
  });
  document.addEventListener('keydown', e => {
    if (e.repeat || (e.key !== 'Enter' && e.key !== ' ')) return;
    const tecla = e.target.closest?.(TECLAS);
    if (tecla) aperta(tecla)();
  });
}

// a página está montada quando o topo já foi escrito e nenhum dado está chegando por dois quadros seguidos: aí a
// cortina entre páginas pode se abrir (js/transicao.js)
let pendentes = 0, conferindo = false;
function confereSePronta() {
  if (conferindo) return;
  conferindo = true;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    conferindo = false;
    if (pendentes === 0) window.avisaPaginaPronta?.();
  }));
}

/** Quantos caracteres o número do santinho ocupa (sem as marcações), para a fonte encolher e ele caber na caixa. */
const tamanhoDoNumero = numero => {
  const texto = String(numero);
  return Math.max(4, texto.replace(/<[^>]*>/g, '').length + (texto.includes('<i') ? 1.5 : 0));
};

/** Um santinho: faixa (cargo, lugar, ano), o número da pergunta, o que ele mede, linhas de apoio e,
 *  no verso, como foi calculado e o que falta. `foto` é um <img> que vai ao lado do número. Devolve HTML. */
export function santinho({ faixa, nome = '', numero, rotulo, linhas = [], verso, fonte = '', classe = '', foto = '' }) {
  return `<div class="santinho ${classe}">
    <div class="santinho-carta">
      <section class="santinho-face santinho-frente">
        <div class="santinho-faixa">${faixa}</div>
        ${nome ? `<span class="santinho-nome">${nome}</span>` : ''}
        ${foto ? '<div class="santinho-com-foto"><div>' : ''}
        <strong class="santinho-numero"><span style="--n:${tamanhoDoNumero(numero)}">${numero}</span></strong>
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

export const NOME_UF = {
  AC: 'Acre', AL: 'Alagoas', AM: 'Amazonas', AP: 'Amapá', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal',
  ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MG: 'Minas Gerais', MS: 'Mato Grosso do Sul',
  MT: 'Mato Grosso', PA: 'Pará', PB: 'Paraíba', PE: 'Pernambuco', PI: 'Piauí', PR: 'Paraná', RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte', RO: 'Rondônia', RR: 'Roraima', RS: 'Rio Grande do Sul', SC: 'Santa Catarina',
  SE: 'Sergipe', SP: 'São Paulo', TO: 'Tocantins',
};
// "no Brasil", "na Paraíba", "no Amapá"; os demais estados e os municípios levam "em"
const PREPOSICAO = { Brasil: 'no', 'Amapá': 'no', 'Paraíba': 'na', Acre: 'no', Amazonas: 'no', 'Pará': 'no',
  Tocantins: 'no', 'Maranhão': 'no', 'Piauí': 'no', 'Ceará': 'no', 'Rio Grande do Norte': 'no', 'Espírito Santo': 'no',
  'Rio de Janeiro': 'no', 'Paraná': 'no', 'Rio Grande do Sul': 'no', 'Distrito Federal': 'no', Bahia: 'na' };
export const em = nome => `${PREPOSICAO[nome] ?? 'em'} ${nome}`;

const cache = new Map();

/** Lê um arquivo JSON de dados/, uma vez por página. */
// a mesma versão do ?v= dos scripts: depois de publicar, o navegador não mistura script novo com dado velho
const VERSAO = '20261157';

export function carregaDados(caminho) {
  if (!cache.has(caminho)) {
    pendentes += 1;
    const pedido = fetch(`dados/${caminho}?v=${VERSAO}`).then(r => {
      if (!r.ok) throw new Error(`dados/${caminho}: ${r.status}`);
      return r.json();
    });
    pedido.finally(() => { pendentes -= 1; confereSePronta(); }).catch(() => {});
    cache.set(caminho, pedido);
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

// o código de cada eleição no DivulgaCandContas do TSE, que tem as fotos de 2004 em diante
const ELEICAO_TSE = { 2004: 14431, 2006: 14423, 2008: 14422, 2010: 14417, 2012: 1699, 2014: 680, 2016: 2,
  2018: 2022802018, 2020: 2030402020, 2022: 2040602022, 2024: 2045202024, 2026: 20322002026 };

/** A foto do candidato no TSE ("ano/número do candidato no TSE/ue", de 2004 em diante). Sem foto, ou se o TSE
 *  não responder, a imagem some; quando o TSE não tem a foto, ele manda uma silhueta. */
export function fotoCandidato(chave, classe) {
  if (!chave) return '';
  const [ano, sq, ue] = chave.split('/');
  if (!ELEICAO_TSE[ano]) return '';
  return `<img class="${classe}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()"
    src="https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/${ELEICAO_TSE[ano]}/${sq}/${ue}">`;
}

const fmtCentavos = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formata = {
  real: v => fmtReal.format(v),
  /** Reais por voto: com centavos abaixo de R$ 100, onde os inteiros esconderiam a diferença. */
  porVoto: v => (v < 100 ? fmtCentavos : fmtReal).format(v),
  numero: v => fmtNum.format(v),
  pct: v => `${fmtPct.format(v)}%`,
};
