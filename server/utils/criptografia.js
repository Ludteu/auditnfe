const crypto = require('crypto');

/**
 * Criptografia simétrica pra guardar a senha do certificado digital no banco
 * (antes ela nem era salva — vinha fixa do .env, o que quebrava silenciosamente
 * assim que alguém subia um certificado com senha diferente). Reaproveita o
 * JWT_SECRET como origem da chave, do mesmo jeito que mercadoLivreService já
 * faz pra assinar o `state` do OAuth — não precisa de mais uma variável de
 * ambiente só pra isso.
 */
const obterChave = () => crypto.scryptSync(process.env.JWT_SECRET || 'chave-insegura-padrao', 'auditnfe-certificados', 32);

const criptografar = (texto) => {
  const iv = crypto.randomBytes(12);
  const cifra = crypto.createCipheriv('aes-256-gcm', obterChave(), iv);
  const dados = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()]);
  const tag = cifra.getAuthTag();
  return Buffer.concat([iv, tag, dados]).toString('base64');
};

const descriptografar = (textoCriptografado) => {
  const buffer = Buffer.from(textoCriptografado, 'base64');
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const dados = buffer.subarray(28);
  const decifra = crypto.createDecipheriv('aes-256-gcm', obterChave(), iv);
  decifra.setAuthTag(tag);
  return Buffer.concat([decifra.update(dados), decifra.final()]).toString('utf8');
};

module.exports = { criptografar, descriptografar };
