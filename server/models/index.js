const sequelize = require('../config/database');

const Usuario = require('./Usuario');
const NFe = require('./NFe');
const Certificado = require('./Certificado');
const Produto = require('./Produto');
const MovimentacaoEstoque = require('./MovimentacaoEstoque');

module.exports = {
  sequelize,
  Usuario,
  NFe,
  Certificado,
  Produto,
  MovimentacaoEstoque
};
