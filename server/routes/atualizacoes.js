const express = require('express');
const autenticacao = require('../middleware/autenticacao');
const { changelogSistema, marcosReformaTributaria, linksOficiais } = require('../data/atualizacoes');
const InformeNFe = require('../models/InformeNFe');
const nfePortalService = require('../services/nfePortalService');

const router = express.Router();

router.use(autenticacao);

/**
 * GET /api/atualizacoes
 * Changelog do sistema (real, do histórico de commits) + marcos
 * conhecidos da Reforma Tributária + links para as fontes oficiais.
 * A lista de informes do portal da NF-e é separada — ver /portal-nfe.
 */
router.get('/', (req, res) => {
  res.json({ changelogSistema, marcosReformaTributaria, linksOficiais });
});

/**
 * GET /api/atualizacoes/portal-nfe
 * Lê o cache local (rápido, sem chamar o portal agora) dos informes já
 * vistos. O cache é populado pela verificação em background do servidor
 * (ver index.js) e por POST /portal-nfe/verificar.
 */
router.get('/portal-nfe', async (req, res) => {
  try {
    const informes = await InformeNFe.findAll({ order: [['data', 'DESC']], limit: 30 });
    res.json({ informes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/atualizacoes/portal-nfe/verificar
 * Busca AO VIVO na home do Portal da NF-e (ver nfePortalService.js) e
 * atualiza o cache. Retorna quais informes são novos desde a última vez.
 */
router.post('/portal-nfe/verificar', async (req, res) => {
  try {
    const resultado = await nfePortalService.verificarEAtualizarCache();
    res.json(resultado);
  } catch (error) {
    res.status(502).json({ error: `Não foi possível consultar o portal da NF-e agora: ${error.message}` });
  }
});

module.exports = router;
