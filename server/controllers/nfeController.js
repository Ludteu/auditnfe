const NFe = require('../models/NFe');
const Certificado = require('../models/Certificado');
const Destinatario = require('../models/Destinatario');
const Produto = require('../models/Produto');
const ItemNFe = require('../models/ItemNFe');
const Usuario = require('../models/Usuario');
const sequelize = require('../config/database');
const { xmlParaObjeto, validarXmlBasico, extrairChaveNFe, formatarXml } = require('../utils/xmlHelper');
const { assinarXml } = require('../services/assinaturaService');
const { enviarNFeAutorizacao, consultarStatusNFe } = require('../services/sefazService');
const { montarXmlNFe } = require('../services/nfeXmlBuilder');
const { sugerirClassificacaoFiscal } = require('../services/fiscalRulesService');
const estoqueService = require('../services/estoqueService');
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
      process.env.CERT_PASSWORD
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
      process.env.CERT_PASSWORD,
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
      process.env.CERT_PASSWORD
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

const TIPOS_OPERACAO_EMISSAO = ['venda', 'devolucaoDeCompra'];

const gerarProximoNumero = async (usuarioId, serie) => {
  // Só considera notas EMITIDAS por esta empresa — a numeração de notas
  // recebidas (importadas de fornecedores) pertence a quem as emitiu, não
  // pode competir com a numeração de vendas desta empresa.
  const ultima = await NFe.findOne({ where: { usuarioId, serie, direcao: 'emitida' }, order: [['numero', 'DESC']] });
  return ultima ? ultima.numero + 1 : 1;
};

/**
 * Emite uma NF-e a partir de dados estruturados (destinatário + itens do
 * catálogo de produtos) em vez de um XML pronto. Para cada item, sugere
 * CFOP/CST/CSOSN automaticamente via fiscalRulesService (a partir da
 * finalidade do produto), monta o XML, numera a nota automaticamente e
 * — por padrão — baixa o estoque, tudo em uma única transação (se a
 * baixa de qualquer item falhar por saldo insuficiente, nada é criado).
 */
const emitir = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const {
      destinatarioId,
      destinatario: destinatarioInline,
      itens,
      serie = 1,
      naturezaOperacao,
      observacoes,
      tipoOperacao = 'venda',
      baixarEstoque = true
    } = req.body;

    if (!TIPOS_OPERACAO_EMISSAO.includes(tipoOperacao)) {
      return res.status(400).json({ error: `tipoOperacao deve ser um de: ${TIPOS_OPERACAO_EMISSAO.join(', ')}` });
    }
    if (!Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ error: 'Informe ao menos um item em "itens"' });
    }

    const emitente = await Usuario.findByPk(usuarioId);
    if (!emitente.uf) {
      return res.status(400).json({ error: 'Configure a UF da empresa em PUT /api/usuarios/perfil (campo "uf") antes de emitir' });
    }

    // Resolver destinatário: por id existente, ou cadastro rápido inline
    let destinatario;
    if (destinatarioId) {
      destinatario = await Destinatario.findOne({ where: { id: destinatarioId, usuarioId } });
      if (!destinatario) return res.status(404).json({ error: 'Destinatário não encontrado' });
    } else if (destinatarioInline) {
      const { nome, cpfCnpj, uf, contribuinteIcms, inscricaoEstadual, email, telefone, cidade, cep, logradouro, numero: numeroEndereco, bairro } = destinatarioInline;
      if (!nome || !cpfCnpj || !uf) {
        return res.status(400).json({ error: 'destinatario.nome, destinatario.cpfCnpj e destinatario.uf são obrigatórios' });
      }
      destinatario = await Destinatario.findOne({ where: { usuarioId, cpfCnpj } });
      if (!destinatario) {
        destinatario = await Destinatario.create({
          usuarioId, nome, cpfCnpj, uf: uf.toUpperCase(), contribuinteIcms: !!contribuinteIcms, inscricaoEstadual,
          email, telefone, cidade, cep, logradouro, numero: numeroEndereco, bairro
        });
      }
    } else {
      return res.status(400).json({ error: 'Informe destinatarioId ou destinatario (dados para cadastro rápido)' });
    }

    // Processar itens: carregar produto, validar estoque, sugerir classificação fiscal
    const itensProcessados = [];
    const avisos = [];

    for (const itemReq of itens) {
      const { produtoId, quantidade, valorUnitario, cfop: cfopOverride, tabelaIcms: tabelaOverride, codigoIcms: codigoOverride, icmsAliquota: icmsAliquotaOverride } = itemReq;

      if (!produtoId || !quantidade || quantidade <= 0) {
        return res.status(400).json({ error: 'Cada item precisa de produtoId e quantidade maior que zero' });
      }

      const produto = await Produto.findOne({ where: { id: produtoId, usuarioId } });
      if (!produto) {
        return res.status(404).json({ error: `Produto ${produtoId} não encontrado` });
      }

      if (baixarEstoque && parseFloat(produto.quantidade) < parseFloat(quantidade)) {
        return res.status(400).json({ error: `Estoque insuficiente para "${produto.descricao}". Saldo atual: ${produto.quantidade}` });
      }

      let classificacao;
      if (cfopOverride && tabelaOverride && codigoOverride) {
        classificacao = { cfop: cfopOverride, tabelaIcms: tabelaOverride, codigoIcms: codigoOverride, avisos: [`Item "${produto.descricao}": CFOP/CST informados manualmente, sem passar pelo motor de sugestão.`] };
      } else {
        classificacao = sugerirClassificacaoFiscal({
          finalidade: produto.finalidade,
          tipoOperacao,
          ufOrigem: emitente.uf,
          ufDestino: destinatario.uf,
          regimeTributario: emitente.regimeTributario
        });
      }
      avisos.push(...(classificacao.avisos || []));

      const unitario = valorUnitario != null ? Number(valorUnitario) : Number(produto.precoVenda || 0);
      const valorTotalItem = Number((unitario * Number(quantidade)).toFixed(2));
      const icmsAliquota = icmsAliquotaOverride != null ? Number(icmsAliquotaOverride) : Number(produto.icmsAliquota || 0);
      const icmsDestacaValor = classificacao.tabelaIcms === 'CST' && !['40', '41'].includes(classificacao.codigoIcms);
      const icmsValor = icmsDestacaValor ? Number((valorTotalItem * icmsAliquota / 100).toFixed(2)) : 0;
      const ipiAliquota = Number(produto.ipiAliquota || 0);
      const ipiValor = ipiAliquota > 0 ? Number((valorTotalItem * ipiAliquota / 100).toFixed(2)) : 0;

      itensProcessados.push({
        produto, quantidade: Number(quantidade), valorUnitario: unitario, valorTotal: valorTotalItem,
        codigo: produto.codigo, descricao: produto.descricao, ncm: produto.ncm, unidade: produto.unidade,
        cfop: classificacao.cfop, tabelaIcms: classificacao.tabelaIcms, codigoIcms: classificacao.codigoIcms,
        icmsAliquota, icmsBaseCalculo: valorTotalItem, icmsValor,
        cstIpi: produto.cstIpi, ipiAliquota, ipiValor
      });
    }

    const numero = await gerarProximoNumero(usuarioId, serie);
    const dataEmissao = new Date();

    const { xmlContent, chaveNFe } = montarXmlNFe({
      emitente, destinatario, itens: itensProcessados, numero, serie, naturezaOperacao, dataEmissao, observacoes
    });

    const valorTotalNota = Number(itensProcessados.reduce((soma, i) => soma + i.valorTotal, 0).toFixed(2));

    const resultado = await sequelize.transaction(async (t) => {
      const nfe = await NFe.create({
        usuarioId,
        destinatarioId: destinatario.id,
        naturezaOperacao: naturezaOperacao || 'Venda de mercadoria',
        chaveNFe,
        cnpj: emitente.cnpj,
        numero,
        serie,
        xmlContent,
        statusSEFAZ: 'pendente',
        dataEmissao,
        valor: valorTotalNota,
        nomeCliente: destinatario.nome,
        cpfCnpjCliente: destinatario.cpfCnpj
      }, { transaction: t });

      const itensCriados = [];
      for (const item of itensProcessados) {
        const itemCriado = await ItemNFe.create({
          nfeId: nfe.id,
          produtoId: item.produto.id,
          codigo: item.codigo,
          descricao: item.descricao,
          ncm: item.ncm,
          cfop: item.cfop,
          unidade: item.unidade,
          quantidade: item.quantidade,
          valorUnitario: item.valorUnitario,
          valorTotal: item.valorTotal,
          tabelaIcms: item.tabelaIcms,
          codigoIcms: item.codigoIcms,
          icmsAliquota: item.icmsAliquota,
          icmsValor: item.icmsValor,
          cstIpi: item.cstIpi,
          ipiAliquota: item.ipiAliquota,
          ipiValor: item.ipiValor
        }, { transaction: t });
        itensCriados.push(itemCriado);

        if (baixarEstoque) {
          await estoqueService.registrarSaida(usuarioId, {
            produtoId: item.produto.id,
            quantidade: item.quantidade,
            motivo: `NF-e ${numero}/${serie}`,
            nfeId: nfe.id
          }, t);
        }
      }

      return { nfe, itens: itensCriados };
    });

    res.status(201).json({
      mensagem: 'NF-e emitida com sucesso',
      nfe: resultado.nfe,
      itens: resultado.itens,
      destinatario,
      avisos
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
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
