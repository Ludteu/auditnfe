const express = require('express');
const destinatarioController = require('../controllers/destinatarioController');
const autenticacao = require('../middleware/autenticacao');

const router = express.Router();

router.use(autenticacao);

router.post('/', destinatarioController.criar);
router.get('/', destinatarioController.listar);
router.get('/:id', destinatarioController.obter);
router.put('/:id', destinatarioController.atualizar);
router.delete('/:id', destinatarioController.remover);

module.exports = router;
