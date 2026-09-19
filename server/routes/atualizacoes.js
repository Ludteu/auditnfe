const express = require('express');
const autenticacao = require('../middleware/autenticacao');
const { changelogSistema, marcosReformaTributaria, linksOficiais } = require('../data/atualizacoes');

const router = express.Router();

router.use(autenticacao);

/**
 * GET /api/atualizacoes
 * Changelog do sistema (real, do histórico de commits) + marcos
 * conhecidos da Reforma Tributária + links para as fontes oficiais.
 * Não é uma busca ao vivo no portal da NF-e — ver aviso em
 * server/data/atualizacoes.js sobre por que isso não é viável hoje.
 */
router.get('/', (req, res) => {
  res.json({ changelogSistema, marcosReformaTributaria, linksOficiais });
});

module.exports = router;
