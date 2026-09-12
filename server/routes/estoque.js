const express = require('express');
const estoqueController = require('../controllers/estoqueController');
const autenticacao = require('../middleware/autenticacao');

const router = express.Router();

router.use(autenticacao);

/**
 * Produtos
 */
router.post('/produtos', estoqueController.criarProduto);
router.get('/produtos', estoqueController.listarProdutos);
router.get('/produtos/:id', estoqueController.obterProduto);
router.put('/produtos/:id', estoqueController.atualizarProduto);
router.delete('/produtos/:id', estoqueController.removerProduto);

/**
 * Movimentações
 */
router.post('/entrada', estoqueController.entrada);
router.post('/saida', estoqueController.saida);
router.post('/ajuste', estoqueController.ajuste);

/**
 * Consultas
 */
router.get('/alertas', estoqueController.alertas);
router.get('/historico', estoqueController.historico);
router.get('/relatorio', estoqueController.relatorio);

module.exports = router;
