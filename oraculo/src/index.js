// O oráculo do Olho do Povo: uma função na Cloudflare que recebe o retrato de uma página do site, pede uma
// interpretação a um modelo aberto do Workers AI (na cota gratuita da Cloudflare) e devolve o texto aos poucos. Na
// cabine (perguntas gerais), antes disso, transforma a pergunta num pedido de dados que o site busca (modo "plano").
// Não há chave de API: o acesso ao modelo vem da ligação "AI" do wrangler.toml.
import { validaPedido, montaMensagens, textoDoEvento, validaPlano, mensagensDoPlano, lePlano, textoDaResposta } from './pedido.js';

const MODELO_PADRAO = '@cf/google/gemma-4-26b-a4b-it';
const MAX_RESPOSTA = 700;   // tokens
const MAX_PLANO = 250;      // tokens: o pedido de dados da cabine é um JSON curto

export default {
  async fetch(pedido, env) {
    const origem = pedido.headers.get('Origin') ?? '';
    const permitidas = (env.ORIGENS ?? '').split(',').map(o => o.trim()).filter(Boolean);
    const cors = permitidas.includes(origem)
      ? { 'Access-Control-Allow-Origin': origem, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' }
      : null;
    const erro = (status, mensagem) => Response.json({ erro: mensagem }, { status, headers: cors ?? {} });

    // só o site chama o oráculo: outras origens não recebem permissão do navegador nem resposta
    if (!cors) return erro(403, 'origem não permitida');
    if (pedido.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (pedido.method !== 'POST') return erro(405, 'use POST');

    // no máximo alguns pedidos por minuto de cada visitante, para ninguém gastar a cota do dia sozinho
    if (env.LIMITE) {
      const { success } = await env.LIMITE.limit({ key: pedido.headers.get('CF-Connecting-IP') ?? 'anonimo' });
      if (!success) return erro(429, 'muitos pedidos; espere um minuto');
    }

    const corpo = await pedido.json().catch(() => null);
    const modelo = env.MODELO || MODELO_PADRAO;
    const semPensar = { chat_template_kwargs: { enable_thinking: false } };

    // a cabine, 1º passo: a pergunta geral vira um pedido de dados (JSON), que o site busca e devolve como retrato
    if (corpo?.modo === 'plano') {
      const plano = validaPlano(corpo);
      if (!plano.ok) return erro(400, plano.erro);
      try {
        const r = await env.AI.run(modelo, {
          messages: mensagensDoPlano(plano.pergunta), temperature: 0,
          max_tokens: MAX_PLANO, max_completion_tokens: MAX_PLANO, ...semPensar,
        });
        return Response.json({ plano: lePlano(textoDaResposta(r)) }, { headers: { ...cors, 'Cache-Control': 'no-store' } });
      } catch (e) {
        console.log('erro do Workers AI (plano):', String(e?.message ?? e));
        return erro(503, 'oráculo indisponível');
      }
    }

    const valido = validaPedido(corpo);
    if (!valido.ok) return erro(400, valido.erro);

    let fluxo;
    try {
      fluxo = await env.AI.run(modelo, {
        messages: montaMensagens(valido), stream: true, temperature: 0.3,
        // o teto vai nos dois nomes que os modelos aceitam; com só um deles, o Gemma 4 pensava antes de responder e
        // gastava o teto inteiro pensando, sem escrever a resposta
        max_tokens: MAX_RESPOSTA, max_completion_tokens: MAX_RESPOSTA, ...semPensar,
      });
    } catch (e) {
      // acabou a cota gratuita do dia (ou o modelo está fora do ar): o site mostra que o oráculo está descansando
      console.log('erro do Workers AI:', String(e?.message ?? e));
      return erro(503, 'oráculo indisponível');
    }

    // o fluxo do modelo vem em eventos (SSE); o site recebe só o texto, em pedaços, à medida que é escrito
    let resto = '';
    const decodifica = new TextDecoder(), codifica = new TextEncoder();
    const soTexto = new TransformStream({
      transform(pedaco, saida) {
        const linhas = (resto + decodifica.decode(pedaco, { stream: true })).split('\n');
        resto = linhas.pop();
        for (const linha of linhas) {
          const texto = textoDoEvento(linha.trim());
          if (texto) saida.enqueue(codifica.encode(texto));
        }
      },
      flush(saida) {
        const texto = textoDoEvento(resto.trim());
        if (texto) saida.enqueue(codifica.encode(texto));
      },
    });
    return new Response(fluxo.pipeThrough(soTexto), {
      headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  },
};
