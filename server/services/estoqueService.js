const Produto = require('../models/Produto');
const MovimentacaoEstoque = require('../models/MovimentacaoEstoque');
const sequelize = require('../config/database');

/**
 * Calcula o novo preço médio ponderado após uma entrada
 */
const calcularPrecoMedio = (saldoAnterior, precoMedioAnterior, quantidadeEntrada, precoEntrada) => {
  const saldo = parseFloat(saldoAnterior) || 0;
  const precoMedio = parseFloat(precoMedioAnterior) || 0;
  const qtdEntrada = parseFloat(quantidadeEntrada);
  const precoNovo = parseFloat(precoEntrada) || 0;

  const valorAtual = saldo * precoMedio;
  const valorEntrada = qtdEntrada * precoNovo;
  const saldoFinal = saldo + qtdEntrada;

  if (saldoFinal <= 0) return 0;

  return (valorAtual + valorEntrada) / saldoFinal;
};

/**
 * Registra entrada de estoque, atualizando saldo e preço médio de custo
 */
const registrarEntrada = async (usuarioId, { produtoId, quantidade, precoUnitario, motivo, nfeId }) => {
  if (!quantidade || quantidade <= 0) {
    throw new Error('Quantidade de entrada deve ser maior que zero');
  }

  return sequelize.transaction(async (t) => {
    const produto = await Produto.findOne({
      where: { id: produtoId, usuarioId },
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!produto) {
      throw new Error('Produto não encontrado');
    }

    const saldoAnterior = parseFloat(produto.quantidade);
    const saldoPosterior = saldoAnterior + parseFloat(quantidade);
    const novoPrecoMedio = calcularPrecoMedio(
      saldoAnterior,
      produto.precoMedioCusto,
      quantidade,
      precoUnitario ?? produto.precoCusto
    );

    produto.quantidade = saldoPosterior;
    if (precoUnitario != null) {
      produto.precoMedioCusto = novoPrecoMedio;
      produto.precoCusto = precoUnitario;
    }
    await produto.save({ transaction: t });

    const movimentacao = await MovimentacaoEstoque.create({
      usuarioId,
      produtoId,
      nfeId: nfeId || null,
      tipo: 'entrada',
      quantidade,
      precoUnitario: precoUnitario ?? produto.precoCusto,
      saldoAnterior,
      saldoPosterior,
      motivo
    }, { transaction: t });

    return { produto, movimentacao };
  });
};

/**
 * Registra saída de estoque, validando saldo disponível
 */
const registrarSaida = async (usuarioId, { produtoId, quantidade, motivo, nfeId }) => {
  if (!quantidade || quantidade <= 0) {
    throw new Error('Quantidade de saída deve ser maior que zero');
  }

  return sequelize.transaction(async (t) => {
    const produto = await Produto.findOne({
      where: { id: produtoId, usuarioId },
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!produto) {
      throw new Error('Produto não encontrado');
    }

    const saldoAnterior = parseFloat(produto.quantidade);
    if (saldoAnterior < parseFloat(quantidade)) {
      throw new Error(`Estoque insuficiente. Saldo atual: ${saldoAnterior}`);
    }

    const saldoPosterior = saldoAnterior - parseFloat(quantidade);
    produto.quantidade = saldoPosterior;
    await produto.save({ transaction: t });

    const movimentacao = await MovimentacaoEstoque.create({
      usuarioId,
      produtoId,
      nfeId: nfeId || null,
      tipo: 'saida',
      quantidade,
      precoUnitario: produto.precoMedioCusto,
      saldoAnterior,
      saldoPosterior,
      motivo
    }, { transaction: t });

    return { produto, movimentacao };
  });
};

/**
 * Ajusta o saldo de um produto para um valor absoluto (inventário/correção)
 */
const registrarAjuste = async (usuarioId, { produtoId, novaQuantidade, motivo }) => {
  if (novaQuantidade == null || novaQuantidade < 0) {
    throw new Error('Nova quantidade inválida');
  }

  return sequelize.transaction(async (t) => {
    const produto = await Produto.findOne({
      where: { id: produtoId, usuarioId },
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!produto) {
      throw new Error('Produto não encontrado');
    }

    const saldoAnterior = parseFloat(produto.quantidade);
    const saldoPosterior = parseFloat(novaQuantidade);
    const diferenca = saldoPosterior - saldoAnterior;

    produto.quantidade = saldoPosterior;
    await produto.save({ transaction: t });

    const movimentacao = await MovimentacaoEstoque.create({
      usuarioId,
      produtoId,
      tipo: 'ajuste',
      quantidade: diferenca,
      precoUnitario: produto.precoMedioCusto,
      saldoAnterior,
      saldoPosterior,
      motivo: motivo || 'Ajuste de inventário'
    }, { transaction: t });

    return { produto, movimentacao };
  });
};

/**
 * Lista produtos com saldo igual ou abaixo do estoque mínimo
 */
const listarAlertasEstoqueMinimo = async (usuarioId) => {
  const produtos = await Produto.findAll({
    where: { usuarioId, ativo: true }
  });

  return produtos
    .filter(p => parseFloat(p.quantidade) <= parseFloat(p.estoqueMinimo))
    .map(p => ({
      id: p.id,
      codigo: p.codigo,
      descricao: p.descricao,
      quantidade: p.quantidade,
      estoqueMinimo: p.estoqueMinimo,
      falta: Math.max(0, parseFloat(p.estoqueMinimo) - parseFloat(p.quantidade))
    }));
};

/**
 * Histórico de movimentações com filtros opcionais
 */
const obterHistorico = async (usuarioId, { produtoId, tipo, dataInicio, dataFim, pagina = 1, limite = 50 } = {}) => {
  const { Op } = require('sequelize');
  const where = { usuarioId };

  if (produtoId) where.produtoId = produtoId;
  if (tipo) where.tipo = tipo;
  if (dataInicio || dataFim) {
    where.dataMovimentacao = {};
    if (dataInicio) where.dataMovimentacao[Op.gte] = new Date(dataInicio);
    if (dataFim) where.dataMovimentacao[Op.lte] = new Date(dataFim);
  }

  const { count, rows } = await MovimentacaoEstoque.findAndCountAll({
    where,
    offset: (pagina - 1) * limite,
    limit: parseInt(limite),
    order: [['dataMovimentacao', 'DESC']]
  });

  return { total: count, pagina: parseInt(pagina), limite: parseInt(limite), movimentacoes: rows };
};

/**
 * Relatório consolidado de estoque (valor total em custo, itens abaixo do mínimo, etc.)
 */
const gerarRelatorioEstoque = async (usuarioId) => {
  const produtos = await Produto.findAll({ where: { usuarioId, ativo: true } });

  let valorTotalCusto = 0;
  let valorTotalVenda = 0;
  let itensAbaixoMinimo = 0;

  for (const p of produtos) {
    const qtd = parseFloat(p.quantidade);
    valorTotalCusto += qtd * parseFloat(p.precoMedioCusto || 0);
    valorTotalVenda += qtd * parseFloat(p.precoVenda || 0);
    if (qtd <= parseFloat(p.estoqueMinimo)) itensAbaixoMinimo += 1;
  }

  return {
    totalProdutos: produtos.length,
    itensAbaixoMinimo,
    valorTotalCusto: Number(valorTotalCusto.toFixed(2)),
    valorTotalVenda: Number(valorTotalVenda.toFixed(2)),
    margemPotencial: Number((valorTotalVenda - valorTotalCusto).toFixed(2))
  };
};

module.exports = {
  calcularPrecoMedio,
  registrarEntrada,
  registrarSaida,
  registrarAjuste,
  listarAlertasEstoqueMinimo,
  obterHistorico,
  gerarRelatorioEstoque
};
