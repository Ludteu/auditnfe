const express = require('express');
const autenticacao = require('../middleware/autenticacao');
const Usuario = require('../models/Usuario');
const Certificado = require('../models/Certificado');

const router = express.Router();

// Proteger rotas com autenticação
router.use(autenticacao);

/**
 * GET /api/usuarios/perfil
 * Obter perfil do usuário autenticado
 */
router.get('/perfil', async (req, res) => {
  try {
    const usuario = await Usuario.findByPk(req.usuario.id, {
      attributes: { exclude: ['senha'] }
    });

    if (!usuario) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json(usuario);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/usuarios/perfil
 * Atualizar perfil do usuário
 */
router.put('/perfil', async (req, res) => {
  try {
    const { nome, razaoSocial, regimeTributario, uf } = req.body;
    const usuario = await Usuario.findByPk(req.usuario.id);

    if (!usuario) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const regimesValidos = ['simples_nacional', 'lucro_presumido', 'lucro_real'];
    if (regimeTributario !== undefined) {
      if (regimeTributario !== null && !regimesValidos.includes(regimeTributario)) {
        return res.status(400).json({ error: `regimeTributario deve ser um de: ${regimesValidos.join(', ')}` });
      }
      usuario.regimeTributario = regimeTributario;
    }

    if (nome) usuario.nome = nome;
    if (razaoSocial) usuario.razaoSocial = razaoSocial;
    if (uf) usuario.uf = String(uf).toUpperCase();

    await usuario.save();

    res.json({
      mensagem: 'Perfil atualizado com sucesso',
      usuario
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/usuarios/certificados
 * Listar certificados do usuário
 */
router.get('/certificados', async (req, res) => {
  try {
    const certificados = await Certificado.findAll({
      where: { usuarioId: req.usuario.id },
      attributes: { exclude: ['caminhoArquivo'] },
      order: [['createdAt', 'DESC']]
    });

    res.json(certificados);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/usuarios/certificados/:id
 * Obter certificado específico
 */
router.get('/certificados/:id', async (req, res) => {
  try {
    const certificado = await Certificado.findOne({
      where: { id: req.params.id, usuarioId: req.usuario.id },
      attributes: { exclude: ['caminhoArquivo'] }
    });

    if (!certificado) {
      return res.status(404).json({ error: 'Certificado não encontrado' });
    }

    res.json(certificado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/usuarios/certificados
 * Adicionar novo certificado
 */
router.post('/certificados', async (req, res) => {
  try {
    const { cnpj, validoAte, descricao, caminhoArquivo } = req.body;

    const certificado = await Certificado.create({
      usuarioId: req.usuario.id,
      cnpj,
      validoAte: new Date(validoAte),
      descricao,
      caminhoArquivo,
      ativo: true
    });

    res.status(201).json({
      mensagem: 'Certificado adicionado com sucesso',
      certificado
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * PUT /api/usuarios/certificados/:id/ativar
 * Ativar certificado
 */
router.put('/certificados/:id/ativar', async (req, res) => {
  try {
    const certificado = await Certificado.findOne({
      where: { id: req.params.id, usuarioId: req.usuario.id }
    });

    if (!certificado) {
      return res.status(404).json({ error: 'Certificado não encontrado' });
    }

    // Desativar outros certificados do mesmo CNPJ
    await Certificado.update(
      { ativo: false },
      { where: { cnpj: certificado.cnpj, usuarioId: req.usuario.id } }
    );

    // Ativar este certificado
    certificado.ativo = true;
    await certificado.save();

    res.json({
      mensagem: 'Certificado ativado com sucesso',
      certificado
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/usuarios/certificados/:id
 * Deletar certificado
 */
router.delete('/certificados/:id', async (req, res) => {
  try {
    const certificado = await Certificado.findOne({
      where: { id: req.params.id, usuarioId: req.usuario.id }
    });

    if (!certificado) {
      return res.status(404).json({ error: 'Certificado não encontrado' });
    }

    await certificado.destroy();

    res.json({ mensagem: 'Certificado deletado com sucesso' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
