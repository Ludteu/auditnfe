const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const autenticacao = require('../middleware/autenticacao');
const Usuario = require('../models/Usuario');
const Certificado = require('../models/Certificado');
const { consultarCnpj } = require('../services/cnpjLookupService');
const { SEGMENTOS_VALIDOS } = require('../services/reformaTributariaService');
const { lerCertificadoPfx } = require('../services/certificadoPfxService');
const { criptografar } = require('../utils/criptografia');
const { validarCnpj, limparCnpj } = require('../utils/cnpjHelper');

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
    const { nome, cnpj, razaoSocial, regimeTributario, uf, nomeFantasia, cidade, cep, logradouro, numero, bairro, telefone, segmentoTributario, aliquotaIbsTeste, aliquotaCbsTeste } = req.body;
    const usuario = await Usuario.findByPk(req.usuario.id);

    if (!usuario) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    let cnpjMudou = false;
    if (cnpj !== undefined) {
      const cnpjLimpo = limparCnpj(cnpj);
      if (!validarCnpj(cnpjLimpo)) {
        return res.status(400).json({ error: 'CNPJ inválido — confira os dígitos verificadores' });
      }
      if (cnpjLimpo !== usuario.cnpj) {
        usuario.cnpj = cnpjLimpo;
        cnpjMudou = true;
      }
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

    if (segmentoTributario !== undefined) {
      if (!SEGMENTOS_VALIDOS.includes(segmentoTributario)) {
        return res.status(400).json({ error: `segmentoTributario deve ser um de: ${SEGMENTOS_VALIDOS.join(', ')}` });
      }
      usuario.segmentoTributario = segmentoTributario;
    }
    if (aliquotaIbsTeste !== undefined) usuario.aliquotaIbsTeste = aliquotaIbsTeste;
    if (aliquotaCbsTeste !== undefined) usuario.aliquotaCbsTeste = aliquotaCbsTeste;

    await usuario.save();

    // Certificado é uma credencial operacional da empresa atual, não um
    // documento histórico — se o CNPJ da conta era um placeholder (ex: o
    // gerado automaticamente no cadastro rápido) e agora foi corrigido pro
    // CNPJ real, os certificados já enviados acompanham a correção. Sem
    // isso, eles ficam "órfãos": o certificado continua válido, mas as
    // buscas por CNPJ (SEFAZ, assinatura) nunca mais encontram ele.
    if (cnpjMudou) {
      await Certificado.update({ cnpj: usuario.cnpj }, { where: { usuarioId: usuario.id } });
    }

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
      attributes: { exclude: ['caminhoArquivo', 'senha'] },
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
      attributes: { exclude: ['caminhoArquivo', 'senha'] }
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
 * campo "certificado") junto com a senha dele (campo "senha", obrigatório).
 * O CNPJ vem do cadastro de "Minha empresa" (não se pergunta de novo) e a
 * validade é lida do próprio certificado — abrir o arquivo com a senha
 * informada já serve de validação: se a senha estiver errada, rejeita aqui
 * na hora, em vez de deixar o buscador da SEFAZ falhar em silêncio depois.
 * A senha é criptografada antes de ir pro banco (server/utils/criptografia.js).
 */
router.post('/certificados/upload', uploadCertificado.single('certificado'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Envie o arquivo do certificado no campo "certificado"' });
    }

    const limpar = () => fs.unlinkSync(req.file.path);

    if (!/\.(pfx|p12)$/i.test(req.file.originalname)) {
      limpar();
      return res.status(400).json({ error: 'Envie um arquivo .pfx ou .p12' });
    }

    const { senha, descricao } = req.body;
    if (!senha) {
      limpar();
      return res.status(400).json({ error: 'Informe a senha do certificado' });
    }

    const usuario = await Usuario.findByPk(req.usuario.id);
    if (!usuario?.cnpj) {
      limpar();
      return res.status(400).json({ error: 'Cadastre o CNPJ da empresa em "Minha empresa" antes de enviar o certificado' });
    }

    let infoCertificado;
    try {
      infoCertificado = lerCertificadoPfx(req.file.path, senha);
    } catch (error) {
      limpar();
      return res.status(400).json({ error: error.message });
    }

    if (infoCertificado.cnpjCertificado && infoCertificado.cnpjCertificado !== usuario.cnpj) {
      limpar();
      return res.status(400).json({
        error: `Esse certificado foi emitido para o CNPJ ${infoCertificado.cnpjCertificado}, mas a empresa cadastrada é ${usuario.cnpj}. Ajuste o CNPJ em "Minha empresa" ou envie o certificado correto.`
      });
    }

    const certificado = await Certificado.create({
      usuarioId: req.usuario.id,
      cnpj: usuario.cnpj,
      validoAte: infoCertificado.validoAte,
      descricao: descricao || infoCertificado.titular || req.file.originalname,
      caminhoArquivo: req.file.path,
      senha: criptografar(senha),
      ativo: true
    });

    const resposta = certificado.toJSON();
    delete resposta.caminhoArquivo;
    delete resposta.senha;

    res.status(201).json({ mensagem: 'Certificado enviado com sucesso', certificado: resposta });
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

    const caminhoArquivo = certificado.caminhoArquivo;
    await certificado.destroy();
    fs.unlink(caminhoArquivo, () => {}); // best-effort — o registro já foi removido de qualquer forma

    res.json({ mensagem: 'Certificado excluído com sucesso' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
