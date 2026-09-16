/**
 * Motor de sugestão de classificação fiscal (CFOP + CST/CSOSN).
 *
 * ⚠️ IMPORTANTE: Isto é um APOIO À DECISÃO com um subconjunto dos casos mais
 * comuns da tabela oficial de CFOP (Ajuste SINIEF 07/01) e das tabelas de
 * CST (Convênio s/n de 1970, regime normal) e CSOSN (Simples Nacional).
 * NÃO cobre: substituição tributária (ICMS-ST) por NCM, DIFAL para
 * consumidor final não contribuinte, benefícios fiscais estaduais,
 * zona franca, exportação, PIS/COFINS. Toda sugestão deve ser revisada
 * por um contador antes de ser usada em produção — especialmente quando
 * o produto está sujeito a ICMS-ST ou a regime tributário diferenciado.
 *
 * Duas variáveis definem a classificação de cada item:
 * - `finalidade` do produto: por que a empresa tem esse item (revenda,
 *   produção própria, matéria-prima/insumo, uso e consumo, ativo imobilizado)
 * - `tipoOperacao`: o que está acontecendo com ele agora (compra, venda,
 *   devolução de uma venda anterior, devolução de uma compra anterior)
 *
 * A combinação das duas, mais se a operação é interna (mesmo estado) ou
 * interestadual, determina o CFOP. O regime tributário da empresa
 * (Simples Nacional x regime normal) determina se a resposta usa CSOSN
 * ou CST.
 */

const TIPOS_OPERACAO_ENTRADA = ['compra', 'devolucaoDeVenda'];
const TIPOS_OPERACAO_SAIDA = ['venda', 'devolucaoDeCompra'];

// CFOP por finalidade x tipo de operação. { interna, interestadual }
const TABELA_CFOP = {
  producao_propria: {
    venda: { interna: '5101', interestadual: '6101', descricao: 'Venda de produção do estabelecimento' },
    devolucaoDeVenda: { interna: '1201', interestadual: '2201', descricao: 'Devolução de venda de produção do estabelecimento' }
  },
  revenda: {
    compra: { interna: '1102', interestadual: '2102', descricao: 'Compra para comercialização' },
    venda: { interna: '5102', interestadual: '6102', descricao: 'Venda de mercadoria adquirida ou recebida de terceiros' },
    devolucaoDeVenda: { interna: '1202', interestadual: '2202', descricao: 'Devolução de venda de mercadoria adquirida ou recebida de terceiros' },
    devolucaoDeCompra: { interna: '5202', interestadual: '6202', descricao: 'Devolução de compra para comercialização' }
  },
  materia_prima_insumo: {
    compra: { interna: '1101', interestadual: '2101', descricao: 'Compra para industrialização ou produção rural' },
    devolucaoDeCompra: { interna: '5201', interestadual: '6201', descricao: 'Devolução de compra para industrialização ou produção rural' }
  },
  uso_consumo: {
    compra: { interna: '1556', interestadual: '2556', descricao: 'Compra de material para uso ou consumo' },
    devolucaoDeCompra: { interna: '5556', interestadual: '6556', descricao: 'Devolução de compra de material para uso ou consumo' }
  },
  ativo_imobilizado: {
    compra: { interna: '1551', interestadual: '2551', descricao: 'Compra de bem para o ativo imobilizado' },
    venda: { interna: '5551', interestadual: '6551', descricao: 'Venda de bem do ativo imobilizado' },
    devolucaoDeCompra: { interna: '5553', interestadual: '6553', descricao: 'Devolução de compra de bem para o ativo imobilizado' }
  }
};

// Fallback genérico quando a combinação finalidade x operação não está mapeada
const CFOP_FALLBACK = {
  entrada: { interna: '1949', interestadual: '2949', descricao: 'Outra entrada não especificada' },
  saida: { interna: '5949', interestadual: '6949', descricao: 'Outra saída não especificada' }
};

// Sugestão de CST (ICMS, regime normal) para operações de saída (venda / devolução de compra)
const CST_ICMS_SAIDA = {
  producao_propria: { codigo: '00', descricao: 'Tributada integralmente' },
  revenda: { codigo: '00', descricao: 'Tributada integralmente' },
  ativo_imobilizado: { codigo: '41', descricao: 'Não tributada (venda ocasional de bem do ativo, fora do objeto social)' },
  materia_prima_insumo: { codigo: '00', descricao: 'Tributada integralmente' },
  uso_consumo: { codigo: '00', descricao: 'Tributada integralmente' }
};

// Sugestão de CSOSN (Simples Nacional) para operações de saída
const CSOSN_SAIDA = {
  producao_propria: { codigo: '101', descricao: 'Tributada pelo Simples Nacional com permissão de crédito' },
  revenda: { codigo: '102', descricao: 'Tributada pelo Simples Nacional sem permissão de crédito' },
  ativo_imobilizado: { codigo: '400', descricao: 'Não tributada pelo Simples Nacional (venda ocasional de bem do ativo)' },
  materia_prima_insumo: { codigo: '102', descricao: 'Tributada pelo Simples Nacional sem permissão de crédito' },
  uso_consumo: { codigo: '102', descricao: 'Tributada pelo Simples Nacional sem permissão de crédito' }
};

/**
 * Sugere CFOP + CST/CSOSN para uma operação, a partir da finalidade do
 * item, do tipo de operação, das UFs de origem/destino e do regime
 * tributário da empresa emitente.
 */
const sugerirClassificacaoFiscal = ({ finalidade, tipoOperacao, ufOrigem, ufDestino, regimeTributario }) => {
  if (!finalidade || !TABELA_CFOP[finalidade]) {
    throw new Error(`Finalidade inválida. Use uma de: ${Object.keys(TABELA_CFOP).join(', ')}`);
  }
  if (!tipoOperacao || ![...TIPOS_OPERACAO_ENTRADA, ...TIPOS_OPERACAO_SAIDA].includes(tipoOperacao)) {
    throw new Error(`Tipo de operação inválido. Use uma de: ${[...TIPOS_OPERACAO_ENTRADA, ...TIPOS_OPERACAO_SAIDA].join(', ')}`);
  }
  if (!ufOrigem || !ufDestino) {
    throw new Error('Informe ufOrigem e ufDestino (sigla de 2 letras)');
  }

  const interestadual = ufOrigem.toUpperCase() !== ufDestino.toUpperCase();
  const direcao = interestadual ? 'interestadual' : 'interna';
  const ehSaida = TIPOS_OPERACAO_SAIDA.includes(tipoOperacao);

  const regraCfop = TABELA_CFOP[finalidade][tipoOperacao];
  const fallback = ehSaida ? CFOP_FALLBACK.saida : CFOP_FALLBACK.entrada;
  const usouFallback = !regraCfop;
  const cfopEscolhido = regraCfop || fallback;

  const resultado = {
    cfop: cfopEscolhido[direcao],
    cfopDescricao: cfopEscolhido.descricao,
    operacao: interestadual ? 'interestadual' : 'interna',
    avisos: []
  };

  if (usouFallback) {
    resultado.avisos.push(
      `Não há regra específica para finalidade "${finalidade}" + operação "${tipoOperacao}"; usado CFOP genérico. Revise manualmente.`
    );
  }

  if (!ehSaida) {
    // Entrada: o CST/CSOSN vem do XML de quem emitiu a nota (o fornecedor), não é algo que a empresa decide.
    resultado.avisos.push(
      'Operação de entrada: o CST/CSOSN é definido por quem emitiu a nota de origem — use POST /api/fiscal/tributacao/extrair para lê-lo do XML do fornecedor.'
    );
    return resultado;
  }

  if (regimeTributario === 'simples_nacional') {
    const csosn = CSOSN_SAIDA[finalidade] || { codigo: '900', descricao: 'Outros (revisar manualmente)' };
    resultado.tabelaIcms = 'CSOSN';
    resultado.codigoIcms = csosn.codigo;
    resultado.codigoIcmsDescricao = csosn.descricao;
  } else if (regimeTributario === 'lucro_presumido' || regimeTributario === 'lucro_real') {
    const cst = CST_ICMS_SAIDA[finalidade] || { codigo: '90', descricao: 'Outras (revisar manualmente)' };
    resultado.tabelaIcms = 'CST';
    resultado.codigoIcms = cst.codigo;
    resultado.codigoIcmsDescricao = cst.descricao;
  } else {
    resultado.avisos.push(
      'Regime tributário da empresa não configurado — defina "regimeTributario" no perfil (PUT /api/usuarios/perfil) para receber sugestão de CST/CSOSN. Só o CFOP foi sugerido.'
    );
  }

  resultado.avisos.push(
    'Sugestão automática: não cobre ICMS-ST por NCM, DIFAL, benefícios fiscais estaduais nem PIS/COFINS. Revise com um contador antes de emitir.'
  );

  return resultado;
};

module.exports = {
  sugerirClassificacaoFiscal,
  TABELA_CFOP,
  CST_ICMS_SAIDA,
  CSOSN_SAIDA
};
