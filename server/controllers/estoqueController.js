const Produto = require('../models/Produto');
const estoqueService = require('../services/estoqueService');

/**
 * Criar produto
 */
const criarProduto = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const { codigo, descricao, unidade, finalidade, quantidade, estoqueMinimo, precoCusto, precoVenda, ncm, cfop, icmsAliquota, ipiAliquota } = req.body;

    if (!codigo || !descricao) {
      return res.status(400).json({ error: 'Código e descrição são obrigatórios' });
    }

    const existente = await Produto.findOne({ where: { usuarioId, codigo } });
    if (existente) {
      return res.status(409).json({ error: 'Já existe um produto com esse código' });
    }

    const produto = await Produto.create({
      usuarioId,
      codigo,
      descricao,
      unidade,
      finalidade,
      quantidade: quantidade || 0,
      estoqueMinimo: estoqueMinimo || 0,
      precoCusto: precoCusto || 0,
      precoMedioCusto: precoCusto || 0,
      precoVenda: precoVenda || 0,
      ncm,
      cfop,
      icmsAliquota,
      ipiAliquota
    });

    res.status(201).json({ mensagem: 'Produto criado com sucesso', produto });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

/**
 * Listar produtos com filtros e paginação
 */
const listarProdutos = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const { busca, pagina = 1, limite = 20 } = req.query;
    const { Op } = require('sequelize');

    const where = { usuarioId };
    if (busca) {
      where[Op.or] = [
        { codigo: { [Op.iLike]: `%${busca}%` } },
        { descricao: { [Op.iLike]: `%${busca}%` } }
      ];
    }

    const { count, rows } = await Produto.findAndCountAll({
      where,
      offset: (pagina - 1) * limite,
      limit: parseInt(limite),
      order: [['descricao', 'ASC']]
    });

    res.json({ total: count, pagina: parseInt(pagina), limite: parseInt(limite), produtos: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Obter produto por id
 */
const obterProduto = async (req, res) => {
  try {
    const produto = await Produto.findOne({
      where: { id: req.params.id, usuarioId: req.usuario.id }
    });

    if (!produto) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    res.json(produto);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Atualizar produto (dados cadastrais, não o saldo)
 */
const atualizarProduto = async (req, res) => {
  try {
    const produto = await Produto.findOne({
      where: { id: req.params.id, usuarioId: req.usuario.id }
    });

    if (!produto) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const camposPermitidos = ['descricao', 'unidade', 'finalidade', 'estoqueMinimo', 'precoCusto', 'precoVenda', 'ncm', 'cfop', 'cstIcms', 'icmsAliquota', 'cstIpi', 'ipiAliquota', 'ativo'];
    for (const campo of camposPermitidos) {
      if (req.body[campo] !== undefined) produto[campo] = req.body[campo];
    }

    await produto.save();

    res.json({ mensagem: 'Produto atualizado com sucesso', produto });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

/**
 * Remover produto (soft delete via flag ativo)
 */
const removerProduto = async (req, res) => {
  try {
    const produto = await Produto.findOne({
      where: { id: req.params.id, usuarioId: req.usuario.id }
    });

    if (!produto) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    produto.ativo = false;
    await produto.save();

    res.json({ mensagem: 'Produto removido com sucesso' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const entrada = async (req, res) => {
  try {
    const resultado = await estoqueService.registrarEntrada(req.usuario.id, req.body);
    res.status(201).json({ mensagem: 'Entrada registrada com sucesso', ...resultado });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const saida = async (req, res) => {
  try {
    const resultado = await estoqueService.registrarSaida(req.usuario.id, req.body);
    res.status(201).json({ mensagem: 'Saída registrada com sucesso', ...resultado });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const ajuste = async (req, res) => {
  try {
    const resultado = await estoqueService.registrarAjuste(req.usuario.id, req.body);
    res.status(201).json({ mensagem: 'Ajuste registrado com sucesso', ...resultado });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const alertas = async (req, res) => {
  try {
    const alertas = await estoqueService.listarAlertasEstoqueMinimo(req.usuario.id);
    res.json({ total: alertas.length, alertas });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const historico = async (req, res) => {
  try {
    const resultado = await estoqueService.obterHistorico(req.usuario.id, req.query);
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const relatorio = async (req, res) => {
  try {
    const resultado = await estoqueService.gerarRelatorioEstoque(req.usuario.id);
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  criarProduto,
  listarProdutos,
  obterProduto,
  atualizarProduto,
  removerProduto,
  entrada,
  saida,
  ajuste,
  alertas,
  historico,
  relatorio
};
