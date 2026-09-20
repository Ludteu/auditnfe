const sequelize = require('../config/database');

const Usuario = require('./Usuario');
const NFe = require('./NFe');
const Certificado = require('./Certificado');
const Produto = require('./Produto');
const MovimentacaoEstoque = require('./MovimentacaoEstoque');
const Destinatario = require('./Destinatario');
const ItemNFe = require('./ItemNFe');
const InformeNFe = require('./InformeNFe');
const ContaMarketplace = require('./ContaMarketplace');
const PedidoMarketplace = require('./PedidoMarketplace');

module.exports = {
  sequelize,
  Usuario,
  NFe,
  Certificado,
  Produto,
  MovimentacaoEstoque,
  Destinatario,
  ItemNFe,
  InformeNFe,
  ContaMarketplace,
  PedidoMarketplace
};
