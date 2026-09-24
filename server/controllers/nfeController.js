const NFe = require('../models/NFe');
const Certificado = require('../models/Certificado');
const { xmlParaObjeto, validarXmlBasico, extrairChaveNFe, formatarXml } = require('../utils/xmlHelper');
const { assinarXml } = require('../services/assinaturaService');
const { enviarNFeAutorizacao, consultarStatusNFe } = require('../services/sefazService');
const emissaoService = require('../services/emissaoService');
const { descriptografar } = require('../utils/criptografia');
const { Op } = require('sequelize');

/**
 * Listar NF-es do usuário
 */
const listar = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const { status, cnpj, direcao, dataInicio, dataFim, pagina = 1, limite = 20 } = req.query;

    const where = { usuarioId };

    if (status) where.statusSEFAZ = status;
    if (cnpj) where.cnpj = cnpj;
    if (direcao) where.direcao = direcao;

    if (dataInicio || dataFim) {
      where.dataEmissao = {};
      if (dataInicio) where.dataEmissao[Op.gte] = new Date(dataInicio);
      if (dataFim) where.dataEmissao[Op.lte] = new Date(dataFim);
    }

    const { count, rows } = await NFe.findAndCountAll({
      where,
      offset: (pagina - 1) * limite,
      limit: parseInt(limite),
      order: [['dataEmissao', 'DESC']]
    });

    res.json({
      total: count,
      pagina: parseInt(pagina),
      limite: parseInt(limite),
      nfes: rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Obter NF-e por chave ou ID
 */
const obter = async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioId = req.usuario.id;

    const nfe = await NFe.findOne({
      where: {
        [Op.or]: [
          { id },
          { chaveNFe: id }
        ],
        usuarioId
      }
    });

    if (!nfe) {
      return res.status(404).json({ error: 'NF-e não encontrada' });
    }

    res.json(nfe);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Buscar NF-e por critérios
 */
const buscar = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const { chaveNFe, cnpj, numero, dataInicio, dataFim, statusSEFAZ } = req.query;

    const where = { usuarioId };

    if (chaveNFe) where.chaveNFe = chaveNFe;
    if (cnpj) where.cnpj = cnpj;
    if (numero) where.numero = parseInt(numero);
    if (statusSEFAZ) where.statusSEFAZ = statusSEFAZ;

    if (dataInicio || dataFim) {
      where.dataEmissao = {};
      if (dataInicio) where.dataEmissao[Op.gte] = new Date(dataInicio);
      if (dataFim) where.dataEmissao[Op.lte] = new Date(dataFim);
    }

    const nfes = await NFe.findAll({
      where,
      limit: 50,
      order: [['dataEmissao', 'DESC']]
    });

    res.json({
      total: nfes.length,
      nfes
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Criar nova NF-e
 */
const criar = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const { xmlContent, cnpj, numero, serie = 1, valor, nomeCliente, cpfCnpjCliente } = req.body;

    if (!xmlContent) {
      return res.status(400).json({ error: 'XML é obrigatório' });
    }

    // Validar XML
    await validarXmlBasico(xmlContent);

    // Extrair chave
    const chaveNFe = await extrairChaveNFe(xmlContent);

    // Verificar se já existe
    const existente = await NFe.findOne({ where: { chaveNFe } });
    if (existente) {
      return res.status(409).json({ error: 'Essa NF-e já foi registrada' });
    }

    // Criar NF-e
    const nfe = await NFe.create({
      usuarioId,
      chaveNFe,
      cnpj,
      numero,
      serie,
      xmlContent,
      valor,
      nomeCliente,
      cpfCnpjCliente,
      statusSEFAZ: 'pendente'
    });

    res.status(201).json({
      mensagem: 'NF-e criada com sucesso',
      nfe
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

/**
 * Assinar NF-e
 */
const assinar = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const { id } = req.params;

    // Obter NF-e
    const nfe = await NFe.findOne({
      where: { id, usuarioId }
    });

    if (!nfe) {
      return res.status(404).json({ error: 'NF-e não encontrada' });
    }

    // Obter certificado do usuário
    const certificado = await Certificado.findOne({
      where: { usuarioId, cnpj: nfe.cnpj, ativo: true }
    });

    if (!certificado) {
      return res.status(404).json({
        error: 'Certificado digital não encontrado para este CNPJ'
      });
    }

    // Assinar XML
    const xmlAssinado = await assinarXml(
      nfe.xmlContent,
      certificado.caminhoArquivo,
      descriptografar(certificado.senha)
    );

    // Salvar XML assinado
    nfe.xmlAssinado = xmlAssinado;
    nfe.statusSEFAZ = 'pronta_para_envio';
    await nfe.save();

    res.json({
      mensagem: 'NF-e assinada com sucesso',
      nfe
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

/**
 * Enviar NF-e para SEFAZ
 */
const enviar = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const { id } = req.params;

    const nfe = await NFe.findOne({
      where: { id, usuarioId }
    });

    if (!nfe) {
      return res.status(404).json({ error: 'NF-e não encontrada' });
    }

    if (!nfe.xmlAssinado) {
      return res.status(400).json({ error: 'NF-e precisa estar assinada primeiro' });
    }

    // Obter certificado
    const certificado = await Certificado.findOne({
      where: { usuarioId, cnpj: nfe.cnpj, ativo: true }
    });

    if (!certificado) {
      return res.status(404).json({ error: 'Certificado não encontrado' });
    }

    // Enviar para SEFAZ
    const resposta = await enviarNFeAutorizacao(
      nfe.xmlAssinado,
      certificado.caminhoArquivo,
      descriptografar(certificado.senha),
      nfe.cnpj.substring(8, 10) // UF extraída do CNPJ
    );

    // Atualizar status
    nfe.statusSEFAZ = resposta.statusNFe || 'enviada';
    nfe.protocolo = resposta.protocolo;
    await nfe.save();

    res.json({
      mensagem: 'NF-e enviada com sucesso',
      nfe,
      resposta
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

/**
 * Consultar status na SEFAZ
 */
const consultarStatus = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const { chaveNFe } = req.params;

    const nfe = await NFe.findOne({
      where: { chaveNFe, usuarioId }
    });

    if (!nfe) {
      return res.status(404).json({ error: 'NF-e não encontrada' });
    }

    const certificado = await Certificado.findOne({
      where: { usuarioId, cnpj: nfe.cnpj, ativo: true }
    });

    if (!certificado) {
      return res.status(404).json({ error: 'Certificado não encontrado' });
    }

    // Consultar SEFAZ
    const resposta = await consultarStatusNFe(
      chaveNFe,
      certificado.caminhoArquivo,
      descriptografar(certificado.senha)
    );

    // Atualizar status
    nfe.statusSEFAZ = resposta.statusNFe;
    nfe.protocolo = resposta.protocolo;
    await nfe.save();

    res.json({
      nfe,
      status: resposta.statusNFe
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

/**
 * Obter XML formatado
 */
const obterXml = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const { id } = req.params;

    const nfe = await NFe.findOne({
      where: { id, usuarioId }
    });

    if (!nfe) {
      return res.status(404).json({ error: 'NF-e não encontrada' });
    }

    const xml = nfe.xmlAssinado || nfe.xmlContent;
    const xmlFormatado = formatarXml(xml);

    res.json({
      xml: xmlFormatado,
      formatado: true
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Emite uma NF-e a partir de dados estruturados (destinatário + itens do
 * catálogo de produtos). A lógica de verdade mora em emissaoService.js —
 * este handler só traduz requisição HTTP <-> chamada de serviço, porque
 * o mesmo caminho de emissão também é usado pela importação de pedidos
 * de marketplace (ver marketplaceController.js).
 */
const emitir = async (req, res) => {
  try {
    const resultado = await emissaoService.emitirNFe(req.usuario.id, req.body);
    res.status(201).json({ mensagem: 'NF-e emitida com sucesso', ...resultado });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
};

module.exports = {
  listar,
  obter,
  buscar,
  criar,
  assinar,
  enviar,
  consultarStatus,
  obterXml,
  emitir
};
