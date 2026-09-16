const Destinatario = require('../models/Destinatario');
const { Op } = require('sequelize');

const criar = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const { nome, cpfCnpj, contribuinteIcms, inscricaoEstadual, email, telefone, uf, cidade, cep, logradouro, numero, bairro } = req.body;

    if (!nome || !cpfCnpj || !uf) {
      return res.status(400).json({ error: 'Nome, cpfCnpj e uf são obrigatórios' });
    }

    const existente = await Destinatario.findOne({ where: { usuarioId, cpfCnpj } });
    if (existente) {
      return res.status(409).json({ error: 'Já existe um destinatário com esse CPF/CNPJ' });
    }

    const destinatario = await Destinatario.create({
      usuarioId, nome, cpfCnpj, contribuinteIcms: !!contribuinteIcms, inscricaoEstadual,
      email, telefone, uf, cidade, cep, logradouro, numero, bairro
    });

    res.status(201).json({ mensagem: 'Destinatário criado com sucesso', destinatario });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const listar = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const { busca, pagina = 1, limite = 20 } = req.query;

    const where = { usuarioId, ativo: true };
    if (busca) {
      where[Op.or] = [
        { nome: { [Op.iLike]: `%${busca}%` } },
        { cpfCnpj: { [Op.iLike]: `%${busca}%` } }
      ];
    }

    const { count, rows } = await Destinatario.findAndCountAll({
      where,
      offset: (pagina - 1) * limite,
      limit: parseInt(limite),
      order: [['nome', 'ASC']]
    });

    res.json({ total: count, pagina: parseInt(pagina), limite: parseInt(limite), destinatarios: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const obter = async (req, res) => {
  try {
    const destinatario = await Destinatario.findOne({ where: { id: req.params.id, usuarioId: req.usuario.id } });
    if (!destinatario) return res.status(404).json({ error: 'Destinatário não encontrado' });
    res.json(destinatario);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const atualizar = async (req, res) => {
  try {
    const destinatario = await Destinatario.findOne({ where: { id: req.params.id, usuarioId: req.usuario.id } });
    if (!destinatario) return res.status(404).json({ error: 'Destinatário não encontrado' });

    const campos = ['nome', 'contribuinteIcms', 'inscricaoEstadual', 'email', 'telefone', 'uf', 'cidade', 'cep', 'logradouro', 'numero', 'bairro', 'ativo'];
    for (const campo of campos) {
      if (req.body[campo] !== undefined) destinatario[campo] = req.body[campo];
    }
    await destinatario.save();

    res.json({ mensagem: 'Destinatário atualizado com sucesso', destinatario });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const remover = async (req, res) => {
  try {
    const destinatario = await Destinatario.findOne({ where: { id: req.params.id, usuarioId: req.usuario.id } });
    if (!destinatario) return res.status(404).json({ error: 'Destinatário não encontrado' });

    destinatario.ativo = false;
    await destinatario.save();

    res.json({ mensagem: 'Destinatário removido com sucesso' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { criar, listar, obter, atualizar, remover };
