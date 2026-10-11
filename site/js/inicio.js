// Página inicial: o custo de uma cadeira "digitado" nas caixas, como o número na urna.
import { montaPagina, carregaDados, formata } from './comum.js';

montaPagina();

const visor = document.getElementById('visor');
const legenda = document.getElementById('visor-legenda');
const animar = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function caixas(texto) {
  visor.replaceChildren();
  const prefixo = document.createElement('span');
  prefixo.className = 'visor-prefixo';
  prefixo.textContent = 'R$';
  visor.append(prefixo);
  const digitos = [];
  for (const c of texto) {
    const caixa = document.createElement('span');
    caixa.className = /\d/.test(c) ? 'digito vazio' : 'digito separador';
    caixa.textContent = c;
    caixa.setAttribute('aria-hidden', 'true');
    visor.append(caixa);
    if (/\d/.test(c)) digitos.push(caixa);
  }
  // os dígitos aparecem um a um, da esquerda para a direita
  digitos.forEach((d, i) => setTimeout(() => d.classList.remove('vazio'), animar ? 120 * (i + 1) : 0));
}

try {
  const { custo_cadeira: c } = await carregaDados('destaques.json');
  const inteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(c.valor);
  caixas(inteiro);
  visor.setAttribute('aria-label', formata.real(c.valor));
  legenda.textContent = c.legenda;
} catch {
  caixas('?');
  legenda.textContent = 'O valor ainda não foi gerado: rode a exportação dos dados do site.';
}
