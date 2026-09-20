/**
 * Lógica central de emissão de NF-e a partir de dados estruturados
 * (destinatário + itens do catálogo). Extraído do controller HTTP para
 * ser reutilizável por outras entradas além da tela de emissão — por
 * exemplo, um pedido importado de um marketplace (ver
 * marketplaceService.js) precisa do mesmo caminho (numeração, XML,
 * baixa de estoque em transação), não uma segunda implementação que
 * pode divergir da testada aqui.
 */

const NFe = require('../models/NFe');
const Destinatario = require('../models/Destinatario');
const Produto = require('../models/Produto');
const ItemNFe = require('../models/ItemNFe');
const Usuario = require('../models/Usuario');
const sequelize = require('../config/database');
const { montarXmlNFe } = require('./nfeXmlBuilder');
const { sugerirClassificacaoFiscal } = require('./fiscalRulesService');
const estoqueService = require('./estoqueService');

const TIPOS_OPERACAO_EMISSAO = ['venda', 'devolucaoDeCompra'];

class ErroEmissao extends Error {
  constructor(mensagem, status = 400) {
    super(mensagem);
    this.status = status;
  }
}

const gerarProximoNumero = async (usuarioId, serie) => {
  // Só considera notas EMITIDAS por esta empresa — a numeração de notas
  // recebidas (importadas de fornecedores) pertence a quem as emitiu, não
  // pode competir com a numeração de vendas desta empresa.
  const ultima = await NFe.findOne({ where: { usuarioId, serie, direcao: 'emitida' }, order: [['numero', 'DESC']] });
  return ultima ? ultima.numero + 1 : 1;
};

/**
 * Emite uma NF-e. Lança ErroEmissao (com .status) em qualquer falha de
 * validação — quem chama decide como apresentar isso (resposta HTTP,
 * mensagem de log, etc).
 */
const emitirNFe = async (usuarioId, {
  destinatarioId,
  destinatario: destinatarioInline,
  itens,
  serie = 1,
  naturezaOperacao,
  observacoes,
  tipoOperacao = 'venda',
  baixarEstoque = true
}) => {
  if (!TIPOS_OPERACAO_EMISSAO.includes(tipoOperacao)) {
    throw new ErroEmissao(`tipoOperacao deve ser um de: ${TIPOS_OPERACAO_EMISSAO.join(', ')}`);
  }
  if (!Array.isArray(itens) || itens.length === 0) {
    throw new ErroEmissao('Informe ao menos um item em "itens"');
  }

  const emitente = await Usuario.findByPk(usuarioId);
  if (!emitente.uf) {
    throw new ErroEmissao('Configure a UF da empresa em PUT /api/usuarios/perfil (campo "uf") antes de emitir');
  }

  // Resolver destinatário: por id existente, ou cadastro rápido inline
  let destinatario;
  if (destinatarioId) {
    destinatario = await Destinatario.findOne({ where: { id: destinatarioId, usuarioId } });
    if (!destinatario) throw new ErroEmissao('Destinatário não encontrado', 404);
  } else if (destinatarioInline) {
    const { nome, cpfCnpj, uf, contribuinteIcms, inscricaoEstadual, email, telefone, cidade, cep, logradouro, numero: numeroEndereco, bairro } = destinatarioInline;
    if (!nome || !cpfCnpj || !uf) {
      throw new ErroEmissao('destinatario.nome, destinatario.cpfCnpj e destinatario.uf são obrigatórios');
    }
    destinatario = await Destinatario.findOne({ where: { usuarioId, cpfCnpj } });
    if (!destinatario) {
      destinatario = await Destinatario.create({
        usuarioId, nome, cpfCnpj, uf: uf.toUpperCase(), contribuinteIcms: !!contribuinteIcms, inscricaoEstadual,
        email, telefone, cidade, cep, logradouro, numero: numeroEndereco, bairro
      });
    }
  } else {
    throw new ErroEmissao('Informe destinatarioId ou destinatario (dados para cadastro rápido)');
  }

  // Processar itens: carregar produto, validar estoque, sugerir classificação fiscal
  const itensProcessados = [];
  const avisos = [];

  for (const itemReq of itens) {
    const { produtoId, quantidade, valorUnitario, cfop: cfopOverride, tabelaIcms: tabelaOverride, codigoIcms: codigoOverride, icmsAliquota: icmsAliquotaOverride } = itemReq;

    if (!produtoId || !quantidade || quantidade <= 0) {
      throw new ErroEmissao('Cada item precisa de produtoId e quantidade maior que zero');
    }

    const produto = await Produto.findOne({ where: { id: produtoId, usuarioId } });
    if (!produto) {
      throw new ErroEmissao(`Produto ${produtoId} não encontrado`, 404);
    }

    if (baixarEstoque && parseFloat(produto.quantidade) < parseFloat(quantidade)) {
      throw new ErroEmissao(`Estoque insuficiente para "${produto.descricao}". Saldo atual: ${produto.quantidade}`);
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

  return { nfe: resultado.nfe, itens: resultado.itens, destinatario, avisos };
};

module.exports = { emitirNFe, gerarProximoNumero, ErroEmissao, TIPOS_OPERACAO_EMISSAO };
