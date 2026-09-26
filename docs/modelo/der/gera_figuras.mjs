// Gera as figuras do D.E.R. para o dossiê (SVG), com a mesma descrição e o mesmo
// Graphviz da página modelo_relacional.html. Uso: node gera_figuras.mjs <viz-global.js> [len_rel len_atr]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const aqui = path.dirname(new URL(import.meta.url).pathname);
const template = fs.readFileSync(path.join(aqui, '..', 'modelo_relacional.template.html'), 'utf8');
const trecho = (ini, fim) => { const i = template.indexOf(ini), j = template.indexOf(fim, i); if (i < 0 || j < 0) throw new Error('trecho não encontrado: ' + ini); return template.slice(i, j); };

// cores do tema claro da página (fixas no papel)
const CORES = { ink: '#18202B', ink2: '#18202B', linha: '#4B5563', sup: '#FFFFFF', sup2: '#EDEFEA', aj: '#4B5563',
                area: { nucleo: '#2F5DA8', fin: '#2B7A57', terr: '#7B4894' } };
const [lenRel = '2.0', lenAtr = '1.0', fonte = '1'] = process.argv.slice(3);
const F = parseFloat(fonte);

const Viz = createRequire(import.meta.url)(path.resolve(process.argv[2]));   // build UMD do Graphviz
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(trecho('const META = {', 'const AJUSTE_COL') + trecho('const DER = [', 'function coresDER') +
  `const AREA_DE_TABELA = t => (META[t] || META.candidatura).area;
   const q = t => '"' + String(t).replace(/"/g, '\\\\"') + '"';` + trecho('function dotDER', 'let motorDER') +
  '; globalThis.DER = DER; globalThis.dotDER = dotDER;', ctx);

const viz = await Viz.instance();
const nomes = ['nucleo_eleitoral', 'patrimonio_financas', 'territorio_votacao'];
ctx.DER.forEach((d, i) => {
  let { dot } = ctx.dotDER(d, CORES);
  dot = dot.replace(/len=2\.0/g, `len=${lenRel}`).replace(/len=1\.0\]/g, `len=${lenAtr}]`)
           .replace('graph [layout=neato', 'graph [layout=neato, dpi=72')
           .replace(/fontsize=([\d.]+)/g, (_, n) => `fontsize=${(parseFloat(n) * F).toFixed(1)}`)
           .replace(/, penwidth=1\.8/g, '')          // no dossiê os ajustes já fazem parte do modelo: sem destaque
           .replace(/, tooltip="[^"]*"/g, '')
           .replace(/fontcolor="#4B5563"/g, 'fontcolor="#18202B"');   // todo texto na cor de tinta
  const svg = viz.renderString(dot, { format: 'svg' });
  const m = svg.match(/viewBox="[\d.\-]+ [\d.\-]+ ([\d.]+) ([\d.]+)"/);
  fs.writeFileSync(path.join(aqui, nomes[i] + '.svg'), svg);
  const esc = Math.min(453 / m[1], 680 / m[2]);                 // cabe em 16 x 24 cm
  console.log(`${nomes[i]}: ${Math.round(m[1])} x ${Math.round(m[2])} pt -> atributos com ${(11 * F * esc).toFixed(1)} pt no papel`);
});
