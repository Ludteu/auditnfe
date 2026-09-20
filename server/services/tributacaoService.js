const { xmlParaObjeto } = require('../utils/xmlHelper');
const Produto = require('../models/Produto');
const NFe = require('../models/NFe');
const { Op } = require('sequelize');

/**
 * Extrai o cabeçalho de um XML de NF-e: chave, número/série, data de
 * emissão e dados do emitente (usado ao importar uma nota de compra
 * recebida de um fornecedor).
 */
const extrairCabecalho = async (xmlContent) => {
  const obj = await xmlParaObjeto(xmlContent);
  const nfe = obj?.NFe?.infNfe?.[0];

  if (!nfe) {
    throw new Error('XML inválido: estrutura NF-e não encontrada');
  }

  const ide = nfe.ide?.[0] || {};
  const emit = nfe.emit?.[0] || {};
  const chaveNFe = nfe.$?.Id?.replace('NFe', '') || null;

  return {
    chaveNFe,
    numero: ide.nNF?.[0] ? parseInt(ide.nNF[0], 10) : null,
    serie: ide.serie?.[0] ? parseInt(ide.serie[0], 10) : 1,
    dataEmissao: ide.dhEmi?.[0] || null,
    naturezaOperacao: ide.natOp?.[0] || null,
    emitenteCnpj: emit.CNPJ?.[0] || null,
    emitenteNome: emit.xNome?.[0] || null,
    emitenteUf: emit.enderEmit?.[0]?.UF?.[0] || null
  };
};

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
  // Só notas emitidas (vendas) entram no resumo fiscal — notas recebidas
  // (compras importadas via reconhecimento de produtos) ainda não são
  // incluídas aqui nem no EFD; ver limitação documentada em EMISSAO.md.
  const where = { usuarioId, direcao: 'emitida' };

  if (dataInicio || dataFim) {
    where.dataEmissao = {};
    if (dataInicio) where.dataEmissao[Op.gte] = new Date(dataInicio);
    // Data-fim "só data" (sem hora) precisa ir até o FIM do dia, senão uma
    // nota emitida às 10h do próprio dia-fim fica de fora do período.
    if (dataFim) where.dataEmissao[Op.lte] = new Date(`${dataFim}T23:59:59.999Z`);
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

/**
 * Totais mensais de vendas (NFe emitidas) e compras (NFe recebidas) dos
 * últimos N meses — para o gráfico de evolução da aba Fiscal.
 */
const calcularEvolucao = async (usuarioId, { meses = 6 } = {}) => {
  const qtdMeses = Math.min(Math.max(parseInt(meses, 10) || 6, 1), 24);
  const hoje = new Date();
  const inicio = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - (qtdMeses - 1), 1));

  const nfes = await NFe.findAll({
    where: {
      usuarioId,
      direcao: { [Op.in]: ['emitida', 'recebida'] },
      dataEmissao: { [Op.gte]: inicio }
    },
    attributes: ['direcao', 'dataEmissao', 'valor']
  });

  const buckets = new Map();
  for (let i = 0; i < qtdMeses; i++) {
    const d = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + i, 1));
    const chave = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    buckets.set(chave, { mes: chave, totalVendas: 0, totalCompras: 0 });
  }

  for (const nfe of nfes) {
    const d = new Date(nfe.dataEmissao);
    const chave = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const bucket = buckets.get(chave);
    if (!bucket) continue;
    const valor = Number(nfe.valor || 0);
    if (nfe.direcao === 'emitida') bucket.totalVendas += valor;
    else bucket.totalCompras += valor;
  }

  return {
    meses: Array.from(buckets.values()).map((b) => ({
      mes: b.mes,
      totalVendas: Number(b.totalVendas.toFixed(2)),
      totalCompras: Number(b.totalCompras.toFixed(2))
    }))
  };
};

module.exports = {
  extrairCabecalho,
  extrairTributacao,
  aplicarTributacaoProduto,
  calcularResumoFiscal,
  calcularEvolucao
};
