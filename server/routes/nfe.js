const express = require('express');
const nfeController = require('../controllers/nfeController');
const autenticacao = require('../middleware/autenticacao');

const router = express.Router();

// Proteger todas as rotas com autenticação
router.use(autenticacao);

/**
 * GET /api/nfe
 * Listar NF-es do usuário com filtros
 */
router.get('/', nfeController.listar);

/**
 * GET /api/nfe/buscar
 * Buscar NF-es por critérios específicos
 */
router.get('/buscar', nfeController.buscar);

/**
 * POST /api/nfe
 * Criar nova NF-e a partir de um XML já pronto (fluxo avançado/import)
 */
router.post('/', nfeController.criar);

/**
 * POST /api/nfe/emitir
 * Emitir NF-e a partir de destinatário + itens do catálogo — monta o XML,
 * sugere CFOP/CST/CSOSN automaticamente e baixa o estoque (ver EMISSAO.md)
 */
router.post('/emitir', nfeController.emitir);

/**
 * GET /api/nfe/:id
 * Obter detalhes de uma NF-e
 */
router.get('/:id', nfeController.obter);

/**
 * POST /api/nfe/:id/assinar
 * Assinar NF-e com certificado digital
 */
router.post('/:id/assinar', nfeController.assinar);

/**
 * POST /api/nfe/:id/enviar
 * Enviar NF-e para autorização na SEFAZ
 */
router.post('/:id/enviar', nfeController.enviar);

/**
 * GET /api/nfe/:chaveNFe/status
 * Consultar status de uma NF-e na SEFAZ
 */
router.get('/:chaveNFe/status', nfeController.consultarStatus);

/**
 * GET /api/nfe/:id/xml
 * Obter XML formatado da NF-e
 */
router.get('/:id/xml', nfeController.obterXml);

/**
 * GET /api/nfe/:id/danfe
 * Gerar o DANFE (PDF) da NF-e pra conferência
 */
router.get('/:id/danfe', nfeController.obterDanfe);

module.exports = router;
