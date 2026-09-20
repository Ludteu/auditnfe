const NFe = require('../models/NFe');
const { extrairTributacao } = require('./tributacaoService');
const { Op } = require('sequelize');

/**
 * Gera um arquivo EFD-ICMS/IPI SIMPLIFICADO a partir das NF-es do período.
 *
 * ⚠️ IMPORTANTE: Este gerador cobre apenas os blocos 0 (abertura) e C
 * (documentos fiscais) de forma didática, sem os blocos obrigatórios
 * completos (E, G, H, K, etc.) nem as validações do PVA da Receita Federal.
 * Não deve ser usado para entrega real de EFD sem revisão por um contador
 * e validação no Programa Validador e Assinador (PVA-EFD) oficial.
 */
const gerarArquivoEFD = async (usuarioId, { dataInicio, dataFim, cnpj, razaoSocial } = {}) => {
  if (!dataInicio || !dataFim) {
    throw new Error('Período (dataInicio e dataFim) é obrigatório');
  }

  const where = {
    usuarioId,
    direcao: 'emitida', // notas recebidas (compras) ainda não entram no EFD — ver EMISSAO.md
    dataEmissao: {
      [Op.gte]: new Date(dataInicio),
      // Vai até o FIM do dia informado, senão uma nota emitida durante o
      // próprio dia-fim (depois da meia-noite UTC) fica de fora do período.
      [Op.lte]: new Date(`${dataFim}T23:59:59.999Z`)
    }
  };

  const nfes = await NFe.findAll({ where, order: [['dataEmissao', 'ASC']] });

  const linhas = [];
  const dataGeracao = formatarDataEFD(new Date());

  linhas.push(criarRegistro('0000', [
    '017', 'A', formatarDataEFD(new Date(dataInicio)), formatarDataEFD(new Date(dataFim)),
    razaoSocial || '', cnpj || '', '', '', '', '1', '0', ''
  ]));

  linhas.push(criarRegistro('0001', ['0']));

  let numeroLinhaC = 0;

  for (const nfe of nfes) {
    numeroLinhaC += 1;

    linhas.push(criarRegistro('C100', [
      '0', '1', String(nfe.numero), '55', '00', String(nfe.serie), String(nfe.numero),
      nfe.chaveNFe, formatarDataEFD(nfe.dataEmissao), formatarDataEFD(nfe.dataEmissao),
      Number(nfe.valor || 0).toFixed(2), '0', '0.00', '0', '0.00', '0.00', '0.00', '0.00', '0.00'
    ]));

    try {
      const itens = await extrairTributacao(nfe.xmlContent);
      for (const item of itens) {
        linhas.push(criarRegistro('C170', [
          String(item.item || ''), item.codigo || '', item.descricao || '',
          Number(item.quantidade || 0).toFixed(3), item.unidade || '',
          Number(item.valorProduto || 0).toFixed(2), item.cfop || '',
          item.icms.cst || '', Number(item.icms.baseCalculo || 0).toFixed(2),
          Number(item.icms.aliquota || 0).toFixed(2), Number(item.icms.valor || 0).toFixed(2),
          Number(item.ipi.baseCalculo || 0).toFixed(2), Number(item.ipi.aliquota || 0).toFixed(2),
          Number(item.ipi.valor || 0).toFixed(2)
        ]));
      }
    } catch (error) {
      // XML incompleto: mantém o registro C100 sem os itens C170
      continue;
    }
  }

  linhas.push(criarRegistro('C990', [String(numeroLinhaC + 2)]));
  linhas.push(criarRegistro('9999', [String(linhas.length + 1)]));

  const conteudo = linhas.join('\r\n');

  return {
    nomeArquivo: `EFD_${cnpj || 'empresa'}_${formatarDataEFD(new Date(dataInicio))}_${formatarDataEFD(new Date(dataFim))}.txt`,
    geradoEm: dataGeracao,
    totalNotas: nfes.length,
    totalRegistros: linhas.length,
    conteudo
  };
};

const criarRegistro = (tipo, campos) => {
  return `|${tipo}|${campos.join('|')}|`;
};

const formatarDataEFD = (data) => {
  const d = new Date(data);
  const dia = String(d.getUTCDate()).padStart(2, '0');
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  const ano = d.getUTCFullYear();
  return `${dia}${mes}${ano}`;
};

module.exports = {
  gerarArquivoEFD
};
