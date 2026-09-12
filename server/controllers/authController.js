const jwt = require('jsonwebtoken');
const Usuario = require('../models/Usuario');

/**
 * Registrar novo usuário
 */
const registrar = async (req, res) => {
  try {
    const { nome, email, cnpj, senha, razaoSocial } = req.body;

    // Validar campos obrigatórios
    if (!nome || !email || !cnpj || !senha) {
      return res.status(400).json({ 
        error: 'Nome, email, CNPJ e senha são obrigatórios' 
      });
    }

    // Verificar se usuário já existe
    const usuarioExistente = await Usuario.findOne({ 
      where: { email } 
    });
    if (usuarioExistente) {
      return res.status(409).json({ 
        error: 'Email já cadastrado' 
      });
    }

    // Criar usuário
    const usuario = await Usuario.create({
      nome,
      email,
      cnpj,
      senha,
      razaoSocial
    });

    // Gerar token
    const token = jwt.sign(
      { id: usuario.id, email: usuario.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    res.status(201).json({
      mensagem: 'Usuário registrado com sucesso',
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Login de usuário
 */
const login = async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ 
        error: 'Email e senha são obrigatórios' 
      });
    }

    // Buscar usuário
    const usuario = await Usuario.findOne({ where: { email } });
    if (!usuario) {
      return res.status(401).json({ 
        error: 'Email ou senha inválidos' 
      });
    }

    // Verificar senha
    const senhaValida = await usuario.verificarSenha(senha);
    if (!senhaValida) {
      return res.status(401).json({ 
        error: 'Email ou senha inválidos' 
      });
    }

    // Gerar token
    const token = jwt.sign(
      { id: usuario.id, email: usuario.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    res.json({
      mensagem: 'Login realizado com sucesso',
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        cnpj: usuario.cnpj
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Validar token
 */
const validarToken = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Token não fornecido' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const usuario = await Usuario.findByPk(decoded.id);

    if (!usuario) {
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }

    res.json({
      valido: true,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email
      }
    });
  } catch (error) {
    res.status(401).json({ error: 'Token inválido' });
  }
};

module.exports = {
  registrar,
  login,
  validarToken
};
