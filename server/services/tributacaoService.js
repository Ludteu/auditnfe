const { xmlParaObjeto } = require('../utils/xmlHelper');
const Produto = require('../models/Produto');
const NFe = require('../models/NFe');
const { Op } = require('sequelize');

/**
 * Extrai dados tributários (NCM, CFOP, ICMS, IPI) de cada item de um XML de NF-e
 */
const extrairTributacao = async (xmlContent) => {
  const obj = await xmlParaObjeto(xmlContent);
  const nfe = obj?.NFe?.infNfe?.[0];

  if (!nfe) {
    throw new Error('XML inválido: estrutura NF-e não encontrada');
  }

  const itens = nfe.det || [];

  return itens.map((item) => {
    const prod = item.prod?.[0] || {};
    const imposto = item.imposto?.[0] || {};

    const icmsGrupo = imposto.ICMS?.[0] || {};
    const icmsTipo = Object.keys(icmsGrupo)[0];
    const icms = icmsGrupo[icmsTipo]?.[0] || {};

    const ipiGrupo = imposto.IPI?.[0] || {};
    const ipiTributado = ipiGrupo.IPITrib?.[0] || {};

    return {
      item: item.$?.nItem || null,
      codigo: prod.cProd?.[0] || null,
      descricao: prod.xProd?.[0] || null,
      ncm: prod.NCM?.[0] || null,
      cfop: prod.CFOP?.[0] || null,
      unidade: prod.uCom?.[0] || null,
      quantidade: prod.qCom?.[0] ? parseFloat(prod.qCom[0]) : null,
      valorUnitario: prod.vUnCom?.[0] ? parseFloat(prod.vUnCom[0]) : null,
      valorProduto: prod.vProd?.[0] ? parseFloat(prod.vProd[0]) : null,
      icms: {
        cst: icms.CST?.[0] || icms.CSOSN?.[0] || null,
        baseCalculo: icms.vBC?.[0] ? parseFloat(icms.vBC[0]) : 0,
        aliquota: icms.pICMS?.[0] ? parseFloat(icms.pICMS[0]) : 0,
        valor: icms.vICMS?.[0] ? parseFloat(icms.vICMS[0]) : 0
      },
      ipi: {
        cst: ipiTributado.CST?.[0] || null,
        baseCalculo: ipiTributado.vBC?.[0] ? parseFloat(ipiTributado.vBC[0]) : 0,
        aliquota: ipiTributado.pIPI?.[0] ? parseFloat(ipiTributado.pIPI[0]) : 0,
        valor: ipiTributado.vIPI?.[0] ? parseFloat(ipiTributado.vIPI[0]) : 0
      }
    };
  });
};

/**
 * Aplica dados tributários extraídos a um produto cadastrado
 */
const aplicarTributacaoProduto = async (usuarioId, produtoId, dados) => {
  const produto = await Produto.findOne({ where: { id: produtoId, usuarioId } });

  if (!produto) {
    throw new Error('Produto não encontrado');
  }

  const { ncm, cfop, icms, ipi } = dados;

  if (ncm) produto.ncm = ncm;
  if (cfop) produto.cfop = cfop;
  if (icms?.cst) produto.cstIcms = icms.cst;
  if (icms?.aliquota != null) produto.icmsAliquota = icms.aliquota;
  if (ipi?.cst) produto.cstIpi = ipi.cst;
  if (ipi?.aliquota != null) produto.ipiAliquota = ipi.aliquota;

  await produto.save();

  return produto;
};

/**
 * Resumo fiscal do período: soma de ICMS/IPI declarados nos XMLs das NF-es emitidas
 */
const calcularResumoFiscal = async (usuarioId, { dataInicio, dataFim } = {}) => {
  const where = { usuarioId };

  if (dataInicio || dataFim) {
    where.dataEmissao = {};
    if (dataInicio) where.dataEmissao[Op.gte] = new Date(dataInicio);
    if (dataFim) where.dataEmissao[Op.lte] = new Date(dataFim);
  }

  const nfes = await NFe.findAll({ where });

  let valorTotalProdutos = 0;
  let valorTotalIcms = 0;
  let valorTotalIpi = 0;
  let totalNotas = 0;
  let totalItens = 0;

  for (const nfe of nfes) {
    try {
      const itens = await extrairTributacao(nfe.xmlContent);
      totalNotas += 1;
      for (const item of itens) {
        totalItens += 1;
        valorTotalProdutos += item.valorProduto || 0;
        valorTotalIcms += item.icms.valor || 0;
        valorTotalIpi += item.ipi.valor || 0;
      }
    } catch (error) {
      // NF-e com XML incompleto/inválido é ignorada no resumo, mas não interrompe o cálculo
      continue;
    }
  }

  return {
    periodo: { dataInicio: dataInicio || null, dataFim: dataFim || null },
    totalNotas,
    totalItens,
    valorTotalProdutos: Number(valorTotalProdutos.toFixed(2)),
    valorTotalIcms: Number(valorTotalIcms.toFixed(2)),
    valorTotalIpi: Number(valorTotalIpi.toFixed(2)),
    cargaTributariaPercentual: valorTotalProdutos > 0
      ? Number((((valorTotalIcms + valorTotalIpi) / valorTotalProdutos) * 100).toFixed(2))
      : 0
  };
};

module.exports = {
  extrairTributacao,
  aplicarTributacaoProduto,
  calcularResumoFiscal
};
