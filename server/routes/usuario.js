const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const autenticacao = require('../middleware/autenticacao');
const Usuario = require('../models/Usuario');
const Certificado = require('../models/Certificado');
const { consultarCnpj } = require('../services/cnpjLookupService');

const router = express.Router();

const diretorioCertificados = path.join(__dirname, '../../uploads/certificados');
fs.mkdirSync(diretorioCertificados, { recursive: true });

const uploadCertificado = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, diretorioCertificados),
    filename: (req, file, cb) => cb(null, `${req.usuario.id}-${Date.now()}${path.extname(file.originalname)}`)
  }),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Proteger rotas com autenticação
router.use(autenticacao);

/**
 * GET /api/usuarios/consulta-cnpj/:cnpj
 * Consulta dados públicos do CNPJ na Receita Federal (via BrasilAPI) para
 * pré-preencher o cadastro da empresa. Não salva nada — só devolve os dados.
 */
router.get('/consulta-cnpj/:cnpj', async (req, res) => {
  try {
    const dados = await consultarCnpj(req.params.cnpj);
    res.json(dados);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

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
    const { nome, razaoSocial, regimeTributario, uf, nomeFantasia, cidade, cep, logradouro, numero, bairro, telefone } = req.body;
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
    if (nomeFantasia !== undefined) usuario.nomeFantasia = nomeFantasia;
    if (cidade !== undefined) usuario.cidade = cidade;
    if (cep !== undefined) usuario.cep = cep;
    if (logradouro !== undefined) usuario.logradouro = logradouro;
    if (numero !== undefined) usuario.numero = numero;
    if (bairro !== undefined) usuario.bairro = bairro;
    if (telefone !== undefined) usuario.telefone = telefone;

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
 * POST /api/usuarios/certificados/upload
 * Envia o arquivo .pfx/.p12 do certificado digital (multipart/form-data,
 * campo "certificado") e registra os metadados. O arquivo fica salvo em
 * uploads/certificados — a senha para assiná-lo/usá-lo continua vindo da
 * variável de ambiente CERT_PASSWORD (.env), nunca é salva no banco.
 */
router.post('/certificados/upload', uploadCertificado.single('certificado'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Envie o arquivo do certificado no campo "certificado"' });
    }

    if (!/\.(pfx|p12)$/i.test(req.file.originalname)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Envie um arquivo .pfx ou .p12' });
    }

    const { cnpj, validoAte, descricao } = req.body;
    if (!cnpj || !validoAte) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'cnpj e validoAte são obrigatórios' });
    }

    const certificado = await Certificado.create({
      usuarioId: req.usuario.id,
      cnpj,
      validoAte: new Date(validoAte),
      descricao: descricao || req.file.originalname,
      caminhoArquivo: req.file.path,
      ativo: true
    });

    const resposta = certificado.toJSON();
    delete resposta.caminhoArquivo;

    res.status(201).json({ mensagem: 'Certificado enviado com sucesso', certificado: resposta });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/usuarios/certificados
 * Adicionar novo certificado (avançado: aponta para um arquivo já
 * existente no servidor em vez de fazer upload — use /upload na UI)
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
