const express = require('express');
const { validationResult, body } = require('express-validator');
const authController = require('../controllers/authController');
const autenticacao = require('../middleware/autenticacao');

const router = express.Router();

/**
 * POST /api/auth/registrar
 * Registrar novo usuário
 */
router.post('/registrar', [
  body('nome').notEmpty().withMessage('Nome é obrigatório'),
  body('email').isEmail().withMessage('Email inválido'),
  body('cnpj').isLength({ min: 14, max: 14 }).withMessage('CNPJ inválido'),
  body('senha').isLength({ min: 6 }).withMessage('Senha deve ter no mínimo 6 caracteres')
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
}, authController.registrar);

/**
 * POST /api/auth/login
 * Fazer login
 */
router.post('/login', [
  body('email').isEmail().withMessage('Email inválido'),
  body('senha').notEmpty().withMessage('Senha é obrigatória')
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
}, authController.login);

/**
 * GET /api/auth/validar
 * Validar token JWT
 */
router.get('/validar', autenticacao, authController.validarToken);

module.exports = router;
