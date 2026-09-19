const express = require('express');
const tributacaoController = require('../controllers/tributacaoController');
const autenticacao = require('../middleware/autenticacao');

const router = express.Router();

router.use(autenticacao);

/**
 * Classificação fiscal (CFOP/CST/CSOSN sugeridos)
 */
router.post('/classificacao/sugerir', tributacaoController.sugerirClassificacao);

/**
 * Importação de NF-e de compra (reconhecimento automático de produtos)
 */
router.post('/tributacao/importar-nfe-compra', tributacaoController.importarNotaCompra);

/**
 * Tributação
 */
router.post('/tributacao/extrair', tributacaoController.extrair);
router.post('/tributacao/produtos', tributacaoController.preencherProduto);
router.put('/tributacao/:id', tributacaoController.atualizarTributacao);
router.post('/tributacao/resumo', tributacaoController.resumo);
router.get('/tributacao/resumo', tributacaoController.resumo);

/**
 * SPED / EFD
 */
router.post('/sped/efd', tributacaoController.gerarEfd);
router.get('/sped/efd/download', tributacaoController.downloadEfd);

module.exports = router;
