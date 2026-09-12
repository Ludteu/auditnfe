const jwt = require('jsonwebtoken');

/**
 * Middleware de autenticação com JWT
 */
const autenticar = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token não fornecido' });
    }

    const token = authHeader.substring(7);

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    req.usuario = {
      id: decoded.id,
      email: decoded.email
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado' });
    }
    
    return res.status(401).json({ error: 'Token inválido' });
  }
};

module.exports = autenticar;
