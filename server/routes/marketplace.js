const express = require('express');
const marketplaceController = require('../controllers/marketplaceController');
const autenticacao = require('../middleware/autenticacao');

const router = express.Router();

/**
 * Rota PÚBLICA — precisa vir antes do router.use(autenticacao) abaixo.
 * É o Mercado Livre redirecionando o navegador de volta pra cá depois
 * da autorização; não há Bearer token nessa requisição, só o `state`
 * assinado que identifica o usuário (ver mercadoLivreService.js).
 */
router.get('/mercado-livre/callback', marketplaceController.callbackMercadoLivre);

router.use(autenticacao);

router.get('/contas', marketplaceController.listarContas);
router.get('/mercado-livre/autorizar', marketplaceController.autorizarMercadoLivre);
router.post('/mercado-livre/sincronizar', marketplaceController.sincronizarMercadoLivre);

router.get('/pedidos', marketplaceController.listarPedidos);
router.post('/pedidos/:id/emitir', marketplaceController.emitirNfeDoPedido);

module.exports = router;
