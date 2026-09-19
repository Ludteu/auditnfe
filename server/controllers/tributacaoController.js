const NFe = require('../models/NFe');
const Produto = require('../models/Produto');
const Usuario = require('../models/Usuario');
const MovimentacaoEstoque = require('../models/MovimentacaoEstoque');
const sequelize = require('../config/database');
const tributacaoService = require('../services/tributacaoService');
const spedService = require('../services/spedService');
const fiscalRulesService = require('../services/fiscalRulesService');
const estoqueService = require('../services/estoqueService');
const sefazDistribuicaoService = require('../services/sefazDistribuicaoService');
const { validarXmlBasico } = require('../utils/xmlHelper');

/**
 * Extrai tributação de um XML enviado diretamente ou de uma NF-e já cadastrada
 */
const extrair = async (req, res) => {
  try {
    const { xmlContent, nfeId } = req.body;
    const usuarioId = req.usuario.id;

    let xml = xmlContent;

    if (!xml && nfeId) {
      const nfe = await NFe.findOne({ where: { id: nfeId, usuarioId } });
      if (!nfe) {
        return res.status(404).json({ error: 'NF-e não encontrada' });
      }
      xml = nfe.xmlAssinado || nfe.xmlContent;
    }

    if (!xml) {
      return res.status(400).json({ error: 'Informe xmlContent ou nfeId' });
    }

    const itens = await tributacaoService.extrairTributacao(xml);

    res.json({ totalItens: itens.length, itens });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

/**
 * Aplica dados tributários extraídos a um produto cadastrado
 */
const preencherProduto = async (req, res) => {
  try {
    const { produtoId, ncm, cfop, icms, ipi } = req.body;

    if (!produtoId) {
      return res.status(400).json({ error: 'produtoId é obrigatório' });
    }

    const produto = await tributacaoService.aplicarTributacaoProduto(
      req.usuario.id,
      produtoId,
      { ncm, cfop, icms, ipi }
    );

    res.json({ mensagem: 'Tributação aplicada ao produto', produto });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

/**
 * Atualiza manualmente a tributação de um produto (rota alternativa por :id)
 */
const atualizarTributacao = async (req, res) => {
  try {
    const produto = await tributacaoService.aplicarTributacaoProduto(
      req.usuario.id,
      req.params.id,
      req.body
    );

    res.json({ mensagem: 'Tributação atualizada', produto });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

/**
 * Resumo fiscal de um período
 */
const resumo = async (req, res) => {
  try {
    const { dataInicio, dataFim } = req.body.dataInicio ? req.body : req.query;
    const resultado = await tributacaoService.calcularResumoFiscal(req.usuario.id, { dataInicio, dataFim });
    res.json(resultado);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

/**
 * Gera o arquivo EFD-ICMS/IPI simplificado e retorna metadados + conteúdo
 */
const gerarEfd = async (req, res) => {
  try {
    const resultado = await spedService.gerarArquivoEFD(req.usuario.id, req.body);
    res.json(resultado);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

/**
 * Gera e baixa diretamente o arquivo EFD como texto (.txt)
 */
const downloadEfd = async (req, res) => {
  try {
    const { dataInicio, dataFim, cnpj, razaoSocial } = req.query;
    const resultado = await spedService.gerarArquivoEFD(req.usuario.id, { dataInicio, dataFim, cnpj, razaoSocial });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${resultado.nomeArquivo}"`);
    res.send(resultado.conteudo);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

/**
 * Sugere CFOP + CST/CSOSN para uma operação, a partir da finalidade do
 * item (do produto cadastrado ou informada diretamente) e do regime
 * tributário da empresa autenticada.
 */
const sugerirClassificacao = async (req, res) => {
  try {
    const { produtoId, tipoOperacao, ufOrigem, ufDestino } = req.body;
    let { finalidade } = req.body;

    if (produtoId) {
      const produto = await Produto.findOne({ where: { id: produtoId, usuarioId: req.usuario.id } });
      if (!produto) {
        return res.status(404).json({ error: 'Produto não encontrado' });
      }
      finalidade = finalidade || produto.finalidade;
    }

    const usuario = await Usuario.findByPk(req.usuario.id);

    const resultado = fiscalRulesService.sugerirClassificacaoFiscal({
      finalidade,
      tipoOperacao,
      ufOrigem,
      ufDestino,
      regimeTributario: usuario?.regimeTributario
    });

    res.json(resultado);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

/**
 * Importa o XML de uma NF-e de COMPRA (recebida de um fornecedor) e
 * reconhece automaticamente os produtos nela contidos: cria os que não
 * existem no catálogo (usando NCM/CFOP/CST extraídos do próprio XML) e
 * dá entrada em estoque nos que já existem, tudo em uma única transação.
 *
 * Idempotente: se a mesma chave de acesso já foi reconhecida antes
 * (já existem movimentações de estoque ligadas a ela), recusa reimportar
 * para não duplicar entrada de estoque.
 */
const importarNotaCompra = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const { xmlContent, itensFinalidade } = req.body;

    if (!xmlContent) {
      return res.status(400).json({ error: 'xmlContent é obrigatório' });
    }

    await validarXmlBasico(xmlContent);
    const cabecalho = await tributacaoService.extrairCabecalho(xmlContent);

    if (!cabecalho.chaveNFe) {
      return res.status(400).json({ error: 'Não foi possível extrair a chave de acesso do XML' });
    }

    let nfe = await NFe.findOne({ where: { chaveNFe: cabecalho.chaveNFe, usuarioId } });

    if (nfe) {
      const jaReconhecida = await MovimentacaoEstoque.findOne({ where: { nfeId: nfe.id } });
      if (jaReconhecida) {
        return res.status(409).json({ error: 'Essa NF-e já foi reconhecida anteriormente — os produtos já foram cadastrados/atualizados' });
      }
    } else {
      const itensParaValor = await tributacaoService.extrairTributacao(xmlContent);
      const valorTotal = Number(itensParaValor.reduce((soma, i) => soma + (i.valorProduto || 0), 0).toFixed(2));

      nfe = await NFe.create({
        usuarioId,
        chaveNFe: cabecalho.chaveNFe,
        cnpj: cabecalho.emitenteCnpj || '00000000000000',
        numero: cabecalho.numero || 0,
        serie: cabecalho.serie || 1,
        xmlContent,
        direcao: 'recebida',
        naturezaOperacao: cabecalho.naturezaOperacao || 'Compra',
        dataEmissao: cabecalho.dataEmissao ? new Date(cabecalho.dataEmissao) : new Date(),
        valor: valorTotal,
        // Campos nomeCliente/cpfCnpjCliente guardam "a outra parte da nota":
        // no fluxo de emissão é o cliente, aqui é o fornecedor emitente.
        nomeCliente: cabecalho.emitenteNome,
        cpfCnpjCliente: cabecalho.emitenteCnpj,
        statusSEFAZ: 'autorizada'
      });
    }

    const itens = await tributacaoService.extrairTributacao(xmlContent);
    const overrides = Array.isArray(itensFinalidade) ? itensFinalidade : [];

    const produtosCriados = [];
    const produtosAtualizados = [];

    await sequelize.transaction(async (t) => {
      for (const item of itens) {
        if (!item.codigo || !item.quantidade) continue;

        const override = overrides.find((o) => o.codigo === item.codigo);
        const finalidade = override?.finalidade || 'revenda';

        let produto = await Produto.findOne({ where: { usuarioId, codigo: item.codigo }, transaction: t });
        let criado = false;

        if (!produto) {
          produto = await Produto.create({
            usuarioId,
            codigo: item.codigo,
            descricao: item.descricao || item.codigo,
            finalidade,
            quantidade: 0,
            precoCusto: item.valorUnitario || 0,
            precoMedioCusto: item.valorUnitario || 0,
            precoVenda: 0,
            ncm: item.ncm,
            cfop: item.cfop,
            cstIcms: item.icms.cst,
            icmsAliquota: item.icms.aliquota,
            cstIpi: item.ipi.cst,
            ipiAliquota: item.ipi.aliquota
          }, { transaction: t });
          criado = true;
        }

        const { produto: produtoAtualizado } = await estoqueService.registrarEntrada(usuarioId, {
          produtoId: produto.id,
          quantidade: item.quantidade,
          precoUnitario: item.valorUnitario,
          motivo: `Entrada NF-e ${cabecalho.numero || ''} — ${cabecalho.emitenteNome || 'fornecedor'}`.trim(),
          nfeId: nfe.id
        }, t);

        (criado ? produtosCriados : produtosAtualizados).push(produtoAtualizado);
      }
    });

    res.status(201).json({
      mensagem: 'NF-e de compra reconhecida com sucesso',
      nfe,
      emitente: { nome: cabecalho.emitenteNome, cnpj: cabecalho.emitenteCnpj },
      totalItens: itens.length,
      produtosCriados,
      produtosAtualizados
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

/**
 * Busca novas notas direto no Ambiente Nacional da NF-e (protocolo
 * Distribuição DFe), usando o certificado ativo da empresa. Exige um
 * certificado A1 real — sem um, retorna erro claro (ver
 * sefazDistribuicaoService.js para o porquê).
 */
const buscarNaSefaz = async (req, res) => {
  try {
    const usuario = await Usuario.findByPk(req.usuario.id);
    if (!usuario.uf) {
      return res.status(400).json({ error: 'Configure a UF da empresa em "Minha empresa" antes de buscar na SEFAZ' });
    }

    const { ultimoNSU } = req.body;
    const resultado = await sefazDistribuicaoService.buscarNovasNotas(req.usuario.id, {
      cnpj: usuario.cnpj,
      uf: usuario.uf,
      ultimoNSU: ultimoNSU || '0'
    });

    res.json(resultado);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

module.exports = {
  extrair,
  preencherProduto,
  atualizarTributacao,
  resumo,
  gerarEfd,
  downloadEfd,
  sugerirClassificacao,
  importarNotaCompra,
  buscarNaSefaz
};
