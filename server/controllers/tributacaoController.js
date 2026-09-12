const NFe = require('../models/NFe');
const tributacaoService = require('../services/tributacaoService');
const spedService = require('../services/spedService');

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

module.exports = {
  extrair,
  preencherProduto,
  atualizarTributacao,
  resumo,
  gerarEfd,
  downloadEfd
};
